/**
 * offers.ts — the customer's personal offers (live customer activity).
 *
 * Endpoints (see yulo_backend/API.md → "Live Activity & Personal Offers → Customer — Offers"):
 *   GET    /api/offers/mine              → open, unexpired offers (fetching marks them delivered)
 *   POST   /api/offers/:offerId/viewed   → the customer saw it (idempotent)
 *   POST   /api/cart/apply-offer         → applies it to the cart; `{ cart, bill }` repriced
 *   DELETE /api/cart/offer               → takes it off the cart; `{ cart, bill }` repriced
 *
 * All four 404 while the feature is off. Apply refusals carry OFFER_* / DISCOUNT_MIN_VALUE
 * codes, worded by src/lib/offerErrors.ts. Every amount comes back from the server.
 */

import { apiDelete, apiGet, apiPost } from './api';
import { reshapeCartSnapshot, type CartSnapshot } from './cart';
import type { CustomerOffer } from '../lib/offersReducer';
import { toOffer, type RawCustomerOffer, type RawOfferReceived } from '../lib/offerShape';

export type { RawOfferReceived, RawOfferUpdated } from '../lib/offerShape';

/** Open offers, newest first. */
export async function getMyOffers(now = Date.now()): Promise<CustomerOffer[]> {
  const data = await apiGet<{ offers: RawCustomerOffer[] }>('/api/offers/mine');
  // The server lists newest first; keep that order in `receivedAt` for the reducer.
  return (data.offers ?? []).map((o, i) => toOffer(o, now - i, 'delivered'));
}

/** An `offer_received` socket payload as an offer (it is `sent` until acknowledged). */
export function offerFromSocket(raw: RawOfferReceived, now = Date.now()): CustomerOffer {
  return toOffer(raw, now, 'sent');
}

export async function markOfferViewed(offerId: string): Promise<void> {
  await apiPost(`/api/offers/${offerId}/viewed`);
}

export function applyOffer(offerId: string): Promise<CartSnapshot> {
  return apiPost<{ cart: unknown; bill: unknown }>('/api/cart/apply-offer', { offerId }).then(reshapeCartSnapshot);
}

export function removeOffer(): Promise<CartSnapshot> {
  return apiDelete<{ cart: unknown; bill: unknown }>('/api/cart/offer').then(reshapeCartSnapshot);
}
