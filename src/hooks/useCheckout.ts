/**
 * useCheckout.ts — data + every mutation behind the checkout screen
 * (`app/checkout/index.tsx`), a single scroll from cart review to a placed order.
 *
 * Load:  GET /api/checkout/summary?addressId&tip → address + lines + bill +
 *        "Complete your meal" sections, all server-computed, priced for the
 *        address the customer picked and the tip they chose. Changing either
 *        re-prices quietly (`isRepricing`) — the total shown is always the total
 *        the server will charge, never client arithmetic.
 * Cart edits: the qty stepper and "Complete your meal" go straight to the live
 *        cart endpoints (src/services/cart.ts); their lines fold into `summary` at
 *        once, then the bill is re-fetched for this address + tip (the cart
 *        endpoints price the default address with no tip).
 * Act:   `pay()` runs the whole thing —
 *          1. POST /api/orders/checkout   (Idempotency-Key; `expectedTotalPaise` =
 *             the total on screen → 409 PRICE_CHANGED re-prices and asks again)
 *          2. "Pay on delivery" stops here (already `pending_cod`)
 *          3. online: the resolved gateway (src/services/payments.ts) via
 *             `payAndConfirm`, which polls the payment status when the outcome is
 *             unclear — a webhook may have settled it.
 *        Placing an order empties the server cart, so once an online order exists
 *        a later tap never places another: `retryPayment()` (and `pay()`) re-run
 *        only the payment, through POST …/payment/retry when a new Razorpay order
 *        is needed. A payment that doesn't confirm leaves `phase: 'pending'` with
 *        the reason — the order is never cancelled from here.
 *
 * Idempotency: one key per set of order details; a tap that failed on the
 * network and is retried unchanged re-sends the same key (so it can't place a
 * second order), while changing the tip / address / method mints a fresh one.
 *
 * Mirrors useCartScreen: a mounted guard, a request-id guard on the load, and
 * the app-wide severity split (`ApiError` 4xx → warn, 5xx / unreachable →
 * reportError). A 401 surfaces as `notSignedIn`, not an error.
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
  getPaymentStatus,
  newIdempotencyKey,
  payAndConfirm,
  PaymentError,
  retryOrderPayment,
  type GatewayOrder,
  type PaymentMethodId,
} from '../services/payments';
import { loadAppConfig, useAppConfig } from './useAppConfig';

export type CheckoutPhase =
  | 'loading'
  | 'ready'
  | 'placing'
  | 'paying'
  /** An online order exists but its payment isn't confirmed — offer "Retry payment". */
  | 'pending'
  | 'done'
  | 'failed';

/** Choices made on the checkout review page, folded into the placed order. */
export interface CheckoutOverrides {
  /** Saved-address id the customer picked; falls back to the summary default. */
  addressId?: string;
  /** Rupees. Re-prices the summary; the server adds it, never the client. */
  tip?: number;
  deliveryInstructions?: string;
  cookingRequests?: boolean;
  extraCutlery?: boolean;
  vegFleetOptIn?: boolean;
}

export interface PendingPayment {
  orderId: string;
  /** Why it isn't confirmed — shown above "Retry payment". */
  message: string;
  /** The order can be paid again from here. */
  canRetry: boolean;
}

interface UseCheckoutResult {
  summary: CheckoutSummary | null;
  isLoading: boolean;
  /** The bill is being re-priced (tip / address / cart change) — hold the Pay button. */
  isRepricing: boolean;
  /** Load-time failure (the pay flow uses `actionError`). */
  error: string | null;
  notSignedIn: boolean;
  phase: CheckoutPhase;
  selectedMethodId: PaymentMethodId;
  selectMethod: (id: PaymentMethodId) => void;
  /** Cash on delivery is switched on — otherwise hide "Pay on delivery". */
  codEnabled: boolean;
  /** A pay attempt failed (placement or payment). */
  actionError: string | null;
  /** Set while an online order waits for its payment. */
  pendingPayment: PendingPayment | null;
  /** An order has been placed from this screen (paid or not) — details are locked. */
  orderPlaced: boolean;
  /** Set once the order is placed AND paid (or placed, for COD). */
  placedOrderId: string | null;
  /** Whether the placed order was a pay-on-delivery one. */
  placedIsCod: boolean;
  /** Paise — what the placed order charged (for the confirmation screen). */
  placedTotalPaise: number | null;
  refresh: () => Promise<void>;
  /** Place + pay; after a placed-but-unpaid order, pays that order again. */
  pay: () => Promise<void>;
  /** Pay the already-placed order again. */
  retryPayment: () => Promise<void>;
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

const rupees = (paise: number) => '₹' + (paise / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 });

