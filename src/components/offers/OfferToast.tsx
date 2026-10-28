/**
 * OfferToast — "Spice Garden sent you 15% off (up to ₹100) · ends in 29 min", sliding in at the
 * top when an offer arrives over the socket. Tap opens the restaurant; it hides itself after a
 * few seconds. Showing it is what acknowledges the offer to the server (`offer_ack`).
 */
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../../constants/Colors';
import { BorderRadius, Shadows, Spacing } from '../../constants/Theme';
import { useOffers } from '../../context/OffersContext';
import { useAccentTheme } from '../../hooks/useAccentTheme';
import { arrivalText } from '../../lib/offerText';

const VISIBLE_MS = 8_000;

export default function OfferToast() {
  const { arrival, dismissArrival, acknowledgeShown } = useOffers();
  const insets = useSafeAreaInsets();
  const { accent } = useAccentTheme();

  useEffect(() => {
    if (!arrival) return undefined;
    acknowledgeShown(arrival.id);
    const id = setTimeout(dismissArrival, VISIBLE_MS);
    return () => clearTimeout(id);
  }, [arrival, acknowledgeShown, dismissArrival]);

  if (!arrival) return null;
  const text = arrivalText(arrival, Date.now());
  return (
    <View pointerEvents="box-none" style={[styles.wrap, { top: insets.top + Spacing.sm }]}>
      <Pressable
        style={styles.toast}
        accessibilityRole="button"
        accessibilityLabel={`${text}. Opens the restaurant.`}
        accessibilityLiveRegion="polite"
        onPress={() => {
          dismissArrival();
          if (arrival.restaurantId) router.push({ pathname: '/restaurant/[id]', params: { id: arrival.restaurantId } });
        }}
      >
        <Ionicons name="gift" size={22} color={accent} />
        <Text style={styles.text} numberOfLines={3}>
          {text}
        </Text>
        <Pressable onPress={dismissArrival} hitSlop={10} accessibilityRole="button" accessibilityLabel="Dismiss offer">
          <Ionicons name="close" size={18} color={Colors.foodTextMuted} />
        </Pressable>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: Spacing.base, right: Spacing.base, zIndex: 50 },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: Colors.foodSurface,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.foodBorder,
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
    ...Shadows.lg,
  },
  text: { flex: 1, fontSize: 14, fontWeight: '700', color: Colors.foodText, lineHeight: 19 },
});
