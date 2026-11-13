/**
 * useDemographicsPrompt — the one-time "tell us a little about you" sheet, shown once the
 * customer has a coupon and has given neither gender nor date of birth. It is remembered per
 * account the moment it shows, so it never comes back — whether they answer, tap "Not now" or
 * close the app. The same fields stay editable on Edit profile.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { shouldAskDemographics } from '../lib/demographics';
import { logger } from '../lib/logger';
import { fetchMyProfile } from '../services/profile';
import { useIsCustomerAccount } from './useMyCoupons';

export const promptKey = (userId: string) => `yulo.coupons.demographicsAsked.${userId}`;

export function useDemographicsPrompt(hasCoupon: boolean) {
  const { user } = useAuth();
  const signedIn = useIsCustomerAccount();
  const userId = user?._id ? String(user._id) : '';
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!hasCoupon || !signedIn || !userId) return undefined;
    let alive = true;
    (async () => {
      try {
        const alreadyAsked = (await AsyncStorage.getItem(promptKey(userId))) === '1';
        if (alreadyAsked || !alive) return;
        const profile = await fetchMyProfile();
        if (!alive) return;
        if (shouldAskDemographics({ hasCoupon, alreadyAsked, gender: profile.gender, dateOfBirth: profile.dateOfBirth })) {
          await AsyncStorage.setItem(promptKey(userId), '1');
          if (alive) setVisible(true);
        } else {
          // Already given — nothing to ask, ever.
          await AsyncStorage.setItem(promptKey(userId), '1');
        }
      } catch (err) {
        // Storage or network trouble: skip it this time; it's optional.
        logger.warn('coupons', 'Demographics prompt check failed', { message: String(err) });
      }
    })();
    return () => {
      alive = false;
    };
  }, [hasCoupon, signedIn, userId]);

  const close = useCallback(() => setVisible(false), []);
  return { visible, close };
}
