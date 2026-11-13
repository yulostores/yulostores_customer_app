/** One coupon in My Coupons: offer, shop, category and the expiry (or used / expired date). */
import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Colors } from '../../constants/Colors';
import { BorderRadius, Elevation, Spacing } from '../../constants/Theme';
import { useThemedStyles, type AccentTheme } from '../../hooks/useAccentTheme';
import { expiryCountdown, STATUS_LABEL, type CustomerCoupon } from '../../lib/coupons';

const day = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

export function CouponListItem({ coupon, onPress }: { coupon: CustomerCoupon; onPress: () => void }) {
  const styles = useThemedStyles(makeStyles);
  const active = coupon.status === 'issued';
  const countdown = expiryCountdown(coupon.expiresAt);
  const meta = active
    ? countdown.text
    : coupon.status === 'redeemed'
      ? `Used ${day(coupon.redeemedAt)}`
      : `${STATUS_LABEL[coupon.status]} ${day(coupon.expiresAt)}`;
  return (
    <Pressable onPress={onPress} style={[styles.card, !active && styles.cardDone]} accessibilityRole="button">
      <View style={styles.body}>
        {coupon.categoryName ? <Text style={styles.category}>{coupon.categoryName.toUpperCase()}</Text> : null}
        <Text style={styles.title} numberOfLines={2}>
          {coupon.title}
        </Text>
        <Text style={styles.seller} numberOfLines={1}>
          {coupon.sellerName}
        </Text>
        <Text style={[styles.meta, active && countdown.urgent && styles.metaUrgent]}>{meta}</Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color={Colors.foodTextMuted} />
    </Pressable>
  );
}

const makeStyles = (t: AccentTheme) =>
  StyleSheet.create({
    card: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: Colors.foodSurface,
      borderRadius: BorderRadius.lg,
      borderWidth: 1,
      borderColor: Colors.foodBorder,
      borderLeftWidth: 4,
      borderLeftColor: t.accent,
      padding: Spacing.base,
      ...Elevation.card,
    },
    cardDone: { borderLeftColor: Colors.foodBorderStrong },
    body: { flex: 1, gap: 3 },
    category: { fontSize: 11, fontWeight: '800', letterSpacing: 0.6, color: t.accentDark },
    title: { fontSize: 15.5, fontWeight: '800', color: Colors.foodText },
    seller: { fontSize: 13, color: Colors.foodTextSecondary },
    meta: { marginTop: 2, fontSize: 12.5, fontWeight: '600', color: Colors.foodTextMuted },
    metaUrgent: { color: Colors.authDanger },
  });
