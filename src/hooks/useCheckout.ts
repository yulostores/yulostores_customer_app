/**
 * useCheckout.ts — data + the one action behind the Payment screen
 * (`app/checkout/payment.tsx`).
 *
 * Load:  GET /api/checkout/summary  → the delivery address + the server bill.
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
 * `overrides` carries the choices made on the checkout review page
 * (`app/checkout/index.tsx`) — the picked address plus tip / delivery
 * instructions / cutlery / veg-fleet. They're threaded through as route params
 * and folded into `POST /api/orders/checkout`. Omitted → the server bills the
 * account default with no extras, which is the standalone-Payment-screen case.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { logger, reportError } from '../lib/logger';
import { ApiError } from '../services/api';
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
  };
}
