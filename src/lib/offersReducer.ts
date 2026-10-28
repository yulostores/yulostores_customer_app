/**
 * offersReducer.ts — the customer's open personal offers, as one pure reducer.
 *
 * Offers come from three places — `GET /api/offers/mine`, the socket's `offer_received` and its
 * `offer_updated` (API.md → Live Activity & Personal Offers) — and every one of them is folded in
 * here, so the rules live in one spot: only open, unexpired offers are kept, newest first; an
 * offer that is redeemed, expired or revoked leaves; the state belongs to one account and an
 * event for any other account is ignored (a late socket event after a sign-out / account switch).
 *
 * No React, no network: OffersContext dispatches into it, and the node:test suite drives it.
 */

export type OfferStatus = 'sent' | 'delivered' | 'viewed' | 'applied' | 'redeemed' | 'expired' | 'revoked';

export const OPEN_OFFER_STATUSES: readonly OfferStatus[] = ['sent', 'delivered', 'viewed', 'applied'];

export interface CustomerOffer {
  id: string;
  restaurantId: string;
  restaurantName: string | null;
  title: string;
  type: 'percentage' | 'flat_amount';
  percentage: number | null;
  flatAmount: number | null;
  /** Rupees. */
  maxDiscountAmount: number | null;
  /** Rupees; 0 = none. */
  minimumOrderValue: number;
  /** ISO time the offer stops working. */
  expiresAt: string;
  status: OfferStatus;
  /** When this app first learned of it (ms) — newest first. */
  receivedAt: number;
}

export interface OffersState {
  /** The account these offers belong to; null when signed out. */
  userId: string | null;
  offers: CustomerOffer[];
}

export const initialOffersState: OffersState = { userId: null, offers: [] };

export type OffersAction =
  /** Signed in as / switched to this account (null = signed out): a different one starts empty. */
  | { type: 'account'; userId: string | null }
  /** The server's full list (GET /api/offers/mine) replaces ours. */
  | { type: 'loaded'; userId: string; offers: CustomerOffer[]; now: number }
  /** `offer_received` from the socket. */
  | { type: 'received'; userId: string; offer: CustomerOffer; now: number }
  /** `offer_updated` from the socket (or after apply / remove). */
  | { type: 'updated'; userId: string; offerId: string; status: OfferStatus }
  /** The clock moved: drop offers whose end has passed. */
  | { type: 'tick'; now: number }
  /** Activity sharing turned off: no offers are kept locally. */
  | { type: 'cleared' };

const isOpen = (offer: CustomerOffer, now: number) =>
  OPEN_OFFER_STATUSES.includes(offer.status) && Date.parse(offer.expiresAt) > now;

const newestFirst = (a: CustomerOffer, b: CustomerOffer) => b.receivedAt - a.receivedAt;

export function offersReducer(state: OffersState, action: OffersAction): OffersState {
  switch (action.type) {
    case 'account':
      return action.userId === state.userId ? state : { userId: action.userId, offers: [] };
    case 'cleared':
      return state.offers.length ? { ...state, offers: [] } : state;
    case 'tick': {
      const offers = state.offers.filter((o) => Date.parse(o.expiresAt) > action.now);
      return offers.length === state.offers.length ? state : { ...state, offers };
    }
  }
  // Everything below carries an account: anything for another one is stale — ignore it.
  if (action.userId !== state.userId) return state;
  switch (action.type) {
    case 'loaded': {
      const known = new Map(state.offers.map((o) => [o.id, o.receivedAt]));
      const offers = action.offers
        .map((o) => ({ ...o, receivedAt: known.get(o.id) ?? o.receivedAt }))
        .filter((o) => isOpen(o, action.now))
        .sort(newestFirst);
      return { ...state, offers };
    }
    case 'received': {
      if (!isOpen(action.offer, action.now)) return state;
      const others = state.offers.filter((o) => o.id !== action.offer.id);
      return { ...state, offers: [action.offer, ...others].sort(newestFirst) };
    }
    case 'updated': {
      const current = state.offers.find((o) => o.id === action.offerId);
      if (!current) return state;
      if (!OPEN_OFFER_STATUSES.includes(action.status)) {
        return { ...state, offers: state.offers.filter((o) => o.id !== action.offerId) };
      }
      if (current.status === action.status) return state;
      return { ...state, offers: state.offers.map((o) => (o.id === action.offerId ? { ...o, status: action.status } : o)) };
    }
    default:
      return state;
  }
}

/** The open offer from one restaurant (at most one exists), or null. */
export function offerForRestaurant(state: OffersState, restaurantId: string | null | undefined): CustomerOffer | null {
  if (!restaurantId) return null;
  return state.offers.find((o) => o.restaurantId === restaurantId) ?? null;
}
