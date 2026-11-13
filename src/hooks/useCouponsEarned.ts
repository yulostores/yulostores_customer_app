/**
 * useCouponsEarned — how many partner-shop coupons an order earned (`order.couponsEarned.count`
 * on GET /api/orders/:id). Coupons are issued just after the payment is confirmed, so a paid
 * order that still says 0 is asked again a couple of times, 2 s apart
 * (yulo_backend/COUPON_API_CHANGES.md § 3). Guests and bypass sessions never earn coupons.
 */
import { useEffect, useState } from 'react';
import { getOrder } from '../services/orders';
import { useIsCustomerAccount } from './useMyCoupons';

export const EARNED_RETRY_MS = 2_000;
export const EARNED_RETRIES = 2;

export function useCouponsEarned(orderId: string, { enabled = true }: { enabled?: boolean } = {}): number {
  const signedIn = useIsCustomerAccount();
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!orderId || !enabled || !signedIn) return undefined;
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const ask = (attempt: number) => {
      getOrder(orderId)
        .then((o) => {
          if (!alive) return;
          setCount(o.couponsEarned);
          if (o.couponsEarned === 0 && o.paymentStatus === 'paid' && attempt < EARNED_RETRIES)
            timer = setTimeout(() => ask(attempt + 1), EARNED_RETRY_MS);
        })
        .catch(() => {
          // A bonus line, not the order itself — a failed read just shows nothing.
        });
    };
    ask(0);
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, [orderId, enabled, signedIn]);

  return count;
}
