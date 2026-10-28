/**
 * OffersBanner — on Home while any personal offer is open: the most recent one ("+1 more" when
 * there are several). Tap opens that restaurant.
 */
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Colors } from '../../constants/Colors';
import { BorderRadius, Spacing } from '../../constants/Theme';
import { useOffers } from '../../context/OffersContext';
import { useAccentTheme } from '../../hooks/useAccentTheme';
import { endsInText, offerValueText } from '../../lib/offerText';
import { useCountdown } from './useCountdown';

export default function OffersBanner() {
  const { offers } = useOffers();
  const latest = offers[0] ?? null;
  const left = useCountdown(latest?.expiresAt);
  const { accent, accentDark } = useAccentTheme();
  if (!latest) return null;
  const more = offers.length - 1;
  const text = `${latest.restaurantName ?? 'A restaurant'}: ${offerValueText(latest)} · ${endsInText(left)}`;
  return (
    <Pressable
      style={[styles.banner, { borderColor: accent }]}
      accessibilityRole="button"
      accessibilityLabel={`Offer for you from ${text}${more > 0 ? `, and ${more} more` : ''}. Opens the restaurant.`}
      onPress={() => latest.restaurantId && router.push({ pathname: '/restaurant/[id]', params: { id: latest.restaurantId } })}
    >
      <Ionicons name="gift" size={20} color={accentDark} />
      <View style={styles.body}>
        <Text style={[styles.title, { color: accentDark }]}>Offer for you</Text>
        <Text style={styles.text} numberOfLines={2}>
          {text}
        </Text>
      </View>
      {more > 0 ? <Text style={[styles.more, { color: accentDark }]}>+{more} more</Text> : null}
      <Ionicons name="chevron-forward" size={18} color={Colors.foodTextMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: Colors.foodSurface,
    borderWidth: 1,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginHorizontal: Spacing.base,
    marginVertical: Spacing.sm,
  },
  body: { flex: 1 },
  title: { fontSize: 13, fontWeight: '800' },
  text: { fontSize: 13.5, color: Colors.foodText, fontWeight: '600' },
  more: { fontSize: 12, fontWeight: '800' },
});
