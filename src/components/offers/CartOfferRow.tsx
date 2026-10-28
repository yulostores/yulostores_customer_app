/**
 * CartOfferRow — "Offers for you" in the cart and at checkout: the customer's open offer from
 * this cart's restaurant, with Apply / Remove. Applied, it shows the saving from the server's
 * repriced bill; when it has stopped applying, the server's reason ("Add ₹120 more to use this
 * offer"). Every amount is the server's.
 */
import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Colors } from '../../constants/Colors';
import { BorderRadius, Spacing } from '../../constants/Theme';
import { useOffers } from '../../context/OffersContext';
import { useAccentTheme } from '../../hooks/useAccentTheme';
import { offerIssueText } from '../../lib/offerErrors';
import { endsInText, offerValueText, rupees } from '../../lib/offerText';
import { useCountdown } from './useCountdown';

interface Props {
  restaurantId: string | null;
  appliedDiscountId: string | null;
  /** Rupees off on the server's bill. */
  discountAmount: number;
  offerIssue: string | null;
  shortfallPaise: number | null;
  /** Apply / remove in flight (the bill is being repriced). */
  pending: boolean;
  /** An apply / remove failure, already in words. */
  error: string | null;
  onApply: (offerId: string) => void;
  onRemove: () => void;
}

export default function CartOfferRow({ restaurantId, appliedDiscountId, discountAmount, offerIssue, shortfallPaise, pending, error, onApply, onRemove }: Props) {
  const { offerFor } = useOffers();
  const offer = offerFor(restaurantId);
  const left = useCountdown(offer?.expiresAt);
  const { accent, accentDark } = useAccentTheme();
  if (!offer) return null;

  const applied = appliedDiscountId === offer.id;
  const issue = applied ? offerIssueText(offerIssue, shortfallPaise) : null;
  const status = applied
    ? issue ?? (discountAmount > 0 ? `Applied · you save ${rupees(discountAmount)}` : 'Applied')
    : `${offer.title} · ${endsInText(left)}`;

  return (
    <View style={styles.row} accessible={false}>
      <Text style={styles.heading}>Offers for you</Text>
      <View style={styles.body}>
        <Ionicons name="gift" size={20} color={accentDark} />
        <View style={styles.text}>
          <Text style={styles.value}>{offerValueText(offer)}</Text>
          <Text style={[styles.status, issue ? styles.issue : null]} numberOfLines={2}>
            {status}
          </Text>
        </View>
        {pending ? (
          <ActivityIndicator color={accent} accessibilityLabel="Updating your bill" />
        ) : (
          <Pressable
            onPress={() => (applied ? onRemove() : onApply(offer.id))}
            hitSlop={8}
            style={[styles.button, { borderColor: accent }]}
            accessibilityRole="button"
            accessibilityLabel={applied ? `Remove offer ${offer.title}` : `Apply offer ${offer.title}, ${offerValueText(offer)}`}
          >
            <Text style={[styles.buttonText, { color: accent }]}>{applied ? 'Remove' : 'Apply'}</Text>
          </Pressable>
        )}
      </View>
      {error ? (
        <Text style={styles.error} accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    backgroundColor: Colors.foodSurface,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.foodBorder,
    padding: Spacing.base,
    gap: Spacing.sm,
  },
  heading: { fontSize: 13, fontWeight: '800', color: Colors.foodTextSecondary, textTransform: 'uppercase' },
  body: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  text: { flex: 1, gap: 2 },
  value: { fontSize: 15, fontWeight: '800', color: Colors.foodText },
  status: { fontSize: 13, color: Colors.foodTextSecondary },
  issue: { color: '#B45309', fontWeight: '700' },
  button: { borderWidth: 1.5, borderRadius: BorderRadius.full, paddingHorizontal: Spacing.base, paddingVertical: Spacing.xs + 2 },
  buttonText: { fontSize: 14, fontWeight: '800' },
  error: { fontSize: 13, color: '#B91C1C' },
});
