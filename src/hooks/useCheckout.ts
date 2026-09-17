/**
 * useCheckout.ts — data + every mutation behind the checkout screen
 * (`app/checkout/index.tsx`), a single scroll from cart review to a placed order.
 *
 * Load:  GET /api/checkout/summary  → address + lines + bill + "Complete your
 *        meal" sections, all server-computed.
 * Cart edits: the qty stepper and "Complete your meal" both go straight back to
 *        the live cart endpoints (src/services/cart.ts) and fold the fresh
 *        `{ cart, bill }` snapshot into `summary` in place — no follow-up GET.
 * Act:   `pay()` runs the whole thing —
 *          1. POST /api/orders/checkout   (places the order; idempotent)
 *          2. for an online method, run the resolved gateway
 *             (src/services/payments.ts) — simulated today, Razorpay once wired
 *          3. "Pay on delivery" stops after step 1 (already `pending_cod`)
 *
 * Mirrors useCartScreen: a mounted guard, a request-id guard on the load, and
 * the app-wide severity split (`ApiError` 4xx → warn, 5xx / unreachable →
 * reportError). A 401 surfaces as `notSignedIn`, not an error.
 *
 * The placed order is kept across a failed payment so a retry re-runs only the
 * gateway, never a second checkout — unless the customer switches between an
 * online method and COD, which needs a fresh order (different `paymentMethod`).
 *
 * `overrides` carries the screen's live picks — the address the customer chose
 * on `app/address` (if different from the account default), tip, delivery
 * instructions, cutlery / cooking / veg-fleet — read straight from component
 * state (no route params: it's one screen now) and folded into
 * `POST /api/orders/checkout`. Omitted → the server bills the account default
 * with no extras.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useCart as useCartCache } from '../context/CartContext';
import { logger, reportError } from '../lib/logger';
import { ApiError } from '../services/api';
import {
  addItemToCart,
  removeCartLine,
  toCartCachePayload,
  updateCartLine,
  type CartSnapshot,
} from '../services/cart';
import {
  getCheckoutSummary,
  placeOrder,
  type CheckoutSummary,
  type PlacedOrder,
} from '../services/checkout';
import {
  DEFAULT_METHOD_ID,
  getMethod,
  newIdempotencyKey,
  PaymentError,
  runPayment,
  type PaymentMethodId,
} from '../services/payments';

export type CheckoutPhase =
  | 'loading'
  | 'ready'
  | 'placing'
  | 'paying'
  | 'done'
  | 'failed';

/** Choices made on the checkout review page, folded into the placed order. */
export interface CheckoutOverrides {
  /** Saved-address id the customer picked; falls back to the summary default. */
  addressId?: string;
  tip?: number;
  deliveryInstructions?: string;
  cookingRequests?: boolean;
  extraCutlery?: boolean;
  vegFleetOptIn?: boolean;
}

interface UseCheckoutResult {
  summary: CheckoutSummary | null;
  isLoading: boolean;
  /** Load-time failure (the pay flow uses `actionError`). */
  error: string | null;
  notSignedIn: boolean;
  phase: CheckoutPhase;
  selectedMethodId: PaymentMethodId;
  selectMethod: (id: PaymentMethodId) => void;
  /** A pay attempt failed; the same order can be retried. */
  actionError: string | null;
  /** Set once the order is placed AND paid (or placed, for COD). */
  placedOrderId: string | null;
  /** Whether the placed order was a pay-on-delivery one. */
  placedIsCod: boolean;
  refresh: () => Promise<void>;
  /** Place + pay. Safe to call again after a failure. */
  pay: () => Promise<void>;
  /** Cart-line ids with an in-flight quantity / remove call. */
  pendingLineIds: Set<string>;
  /** A cart-line or "Complete your meal" add mutation failed. */
  lineError: string | null;
  /** Set an absolute quantity for a cart line; `0` removes it. */
  setLineQty: (lineId: string, qty: number) => Promise<void>;
  removeLine: (lineId: string) => Promise<void>;
  /** Menu item id currently being added from "Complete your meal". */
  addingMealItemId: string | null;
  /** Add one "Complete your meal" pick straight to the cart. */
  addMealItem: (menuItemId: string) => Promise<void>;
}

