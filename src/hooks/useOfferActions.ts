/**
 * useOfferActions — Apply / Remove a personal offer on the cart, shared by the cart tab and
 * checkout. The server reprices the cart (`{ cart, bill }`); `onRepriced` hands that to the
 * screen (the cart shows it, checkout re-reads its summary for the chosen address and tip).
 * Refusals are worded by src/lib/offerErrors.ts; an offer that turns out to be expired, used or
 * gone is dropped from the open offers.
 */

import { useCallback, useRef, useState } from 'react';
import { useOffers } from '../context/OffersContext';
import { logger, reportError } from '../lib/logger';
import { offerErrorMessage } from '../lib/offerErrors';
import { ApiError } from '../services/api';
import type { CartSnapshot } from '../services/cart';
import { applyOffer as applyOfferRequest, removeOffer as removeOfferRequest } from '../services/offers';

const GONE = new Set(['OFFER_EXPIRED', 'OFFER_ALREADY_USED', 'OFFER_NOT_FOUND']);

export function useOfferActions(onRepriced: (next: CartSnapshot) => void | Promise<void>) {
  const offers = useOffers();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);

  const run = useCallback(
    async (what: 'apply' | 'remove', request: () => Promise<CartSnapshot>) => {
      if (busy.current) return;
      busy.current = true;
      setPending(true);
      setError(null);
      try {
        await onRepriced(await request());
        void offers.refresh();
      } catch (err) {
        if (err instanceof ApiError && err.status >= 400 && err.status < 500) {
          logger.warn('offers', `Offer ${what} refused — ${err.status} ${err.code}`, { code: err.code });
          setError(offerErrorMessage(err.code));
          if (GONE.has(err.code ?? '')) void offers.refresh();
        } else {
          reportError('offers', `Offer ${what} failed`, err);
          setError('Something went wrong. Please try again.');
        }
      } finally {
        busy.current = false;
        setPending(false);
      }
    },
    [onRepriced, offers],
  );

  return {
    pending,
    error,
    apply: useCallback((offerId: string) => run('apply', () => applyOfferRequest(offerId)), [run]),
    remove: useCallback(() => run('remove', removeOfferRequest), [run]),
    clearError: useCallback(() => setError(null), []),
  };
}