export function useCheckout(overrides: CheckoutOverrides = {}): UseCheckoutResult {
  const { isAuthenticated, session } = useAuth();
  const hasServerToken =
    isAuthenticated && !session?.bypassed && !!session?.accessToken;

  // Destructure to primitives so the callbacks' deps stay stable even though the
  // screen hands a fresh `overrides` object in every render.
  const {
    addressId: overrideAddressId,
    tip: overrideTip,
    deliveryInstructions: overrideInstructions,
    cookingRequests: overrideCookingRequests,
    extraCutlery: overrideExtraCutlery,
    vegFleetOptIn: overrideVegFleetOptIn,
  } = overrides;
  const tip = typeof overrideTip === 'number' && overrideTip > 0 ? overrideTip : 0;

  const { config } = useAppConfig();
  const codEnabled = config?.payments.codEnabled === true;

  const [summary, setSummary] = useState<CheckoutSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRepricing, setIsRepricing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notSignedIn, setNotSignedIn] = useState(false);

  const [phase, setPhase] = useState<CheckoutPhase>('loading');
  const [selectedMethodId, setSelectedMethodId] = useState<PaymentMethodId>(DEFAULT_METHOD_ID);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pendingPayment, setPendingPayment] = useState<PendingPayment | null>(null);
  const [placedOrderId, setPlacedOrderId] = useState<string | null>(null);
  const [placedIsCod, setPlacedIsCod] = useState(false);
  const [placedTotalPaise, setPlacedTotalPaise] = useState<number | null>(null);

  const { syncFromServer, clear: clearCartCache } = useCartCache();
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
  // The placed online order, held so every later tap pays it rather than placing again.
  const placedRef = useRef<PlacedOrder | null>(null);
  // The Idempotency-Key and the order details it was minted for.
  const attemptRef = useRef<{ key: string; fingerprint: string } | null>(null);

  // COD switched off (or never on): never leave it selected.
  useEffect(() => {
    if (!codEnabled && getMethod(selectedMethodId).wire === 'cod') setSelectedMethodId(DEFAULT_METHOD_ID);
  }, [codEnabled, selectedMethodId]);

  const load = useCallback(
    async ({ quiet = false }: { quiet?: boolean } = {}) => {
      const requestId = ++requestRef.current;
      const isCurrent = () => mountedRef.current && requestRef.current === requestId;

      if (!hasServerToken) {
        if (isCurrent()) {
          setNotSignedIn(true);
          setSummary(null);
          setError(null);
          setIsLoading(false);
          setIsRepricing(false);
          setPhase('ready');
        }
        return;
      }

      if (quiet) {
        setIsRepricing(true);
      } else {
        setIsLoading(true);
        setError(null);
        setNotSignedIn(false);
        setPhase('loading');
      }

      try {
        const next = await getCheckoutSummary({ addressId: overrideAddressId, tip });
        if (!isCurrent()) return;
        setSummary(next);
        if (!quiet) setPhase('ready');
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          logger.warn('checkout', 'Checkout needs a signed-in customer — 401', { code: err.code });
          if (isCurrent()) {
            setNotSignedIn(true);
            setSummary(null);
            setPhase('ready');
          }
        } else if (quiet && err instanceof ApiError && err.code === 'TIP_TOO_HIGH') {
          if (isCurrent()) setActionError(messageFor(err, 'That tip is too high.'));
        } else if (err instanceof ApiError && err.status >= 400 && err.status < 500) {
          logger.warn('checkout', `Checkout summary unavailable — ${err.status} ${err.code}`, {
            status: err.status,
            code: err.code,
          });
          if (isCurrent()) {
            if (quiet) {
              setActionError(messageFor(err, 'Couldn’t update the bill.'));
            } else {
              setError(messageFor(err, 'Could not load your order.'));
              setPhase('failed');
            }
          }
        } else {
          reportError('checkout', 'Failed to load checkout summary', err);
          if (isCurrent()) {
            if (quiet) {
              setActionError('Couldn’t update the bill. Check your connection and try again.');
            } else {
              setError(messageFor(err, 'Could not load your order.'));
              setPhase('failed');
            }
          }
        }
      } finally {
        if (isCurrent()) {
          setIsLoading(false);
          setIsRepricing(false);
        }
      }
    },
    [hasServerToken, overrideAddressId, tip],
  );

  // First load, then a quiet re-price whenever the address or tip changes — but
  // not once an order exists (the server cart is empty from then on).
  const loadedOnceRef = useRef(false);
  useEffect(() => {
    if (placedRef.current) return;
    const quiet = loadedOnceRef.current;
    loadedOnceRef.current = true;
    load({ quiet });
  }, [load]);

  const selectMethod = useCallback((id: PaymentMethodId) => {
    setSelectedMethodId(id);
    setActionError(null);
  }, []);

  // Folds a cart mutation's lines into the summary at once, then re-fetches the bill for
  // this address + tip — the mutation's own bill prices the default address with no tip.
  const mergeCartSnapshot = useCallback(
    (snap: CartSnapshot) => {
      setSummary((prev) =>
        prev
          ? {
              ...prev,
              restaurant: snap.cart.restaurant,
              restaurantName: snap.cart.restaurant?.name ?? prev.restaurantName,
              lines: snap.cart.lines,
              itemCount: snap.cart.itemCount,
              hasItems: snap.cart.lines.length > 0,
            }
          : prev,
      );
      syncFromServer(toCartCachePayload(snap));
      load({ quiet: true });
    },
    [syncFromServer, load],
  );

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

  const finishPaid = useCallback((order: PlacedOrder, totalPaise: number | null) => {
    setPendingPayment(null);
    setPlacedOrderId(order.orderId);
    setPlacedIsCod(false);
    setPlacedTotalPaise(totalPaise);
    setPhase('done');
  }, []);

  // Pays an online order already placed: with `gatewayOrder` when we have one, else
  // through POST …/payment/retry. Settles the phase to done / pending.
  const payPlaced = useCallback(
    async (order: PlacedOrder, gatewayOrder: GatewayOrder | null, totalPaise: number | null) => {
      const method = getMethod(selectedMethodId);
      setActionError(null);
      setPhase('paying');

      let simulationEnabled = config?.payments.paymentSimulationEnabled === true;
      try {
        if (!config) simulationEnabled = (await loadAppConfig()).payments.paymentSimulationEnabled;
      } catch {
        /* config unreachable — Razorpay still works; the simulated path just stays off */
      }

      try {
        let gw = gatewayOrder;
        if (!gw) {
          try {
            gw = (await retryOrderPayment(order.orderId)).gatewayOrder;
          } catch (err) {
            if (err instanceof ApiError && (err.code === 'ALREADY_PAID' || err.code === 'PAYMENT_ALREADY_RECEIVED')) {
              const status = await getPaymentStatus(order.orderId).catch(() => null);
              if (!mountedRef.current) return;
              if (status?.paid) {
                finishPaid(order, totalPaise);
              } else {
                setPendingPayment({
                  orderId: order.orderId,
                  message: 'Your payment is being confirmed. This usually takes a few seconds.',
                  canRetry: false,
                });
                setPhase('pending');
              }
              return;
            }
            throw err;
          }
          if (!mountedRef.current) return;
          placedRef.current = { ...order, gatewayOrder: gw };
        }

        const result = await payAndConfirm({
          orderId: order.orderId,
          amountRupees: (gw?.amount ?? totalPaise ?? 0) / 100,
          method,
          gatewayOrder: gw,
          simulationEnabled,
          contact: {
            name: summary?.address?.contactName ?? null,
            phone: summary?.address?.contactPhone ?? null,
          },
        });
        if (!mountedRef.current) return;
        if (result.status === 'paid') {
          finishPaid(order, totalPaise);
        } else {
          logger.warn('checkout', 'Payment not confirmed — showing retry', { canRetry: result.canRetry });
          setPendingPayment({ orderId: order.orderId, message: result.message, canRetry: result.canRetry });
          setPhase('pending');
        }
      } catch (err) {
        if (!mountedRef.current) return;
        let message: string;
        let canRetry = true;
        if (err instanceof PaymentError) {
          logger.warn('checkout', 'Payment unavailable in this build', { kind: err.kind });
          message = err.message;
          canRetry = err.retryable;
        } else if (err instanceof ApiError && err.status === 401) {
          setNotSignedIn(true);
          message = 'Sign in again to finish paying — your order is saved.';
        } else if (err instanceof ApiError && err.code === 'ORDER_CANCELLED') {
          message = 'This order was cancelled, so there is nothing to pay.';
          canRetry = false;
        } else if (err instanceof ApiError && err.status >= 400 && err.status < 500) {
          logger.warn('checkout', `Payment call rejected — ${err.status} ${err.code}`, {
            status: err.status,
            code: err.code,
          });
          message = messageFor(err, 'The payment could not be started.');
        } else {
          reportError('checkout', 'Payment failed', err);
          message = 'We couldn’t start the payment. Check your connection and try again.';
        }
        setPendingPayment({ orderId: order.orderId, message, canRetry });
        setPhase('pending');
      }
    },
    [selectedMethodId, config, summary?.address?.contactName, summary?.address?.contactPhone, finishPaid],
  );

  const retryPayment = useCallback(async () => {
    const order = placedRef.current;
    if (!order) return;
    await payPlaced(order, order.gatewayOrder, placedTotalPaise);
  }, [payPlaced, placedTotalPaise]);

  const pay = useCallback(async () => {
    // An online order already exists (the cart is empty now) — pay it, never place another.
    if (placedRef.current) {
      await retryPayment();
      return;
    }
    if (!summary || !summary.hasItems) {
      setActionError('Your cart is empty.');
      return;
    }
    if (!summary.address) {
      setActionError('Add a delivery address to continue.');
      return;
    }
    if (summary.deliveryIssue) {
      setActionError(summary.deliveryIssueMessage ?? 'Delivery to this address isn’t available.');
      return;
    }
    if (isRepricing) return;

    const method = getMethod(selectedMethodId);
    if (method.wire === 'cod' && !codEnabled) {
      setActionError('Pay on delivery isn’t available right now. Please pay online.');
      return;
    }
    const expectedTotalPaise = summary.bill.charges?.grandTotalPaise;
    setActionError(null);

    // One Idempotency-Key per set of order details (see the file header).
    const fingerprint = JSON.stringify([
      method.wire,
      overrideAddressId ?? summary.address._id,
      tip,
      overrideInstructions ?? '',
      !!overrideCookingRequests,
      !!overrideExtraCutlery,
      !!overrideVegFleetOptIn,
      expectedTotalPaise ?? null,
    ]);
    if (!attemptRef.current || attemptRef.current.fingerprint !== fingerprint) {
      attemptRef.current = { key: newIdempotencyKey(), fingerprint };
    }

    // ── 1. Place the order ──
    setPhase('placing');
    let order: PlacedOrder;
    try {
      order = await placeOrder({
        addressId: overrideAddressId ?? summary.address._id,
        paymentMethod: method.wire,
        deliveryInstructions: overrideInstructions,
        cookingRequests: overrideCookingRequests,
        extraCutlery: overrideExtraCutlery,
        tip,
        vegFleetOptIn: overrideVegFleetOptIn,
        expectedTotalPaise,
        idempotencyKey: attemptRef.current.key,
      });
      if (!mountedRef.current) return;
    } catch (err) {
      if (!mountedRef.current) return;
      if (err instanceof ApiError && err.status === 401) {
        setNotSignedIn(true);
        setPhase('failed');
      } else if (err instanceof ApiError && err.code === 'PRICE_CHANGED') {
        const now = (err.details as { charges?: { grandTotal?: number } } | null)?.charges?.grandTotal;
        logger.warn('checkout', 'Checkout blocked — the total changed', { code: err.code });
        setActionError(
          typeof now === 'number'
            ? `The total is now ${rupees(now)}. Check the bill, then tap Pay again.`
            : 'The total has changed. Check the bill, then tap Pay again.',
        );
        setPhase('ready');
        load({ quiet: true });
      } else if (
        err instanceof ApiError &&
        (err.code === 'CART_PRICE_CHANGED' || err.code === 'ORDER_ITEM_UNAVAILABLE')
      ) {
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
      } else if (err instanceof ApiError && err.code === 'PAYMENT_GATEWAY_UNAVAILABLE') {
        logger.warn('checkout', 'Online payment unavailable — nothing was placed', { code: err.code });
        setActionError('Online payment isn’t available right now. Nothing was charged — please try again shortly.');
        setPhase('failed');
      } else {
        reportError('checkout', 'Order placement failed', err);
        setActionError('Something went wrong placing your order. Please try again.');
        setPhase('failed');
      }
      return;
    }

    // The server emptied the cart — the tab badge / Home CartBar follow.
    clearCartCache();
    attemptRef.current = null;
    const totalPaise = expectedTotalPaise ?? Math.round(order.grandTotal * 100);

    // ── 2. COD is done at placement ──
    if (method.wire === 'cod') {
      setPlacedOrderId(order.orderId);
      setPlacedIsCod(true);
      setPlacedTotalPaise(totalPaise);
      setPhase('done');
      return;
    }

    // ── 3. Pay ──
    placedRef.current = order;
    setPlacedTotalPaise(totalPaise);
    await payPlaced(order, order.needsPaymentRetry ? null : order.gatewayOrder, totalPaise);
  }, [
    summary,
    selectedMethodId,
    codEnabled,
    isRepricing,
    tip,
    overrideAddressId,
    overrideInstructions,
    overrideCookingRequests,
    overrideExtraCutlery,
    overrideVegFleetOptIn,
    load,
    clearCartCache,
    payPlaced,
    retryPayment,
  ]);

  return {
    summary,
    isLoading,
    isRepricing,
    error,
    notSignedIn,
    phase,
    selectedMethodId,
    selectMethod,
    codEnabled,
    actionError,
    pendingPayment,
    orderPlaced: placedRef.current != null || placedOrderId != null,
    placedOrderId,
    placedIsCod,
    placedTotalPaise,
    refresh: () => load(),
    pay,
    retryPayment,
    pendingLineIds,
    lineError,
    setLineQty,
    removeLine,
    addingMealItemId,
    addMealItem,
  };
}
