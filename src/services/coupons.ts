/**
 * coupons.ts — the customer's partner-shop coupons (yulo_backend/API.md → "Customer — Coupons").
 *
 *   GET /api/users/me/coupons?status=issued|redeemed|expired&page&limit   (newest first, limit ≤ 50)
 *   GET /api/users/me/coupons/:id
 *
 * Customer-token only; the screens show a sign-in prompt to guests instead of calling these.
 */
import { toCoupon, type CouponStatus, type CustomerCoupon, type RawCoupon } from '../lib/coupons';
import { apiGet } from './api';

export const COUPONS_PAGE_SIZE = 20;

export interface CouponsPage {
  coupons: CustomerCoupon[];
  total: number;
  page: number;
}

export async function listMyCoupons(status: CouponStatus, page = 1): Promise<CouponsPage> {
  const raw = await apiGet<{ coupons?: RawCoupon[]; total?: number; page?: number }>('/api/users/me/coupons', {
    status,
    page,
    limit: COUPONS_PAGE_SIZE,
  });
  const now = Date.now();
  return {
    coupons: (raw.coupons ?? []).map((c) => toCoupon(c, now)),
    total: typeof raw.total === 'number' ? raw.total : 0,
    page: raw.page ?? page,
  };
}

/** One coupon; `404 NOT_FOUND` when it isn't this customer's. */
export async function getMyCoupon(id: string): Promise<CustomerCoupon> {
  const raw = await apiGet<{ coupon: RawCoupon }>(`/api/users/me/coupons/${encodeURIComponent(id)}`);
  return toCoupon(raw.coupon);
}
