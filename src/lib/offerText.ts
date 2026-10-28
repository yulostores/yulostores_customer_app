/**
 * offerText.ts — how personal offers read on screen, and when the activity notice shows.
 * Pure helpers (node:test covers them). Every amount shown on a bill still comes from the
 * server; these only word the offer's own terms and the server's figures.
 */

/** Rupees without empty paise: "₹100", "₹95.50". */
export function rupees(amount: number): string {
  const whole = Number.isInteger(amount);
  return '₹' + amount.toLocaleString('en-IN', { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: whole ? 0 : 2 });
}

/** "15% off (up to ₹100)" / "₹50 off". */
export function offerValueText(offer: {
  type: 'percentage' | 'flat_amount';
  percentage: number | null;
  flatAmount: number | null;
  maxDiscountAmount: number | null;
}): string {
  if (offer.type === 'percentage') {
    return offer.maxDiscountAmount != null
      ? `${offer.percentage}% off (up to ${rupees(offer.maxDiscountAmount)})`
      : `${offer.percentage}% off`;
  }
  return `${rupees(offer.flatAmount ?? 0)} off`;
}

/**
 * Time left on an offer: whole minutes (rounded up) while a minute or more remains, then
 * seconds in the last minute, then "Expired".
 *   60 000 ms → "1 min" · 59 000 ms → "59 s" · 0 or less → "Expired"
 */
export function countdownText(msLeft: number): string {
  if (!(msLeft > 0)) return 'Expired';
  if (msLeft < 60_000) return `${Math.ceil(msLeft / 1000)} s`;
  return `${Math.ceil(msLeft / 60_000)} min`;
}

/** "ends in 29 min" / "ends in 40 s" / "Expired". */
export function endsInText(msLeft: number): string {
  const left = countdownText(msLeft);
  return left === 'Expired' ? left : `ends in ${left}`;
}

/** "Spice Garden sent you 15% off (up to ₹100) · ends in 29 min". */
export function arrivalText(
  offer: Parameters<typeof offerValueText>[0] & { restaurantName: string | null; expiresAt: string },
  now: number,
): string {
  const who = offer.restaurantName ?? 'A restaurant';
  return `${who} sent you ${offerValueText(offer)} · ${endsInText(Date.parse(offer.expiresAt) - now)}`;
}

/**
 * The one-time "restaurants can see what you browse" notice. Shown only when the feature is on,
 * to a real (non-guest) signed-in account the server says hasn't seen it (`activityNoticeAt`
 * null) — and not again on this device once answered, while that answer is still on its way.
 */
export function shouldShowActivityNotice(input: {
  liveActivityEnabled: boolean;
  signedIn: boolean;
  isGuest: boolean;
  /** `preferences.activityNoticeAt` from the server; undefined until loaded. */
  noticeAt: string | null | undefined;
  /** This device already showed it for this account (AsyncStorage fallback). */
  shownLocally: boolean;
}): boolean {
  if (!input.liveActivityEnabled || !input.signedIn || input.isGuest) return false;
  if (input.noticeAt === undefined) return false; // not loaded yet — never guess
  return input.noticeAt === null && !input.shownLocally;
}

/**
 * Whether the restaurant page's offer card may report the offer as viewed: only while that page
 * is the one in front of the customer. A page left mounted under the cart or a dish (stack
 * navigation keeps it) renders the card too — I1 found offers marked "viewed" at the moment they
 * arrived, while the customer was looking at their cart.
 */
export function shouldMarkViewed(input: { hasOffer: boolean; screenFocused: boolean }): boolean {
  return input.hasOffer && input.screenFocused;
}

/** The on-device "notice shown" flag — one per account, so a second account still sees it. */
export const activityNoticeKey = (userId: string): string => `yulo.activityNotice.shown.${userId}`;

export const ACTIVITY_NOTICE = {
  title: 'Restaurants can see what you browse',
  body:
    'Restaurants you visit can see what you browse and add to your cart in their store, with your first name only, to send you personal offers. You can turn this off in Settings.',
} as const;
