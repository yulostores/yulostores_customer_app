/**
 * OffersContext — the customer's open personal offers and their activity-sharing choice
 * (live customer activity; API.md → Live Activity & Personal Offers).
 *
 * Holds the open offers in a pure reducer (src/lib/offersReducer.ts), refetched on app open,
 * on return to the foreground, whenever the offers channel (re)joins, and kept current by the
 * socket's `offer_received` / `offer_updated`. Offers past their end drop out on their own.
 * The state belongs to one account: it empties on sign-out or an account switch, and a late
 * event for a previous account is ignored.
 *
 * Also owns the activity preferences — `shareActivity` (Settings toggle, optimistic with
 * rollback) and the one-time notice. Nothing here runs unless GET /api/app/config reports
 * `liveActivity.enabled`, and never for guests.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react';
import { AppState } from 'react-native';
import { useAuth } from './AuthContext';
import { useAppConfig } from '../hooks/useAppConfig';
import { useUserChannel } from '../hooks/useUserChannel';
import { logger, reportError } from '../lib/logger';
import { initialOffersState, offerForRestaurant, offersReducer, type CustomerOffer } from '../lib/offersReducer';
import { activityNoticeKey, shouldShowActivityNotice } from '../lib/offerText';
import { ApiError } from '../services/api';
import { getMyOffers, markOfferViewed, offerFromSocket } from '../services/offers';
import { fetchPreferences, updateActivityPreferences } from '../services/preferences';

const TICK_MS = 15_000;

interface OffersContextValue {
  /** The feature is on and this is a real customer account. */
  available: boolean;
  offers: CustomerOffer[];
  offerFor: (restaurantId: string | null | undefined) => CustomerOffer | null;
  /** The offer that just arrived (for the toast); cleared once dismissed. */
  arrival: CustomerOffer | null;
  dismissArrival: () => void;
  /** `offer_ack` for an offer now on screen (once). */
  acknowledgeShown: (offerId: string) => void;
  /** `POST …/viewed`, once per offer per app run. */
  markViewed: (offerId: string) => void;
  /** Refetch the open offers (after an apply / an order). */
  refresh: () => Promise<void>;
  /** Activity sharing; null until loaded. */
  shareActivity: boolean | null;
  /** Turn sharing on/off; resolves an error message or null. */
  setShareActivity: (on: boolean) => Promise<string | null>;
  noticeVisible: boolean;
  /** The notice's answer: OK (keep sharing) or Turn off. */
  answerNotice: (turnOff: boolean) => Promise<void>;
}

const OffersContext = createContext<OffersContextValue | null>(null);

