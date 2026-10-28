/**
 * offerErrors.ts — every personal-offer error the server can answer with, in plain words
 * (API.md → Live Activity & Personal Offers → Error codes), plus the cart's `offerIssue`.
 * One place, so the cart, checkout and the restaurant page say the same thing.
 */

import { rupees } from './offerText';

export const OFFER_ERROR_MESSAGES: Readonly<Record<string, string>> = {
  OFFER_EXPIRED: 'This offer has ended.',
  OFFER_ALREADY_USED: 'You’ve already used this offer.',
  DISCOUNT_MIN_VALUE: 'Your order is below this offer’s minimum.',
  OFFER_NOT_APPLICABLE: 'This offer doesn’t apply to what’s in your cart.',
  OFFER_NOT_FOUND: 'This offer isn’t available any more.',
  GUEST_ACCOUNT_REQUIRED: 'Sign in to use offers.',
};

const FALLBACK = 'This offer couldn’t be used right now. Please try again.';

/** The plain-words message for an offer error code; a fallback for anything unknown. */
export function offerErrorMessage(code: string | null | undefined): string {
  return (code && OFFER_ERROR_MESSAGES[code]) || FALLBACK;
}

/** True for the codes that mean "this offer can't be on this order". */
export function isOfferErrorCode(code: string | null | undefined): boolean {
  return !!code && code in OFFER_ERROR_MESSAGES && code !== 'GUEST_ACCOUNT_REQUIRED';
}

/** "Add ₹120 more" from the server's `shortfallPaise`; null when there is no shortfall. */
export function addMoreText(shortfallPaise: number | null | undefined): string | null {
  if (typeof shortfallPaise !== 'number' || !(shortfallPaise > 0)) return null;
  return `Add ${rupees(shortfallPaise / 100)} more`;
}

/**
 * Why an applied offer isn't taking anything off right now — from the bill's `offerIssue`
 * (and `shortfallPaise` for the minimum order): "Add ₹120 more to use this offer".
 */
export function offerIssueText(issue: string | null | undefined, shortfallPaise?: number | null): string | null {
  if (!issue) return null;
  if (issue === 'DISCOUNT_MIN_VALUE') {
    const more = addMoreText(shortfallPaise);
    if (more) return `${more} to use this offer`;
  }
  return offerErrorMessage(issue);
}
