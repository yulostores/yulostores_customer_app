/**
 * usePayOrder.ts — "Retry payment" for an online order that was placed but not paid
 * (the Razorpay sheet was closed, the app was killed mid-payment, a verify call never
 * came back). Used by the tracking screen; checkout has the same flow inside
 * useCheckout.
 *
 *   POST /api/orders/:id/payment/retry  → a Razorpay order for the SAME amount
 *   → payAndConfirm (src/services/payments.ts): Razorpay Checkout + verify, then a
 *     few status polls when the outcome is unclear
 *
 * 409 ALREADY_PAID / PAYMENT_ALREADY_RECEIVED means it went through meanwhile — the
 * caller just refetches. Never cancels anything.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { logger, reportError } from '../lib/logger';
import { ApiError } from '../services/api';
import { payAndConfirm, PaymentError, retryOrderPayment } from '../services/payments';
import { loadAppConfig } from './useAppConfig';

interface UsePayOrderResult {
  paying: boolean;
  /** Why the last attempt didn't confirm, or null. */
  message: string | null;
  /** Resolves true when the order is now paid (the caller refetches either way). */
  pay: () => Promise<boolean>;
}

export function usePayOrder(orderId: string): UsePayOrderResult {
  const [paying, setPaying] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const pay = useCallback(async () => {
    if (!orderId) return false;
    setPaying(true);
    setMessage(null);
    try {
      let simulationEnabled = false;
      try {
        simulationEnabled = (await loadAppConfig()).payments.paymentSimulationEnabled;
      } catch {
        /* unreachable config — Razorpay still works */
      }
      const { gatewayOrder } = await retryOrderPayment(orderId);
      const result = await payAndConfirm({
        orderId,
        amountRupees: (gatewayOrder?.amount ?? 0) / 100,
        gatewayOrder,
        simulationEnabled,
      });
      if (result.status === 'paid') return true;
      if (mountedRef.current) setMessage(result.message);
      return false;
    } catch (err) {
      if (err instanceof ApiError && (err.code === 'ALREADY_PAID' || err.code === 'PAYMENT_ALREADY_RECEIVED')) {
        return true;
      }
      let text: string;
      if (err instanceof PaymentError) {
        text = err.message;
      } else if (err instanceof ApiError && err.code === 'ORDER_CANCELLED') {
        text = 'This order was cancelled, so there is nothing to pay.';
      } else if (err instanceof ApiError && err.status >= 400 && err.status < 500) {
        logger.warn('payOrder', `Retry payment rejected — ${err.status} ${err.code}`, { code: err.code });
        text = err.message || 'The payment could not be started.';
      } else {
        reportError('payOrder', 'Retry payment failed', err, { orderId });
        text = 'We couldn’t start the payment. Check your connection and try again.';
      }
      if (mountedRef.current) setMessage(text);
      return false;
    } finally {
      if (mountedRef.current) setPaying(false);
    }
  }, [orderId]);

  return { paying, message, pay };
}