export function OffersProvider({ children }: PropsWithChildren) {
  const { session, isAuthenticated, isGuest } = useAuth();
  const { config } = useAppConfig();
  const userId = session?.user?._id ?? null;
  const realAccount = isAuthenticated && !isGuest && !session?.bypassed && !!session?.accessToken;
  const available = Boolean(config?.liveActivityEnabled) && realAccount;

  const [state, dispatch] = useReducer(offersReducer, initialOffersState);
  const [arrival, setArrival] = useState<CustomerOffer | null>(null);
  const [shareActivity, setShare] = useState<boolean | null>(null);
  const [noticeAt, setNoticeAt] = useState<string | null | undefined>(undefined);
  const [shownLocally, setShownLocally] = useState(false);
  const viewed = useRef(new Set<string>());
  const userRef = useRef(userId);
  userRef.current = userId;

  // One account at a time: a switch (or sign-out) starts from nothing.
  useEffect(() => {
    dispatch({ type: 'account', userId: available ? userId : null });
    setArrival(null);
    viewed.current.clear();
  }, [available, userId]);

  // The account's sharing choice and whether the notice was answered.
  useEffect(() => {
    if (!available || !userId) {
      setShare(null);
      setNoticeAt(undefined);
      setShownLocally(false);
      return;
    }
    let active = true;
    fetchPreferences()
      .then((prefs) => {
        if (!active) return;
        setShare(prefs.shareActivity);
        setNoticeAt(prefs.activityNoticeAt);
      })
      .catch((err) => logger.warn('offers', 'Could not read activity preferences', { code: err instanceof ApiError ? err.code : 'network' }));
    AsyncStorage.getItem(activityNoticeKey(userId))
      .then((v) => active && setShownLocally(v === '1'))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [available, userId]);

  const sharing = available && shareActivity === true;

  const refresh = useCallback(async () => {
    const forUser = userRef.current;
    if (!sharing || !forUser) return;
    try {
      const offers = await getMyOffers();
      dispatch({ type: 'loaded', userId: forUser, offers, now: Date.now() });
    } catch (err) {
      // 404 = the feature was switched off meanwhile; anything else is retried on the next trigger.
      logger.warn('offers', 'Could not load offers', { code: err instanceof ApiError ? err.code : 'network' });
    }
  }, [sharing]);

  // App open (and whenever sharing becomes on), and every return to the foreground.
  useEffect(() => {
    if (!sharing) return undefined;
    void refresh();
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') void refresh();
    });
    return () => sub.remove();
  }, [sharing, refresh]);

  // Offers past their end drop out.
  useEffect(() => {
    if (!state.offers.length) return undefined;
    const id = setInterval(() => dispatch({ type: 'tick', now: Date.now() }), TICK_MS);
    return () => clearInterval(id);
  }, [state.offers.length]);

  const ackOnce = useUserChannel(sharing, sharing ? userId : null, {
    onJoined: () => void refresh(),
    onOfferReceived: (raw) => {
      const forUser = userRef.current;
      if (!forUser) return;
      const offer = offerFromSocket(raw);
      dispatch({ type: 'received', userId: forUser, offer, now: Date.now() });
      setArrival(offer);
    },
    onOfferUpdated: (update) => {
      const forUser = userRef.current;
      if (!forUser) return;
      dispatch({ type: 'updated', userId: forUser, offerId: update.offerId, status: update.offerStatus });
      // An offer given back (a cancelled order) isn't in the list any more — fetch it again.
      if (update.offerStatus === 'viewed' || update.offerStatus === 'delivered') void refresh();
    },
  });

  const markViewed = useCallback(
    (offerId: string) => {
      if (viewed.current.has(offerId)) return;
      viewed.current.add(offerId);
      markOfferViewed(offerId)
        .then(() => {
          const forUser = userRef.current;
          if (forUser) dispatch({ type: 'updated', userId: forUser, offerId, status: 'viewed' });
        })
        .catch((err) => {
          viewed.current.delete(offerId);
          logger.warn('offers', 'Could not mark an offer viewed', { code: err instanceof ApiError ? err.code : 'network' });
        });
    },
    [],
  );

  const setShareActivity = useCallback(
    async (on: boolean): Promise<string | null> => {
      const previous = shareActivity;
      setShare(on); // optimistic
      if (!on) dispatch({ type: 'cleared' });
      try {
        const prefs = await updateActivityPreferences({ shareActivity: on });
        setShare(prefs.shareActivity);
        return null;
      } catch (err) {
        setShare(previous);
        reportError('offers', 'Could not change activity sharing', err);
        return on ? 'Couldn’t turn sharing back on. Please try again.' : 'Couldn’t turn sharing off. Please try again.';
      }
    },
    [shareActivity],
  );

  const answerNotice = useCallback(
    async (turnOff: boolean) => {
      if (!userId) return;
      // Shown once on this device even before the answer reaches the server.
      setShownLocally(true);
      AsyncStorage.setItem(activityNoticeKey(userId), '1').catch(() => {});
      if (turnOff) {
        setShare(false);
        dispatch({ type: 'cleared' });
      }
      try {
        const prefs = await updateActivityPreferences({
          activityNoticeAcknowledged: true,
          ...(turnOff ? { shareActivity: false } : {}),
        });
        setNoticeAt(prefs.activityNoticeAt);
        setShare(prefs.shareActivity);
      } catch (err) {
        // The local flag keeps the notice from showing again; the next launch retries the read.
        logger.warn('offers', 'Could not record the activity notice answer', { code: err instanceof ApiError ? err.code : 'network' });
      }
    },
    [userId],
  );

  const noticeVisible = shouldShowActivityNotice({
    liveActivityEnabled: Boolean(config?.liveActivityEnabled),
    signedIn: realAccount,
    isGuest,
    noticeAt,
    shownLocally,
  });

  const value = useMemo<OffersContextValue>(
    () => ({
      available,
      offers: sharing ? state.offers : [],
      offerFor: (restaurantId) => (sharing ? offerForRestaurant(state, restaurantId) : null),
      arrival: sharing ? arrival : null,
      dismissArrival: () => setArrival(null),
      acknowledgeShown: (offerId) => ackOnce(offerId),
      markViewed,
      refresh,
      shareActivity: available ? shareActivity : null,
      setShareActivity,
      noticeVisible,
      answerNotice,
    }),
    [available, sharing, state, arrival, ackOnce, markViewed, refresh, shareActivity, setShareActivity, noticeVisible, answerNotice],
  );

  return <OffersContext.Provider value={value}>{children}</OffersContext.Provider>;
}

export function useOffers(): OffersContextValue {
  const ctx = useContext(OffersContext);
  if (!ctx) throw new Error('useOffers must be used inside <OffersProvider>');
  return ctx;
}
