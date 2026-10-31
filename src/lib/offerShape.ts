/**
 * offerShape.ts — the wire shapes of personal offers (GET /api/offers/mine and the socket's
 * offer_received / offer_updated) and how they become a CustomerOffer. No network or React here,
 * so the contract test (src/lib/__tests__/offers.test.ts) can feed it the backend's captured
 * payloads (yulo_backend/docs/live-fixtures, copied into __tests__/fixtures/live).
 */

import type { CustomerOffer, OfferStatus } from './offersReducer';

export interface RawCustomerOffer {
  id: string;
  restaurant?: { id?: string; name?: string | null } | null;
  title?: string;
  type?: 'percentage' | 'flat_amount';
  percentage?: number | null;
  flatAmount?: number | null;
  maxDiscountAmount?: number | null;
  minimumOrderValue?: number | null;
  /** Dish ids (empty = the whole order). */
  applicableItems?: string[];
  /** Those dishes' names, in the same order. */
  applicableItemNames?: string[];
  status?: OfferStatus;
  expiresAt?: string;
}

/** The socket's `offer_received` payload (it names the dishes; the REST list carries ids). */
export interface RawOfferReceived {
  offerId: string;
  restaurant?: { id?: string; name?: string | null } | null;
  title?: string;
  type?: 'percentage' | 'flat_amount';
  percentage?: number | null;
  flatAmount?: number | null;
  maxDiscountAmount?: number | null;
  minimumOrderValue?: number | null;
  /** Here, the dishes' names (empty = the whole order). */
  applicableItems?: string[];
  endDate?: string;
}

/** The socket's `offer_updated` payload, as the customer gets it. */
export interface RawOfferUpdated {
  offerId: string;
  offerStatus: OfferStatus;
  at?: string;
  orderId?: string;
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const names = (v: unknown): string[] => (Array.isArray(v) ? v.filter((n): n is string => typeof n === 'string' && n.length > 0) : []);

export function toOffer(raw: RawCustomerOffer | (RawOfferReceived & { id?: string }), receivedAt: number, fallbackStatus: OfferStatus): CustomerOffer {
  const r = raw as RawCustomerOffer & RawOfferReceived;
  return {
    id: String(r.id ?? r.offerId),
    restaurantId: String(r.restaurant?.id ?? ''),
    restaurantName: r.restaurant?.name ?? null,
    title: r.title ?? 'An offer for you',
    type: r.type === 'flat_amount' ? 'flat_amount' : 'percentage',
    percentage: num(r.percentage),
    flatAmount: num(r.flatAmount),
    maxDiscountAmount: num(r.maxDiscountAmount),
    minimumOrderValue: num(r.minimumOrderValue) ?? 0,
    // The REST list names the dishes in applicableItemNames (its applicableItems are ids); the
    // socket's offer_received names them in applicableItems itself.
    dishNames: names(r.applicableItemNames ?? (r.id == null ? r.applicableItems : [])),
    expiresAt: String(r.expiresAt ?? r.endDate ?? new Date(0).toISOString()),
    status: r.status ?? fallbackStatus,
    receivedAt,
  };
}
