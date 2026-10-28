/**
 * OfferCard — the customer's personal offer from this restaurant, on the restaurant page, with
 * a live countdown. Marks the offer viewed (once) when the customer actually sees it — while the
 * restaurant page is the focused screen, not merely mounted under another one.
 */
import { Ionicons } from '@expo/vector-icons';
import { useIsFocused } from 'expo-router';
import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Colors } from '../../constants/Colors';
import { BorderRadius, Spacing } from '../../constants/Theme';
import { useOffers } from '../../context/OffersContext';
import { useAccentTheme } from '../../hooks/useAccentTheme';
import { endsInText, offerValueText, rupees, shouldMarkViewed } from '../../lib/offerText';
import { useCountdown } from './useCountdown';

export default function OfferCard({ restaurantId }: { restaurantId: string | null | undefined }) {
  const { offerFor, markViewed } = useOffers();
  const offer = offerFor(restaurantId);
  const left = useCountdown(offer?.expiresAt);
  const { accent, accentLight, accentDark } = useAccentTheme();
  const focused = useIsFocused();

  useEffect(() => {
    if (offer && shouldMarkViewed({ hasOffer: true, screenFocused: focused })) markViewed(offer.id);
  }, [offer, focused, markViewed]);

  if (!offer) return null;
  const value = offerValueText(offer);
  const ends = endsInText(left);
  return (
    <View
      style={[styles.card, { backgroundColor: accentLight, borderColor: accent }]}
      accessible
      accessibilityLabel={`Offer for you: ${offer.title}, ${value}, ${ends}. Apply it in your cart.`}
    >
      <Ionicons name="gift" size={22} color={accentDark} />
      <View style={styles.body}>
        <Text style={[styles.title, { color: accentDark }]}>Just for you · {value}</Text>
        <Text style={styles.sub} numberOfLines={2}>
          {offer.title}
          {offer.minimumOrderValue > 0 ? ` · on orders over ${rupees(offer.minimumOrderValue)}` : ''}
        </Text>
        <Text style={styles.sub}>Apply it in your cart · {ends}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    gap: Spacing.md,
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: BorderRadius.lg,
    padding: Spacing.base,
    marginHorizontal: Spacing.base,
    marginVertical: Spacing.sm,
  },
  body: { flex: 1, gap: 2 },
  title: { fontSize: 15, fontWeight: '800' },
  sub: { fontSize: 13, color: Colors.foodTextSecondary },
});