function messageFor(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

export function useCheckout(overrides: CheckoutOverrides = {}): UseCheckoutResult {
  const { isAuthenticated, session } = useAuth();
  const hasServerToken =
    isAuthenticated && !session?.bypassed && !!session?.accessToken;

  // Destructure to primitives so the `pay` callback's deps stay stable even
  // though the screen hands a fresh `overrides` object in every render.
  const {
    addressId: overrideAddressId,
    tip: overrideTip,
    deliveryInstructions: overrideInstructions,
    cookingRequests: overrideCookingRequests,
    extraCutlery: overrideExtraCutlery,
    vegFleetOptIn: overrideVegFleetOptIn,
  } = overrides;

  const [summary, setSummary] = useState<CheckoutSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notSignedIn, setNotSignedIn] = useState(false);

  const [phase, setPhase] = useState<CheckoutPhase>('loading');
  const [selectedMethodId, setSelectedMethodId] = useState<PaymentMethodId>(DEFAULT_METHOD_ID);
  const [actionError, setActionError] = useState<string | null>(null);
  const [placedOrderId, setPlacedOrderId] = useState<string | null>(null);
  const [placedIsCod, setPlacedIsCod] = useState(false);

  const { syncFromServer } = useCartCache();
  const [pendingLineIds, setPendingLineIds] = useState<Set<string>>(new Set());
  const [lineError, setLineError] = useState<string | null>(null);
  const [addingMealItemId, setAddingMealItemId] = useState<string | null>(null);

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const requestRef = useRef(0);
  // The placed order, held so a failed payment retries the gateway only. `wire`
  // is remembered alongside it so switching to/from COD forces a fresh order.
  const placedRef = useRef<{ order: PlacedOrder; wire: 'cod' | 'online' } | null>(null);
  const idempotencyRef = useRef<string>(newIdempotencyKey());

  const load = useCallback(async () => {
    const requestId = ++requestRef.current;
    const isCurrent = () => mountedRef.current && requestRef.current === requestId;

    if (!hasServerToken) {
      if (isCurrent()) {
        setNotSignedIn(true);
        setSummary(null);
        setError(null);
        setIsLoading(false);
        setPhase('ready');
      }
      return;
    }

    setIsLoading(true);
    setError(null);
    setNotSignedIn(false);
    setPhase('loading');

    try {
      const next = await getCheckoutSummary();
      if (!isCurrent()) return;
      setSummary(next);
      setPhase('ready');
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        logger.warn('checkout', 'Checkout needs a signed-in customer — 401', { code: err.code });
        if (isCurrent()) {
          setNotSignedIn(true);
          setSummary(null);
          setPhase('ready');
        }
      } else if (err instanceof ApiError && err.status >= 400 && err.status < 500) {
        logger.warn('checkout', `Checkout summary unavailable — ${err.status} ${err.code}`, {
          status: err.status,
          code: err.code,
        });
        if (isCurrent()) {
          setError(messageFor(err, 'Could not load your order.'));
          setPhase('failed');
        }
      } else {
        reportError('checkout', 'Failed to load checkout summary', err);
        if (isCurrent()) {
          setError(messageFor(err, 'Could not load your order.'));
          setPhase('failed');
        }
      }
    } finally {
      if (isCurrent()) setIsLoading(false);
    }
  }, [hasServerToken]);

  useEffect(() => {
    load();
  }, [load]);

  const selectMethod = useCallback((id: PaymentMethodId) => {
    setSelectedMethodId(id);
    setActionError(null);
  }, []);

  // Folds a fresh cart mutation's `{ cart, bill }` snapshot into the current summary —
  // the mutation endpoints (src/services/cart.ts) return the exact same reshaped
  // `cart`/`bill` this screen already renders, so no follow-up GET is needed. Only the
  // cart-derived fields move; address / mealSections / vegFleetEligible are untouched
  // until the next full `refresh()`.
  const mergeCartSnapshot = useCallback((snap: CartSnapshot) => {
    setSummary((prev) =>
      prev
        ? {
            ...prev,
            restaurant: snap.cart.restaurant,
            restaurantName: snap.cart.restaurant?.name ?? prev.restaurantName,
            lines: snap.cart.lines,
            itemCount: snap.cart.itemCount,
            bill: snap.bill,
            hasItems: snap.cart.lines.length > 0,
          }
        : prev,
    );
    syncFromServer(toCartCachePayload(snap));
  }, [syncFromServer]);

  const markLinePending = useCallback((lineId: string, on: boolean) => {
    setPendingLineIds((prev) => {
      const next = new Set(prev);
      if (on) next.add(lineId);
      else next.delete(lineId);
      return next;
    });
  }, []);

  const runLineMutation = useCallback(
    async (lineId: string, op: () => Promise<CartSnapshot>) => {
      setLineError(null);
      markLinePending(lineId, true);
      try {
        mergeCartSnapshot(await op());
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          logger.warn('checkout', 'Cart-line mutation rejected — 401', { code: err.code });
          if (mountedRef.current) setNotSignedIn(true);
        } else if (err instanceof ApiError && err.status >= 400 && err.status < 500) {
          logger.warn('checkout', `Cart-line mutation rejected — ${err.status} ${err.code}`, {
            status: err.status,
            code: err.code,
          });
          if (mountedRef.current) setLineError(messageFor(err, 'That change didn’t go through.'));
        } else {
          reportError('checkout', 'Cart-line mutation failed', err, { lineId });
          if (mountedRef.current) setLineError('Something went wrong. Please try again.');
        }
      } finally {
        if (mountedRef.current) markLinePending(lineId, false);
      }
    },
    [mergeCartSnapshot, markLinePending],
  );

  const setLineQty = useCallback(
    (lineId: string, qty: number) => runLineMutation(lineId, () => updateCartLine(lineId, qty)),
    [runLineMutation],
  );

  const removeLine = useCallback(
    (lineId: string) => runLineMutation(lineId, () => removeCartLine(lineId)),
    [runLineMutation],
  );

  const addMealItem = useCallback(
    async (menuItemId: string) => {
      setLineError(null);
      setAddingMealItemId(menuItemId);
      try {
        mergeCartSnapshot(await addItemToCart({ menuItemId, qty: 1, selectedOptions: [] }));
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          logger.warn('checkout', 'Add from "Complete your meal" rejected — 401', { code: err.code });
          if (mountedRef.current) setNotSignedIn(true);
        } else if (err instanceof ApiError && err.status === 400) {
          // Needs customization (option groups) — the screen sends the customer to
          // the item screen instead when optionGroupCount > 0, so this is unexpected.
          logger.warn('checkout', 'Add from "Complete your meal" needs customization', {
            code: err.code,
          });
          if (mountedRef.current) setLineError('That dish needs a customization first.');
        } else if (err instanceof ApiError && err.status >= 400 && err.status < 500) {
          logger.warn('checkout', `Add from "Complete your meal" rejected — ${err.status} ${err.code}`, {
            status: err.status,
            code: err.code,
          });
          if (mountedRef.current) setLineError(messageFor(err, 'Couldn’t add that item.'));
        } else {
          reportError('checkout', 'Add from "Complete your meal" failed', err, { menuItemId });
          if (mountedRef.current) setLineError('Something went wrong. Please try again.');
        }
      } finally {
        if (mountedRef.current) setAddingMealItemId(null);
      }
    },
    [mergeCartSnapshot],
  );

  const pay = useCallback(async () => {
    if (!summary || !summary.hasItems) {
      setActionError('Your cart is empty.');
      return;
    }
    if (!summary.address) {
      setActionError('Add a delivery address to continue.');
      return;
    }

    const method = getMethod(selectedMethodId);
    setActionError(null);

    // ── 1. Place the order (unless we already have a matching one) ──
    let placed = placedRef.current;
    if (!placed || placed.wire !== method.wire) {
      // A fresh order needs a fresh idempotency key.
      if (placed && placed.wire !== method.wire) idempotencyRef.current = newIdempotencyKey();
      setPhase('placing');
      try {
        const order = await placeOrder({
          addressId: overrideAddressId ?? summary.address._id,
          paymentMethod: method.wire,
          deliveryInstructions: overrideInstructions,
          cookingRequests: overrideCookingRequests,
          extraCutlery: overrideExtraCutlery,
          tip: overrideTip,
          vegFleetOptIn: overrideVegFleetOptIn,
          idempotencyKey: idempotencyRef.current,
        });
        if (!mountedRef.current) return;
        placed = { order, wire: method.wire };
        placedRef.current = placed;
      } catch (err) {
        if (!mountedRef.current) return;
        if (err instanceof ApiError && err.status === 401) {
          setNotSignedIn(true);
          setPhase('failed');
        } else if (err instanceof ApiError && (err.code === 'CART_PRICE_CHANGED' || err.code === 'ORDER_ITEM_UNAVAILABLE')) {
          logger.warn('checkout', `Checkout blocked — ${err.code}`, { code: err.code });
          setActionError(messageFor(err, 'Your cart changed. Go back and review it.'));
          setPhase('failed');
        } else if (err instanceof ApiError && err.status >= 400 && err.status < 500) {
          logger.warn('checkout', `Checkout rejected — ${err.status} ${err.code}`, {
            status: err.status,
            code: err.code,
          });
          setActionError(messageFor(err, 'Could not place your order.'));
          setPhase('failed');
        } else {
          reportError('checkout', 'Order placement failed', err);
          setActionError('Something went wrong placing your order. Please try again.');
          setPhase('failed');
        }
        return;
      }
    }

    // ── 2. COD is done at placement ──
    if (method.wire === 'cod') {
      setPlacedOrderId(placed.order.orderId);
      setPlacedIsCod(true);
      setPhase('done');
      return;
    }

    // ── 3. Run the payment gateway (simulated today, Razorpay once wired) ──
    setPhase('paying');
    try {
      const outcome = await runPayment({
        orderId: placed.order.orderId,
        amountRupees: placed.order.grandTotal || summary.bill.grandTotal,
        method,
        gatewayOrder: placed.order.gatewayOrder,
        contact: {
          name: summary.address.contactName ?? null,
          phone: summary.address.contactPhone ?? null,
        },
      });
      if (!mountedRef.current) return;
      if (outcome.status === 'paid') {
        setPlacedOrderId(placed.order.orderId);
        setPlacedIsCod(false);
        setPhase('done');
      } else {
        setActionError('The payment did not go through. Please try again.');
        setPhase('failed');
      }
    } catch (err) {
      if (!mountedRef.current) return;
      if (err instanceof PaymentError) {
        logger.warn('checkout', 'Payment gateway reported a failure', { retryable: err.retryable });
        setActionError(err.message);
        setPhase('failed');
      } else if (err instanceof ApiError && err.status >= 400 && err.status < 500) {
        logger.warn('checkout', `Payment call rejected — ${err.status} ${err.code}`, {
          status: err.status,
          code: err.code,
        });
        setActionError(messageFor(err, 'The payment could not be confirmed.'));
        setPhase('failed');
      } else {
        reportError('checkout', 'Payment failed', err);
        setActionError('Something went wrong with the payment. Please try again.');
        setPhase('failed');
      }
    }
  }, [
    summary,
    selectedMethodId,
    overrideAddressId,
    overrideTip,
    overrideInstructions,
    overrideCookingRequests,
    overrideExtraCutlery,
    overrideVegFleetOptIn,
  ]);

  return {
    summary,
    isLoading,
    error,
    notSignedIn,
    phase,
    selectedMethodId,
    selectMethod,
    actionError,
    placedOrderId,
    placedIsCod,
    refresh: load,
    pay,
    pendingLineIds,
    lineError,
    setLineQty,
    removeLine,
    addingMealItemId,
    addMealItem,
  };
}
