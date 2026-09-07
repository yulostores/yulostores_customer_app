/**
 * notifications.ts — display copy for the notification categories the account
 * stores on `preferences.notifications.categories`.
 *
 * On the wire a category is only `{ key, enabled }` (yulo_backend User.js). The
 * *set* of categories and their on/off state are always read live from the
 * account — this file just maps a known `key` to a human title / blurb / icon,
 * the same way src/services/support.ts maps a ticket `category` to a topic. A
 * key with no entry here still renders, via {@link categoryMeta}'s humanising
 * fallback, so a category added on the backend needs no client release.
 */

import { Ionicons } from '@expo/vector-icons';

type IoniconName = keyof typeof Ionicons.glyphMap;

export interface NotificationCategoryMeta {
  /** Row heading. */
  title: string;
  /** One or two lines under the heading. */
  description: string;
  icon: IoniconName;
}

/** Copy for the category keys the backend ships today (User.js schema default). */
const META: Record<string, NotificationCategoryMeta> = {
  orders_and_purchases: {
    title: 'Orders and purchases',
    description:
      'Receive updates related to your order status, memberships, table bookings and more',
    icon: 'receipt-outline',
  },
};

/** "promo_offers" → "Promo offers" — a readable label for an unmapped key. */
function humanise(key: string): string {
  const spaced = key.replace(/[_-]+/g, ' ').trim();
  if (!spaced) return 'Notifications';
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** Metadata for a category key, with a safe fallback for anything unmapped. */
export function categoryMeta(key: string): NotificationCategoryMeta {
  return (
    META[key] ?? {
      title: humanise(key),
      description: 'Updates and alerts for this category.',
      icon: 'notifications-outline',
    }
  );
}
