/**
 * CouponsEarnedCard — "You earned N coupons" → My Coupons, on checkout success and the order
 * screen. Renders nothing until the order has earned at least one (useCouponsEarned re-asks a
 * moment after payment), and brings up the one-time gender / date-of-birth prompt.
 */
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Colors } from '../../constants/Colors';
import { BorderRadius, Spacing } from '../../constants/Theme';
import { useThemedStyles, type AccentTheme } from '../../hooks/useAccentTheme';
import { useCouponsEarned } from '../../hooks/useCouponsEarned';
import { earnedTitle } from '../../lib/coupons';
import { DemographicsPrompt } from './DemographicsPrompt';

export function CouponsEarnedCard({ orderId, enabled = true }: { orderId: string; enabled?: boolean }) {
  const count = useCouponsEarned(orderId, { enabled });
  const styles = useThemedStyles(makeStyles);
  if (count <= 0) return null;
  return (
    <>
      <Pressable
        style={styles.card}
        onPress={() => router.push('/coupons')}
        accessibilityRole="button"
        accessibilityHint="Opens My Coupons"
      >
        <View style={styles.icon}>
          <Ionicons name="ticket" size={22} color={Colors.white} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{earnedTitle(count)}</Text>
          <Text style={styles.sub}>From shops near the restaurant — show them at the counter.</Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color={Colors.foodText} />
      </Pressable>
      <DemographicsPrompt hasCoupon />
    </>
  );
}

const makeStyles = (t: AccentTheme) =>
  StyleSheet.create({
    card: {
      alignSelf: 'stretch',
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.md,
      marginTop: Spacing.base,
      padding: Spacing.base,
      borderRadius: BorderRadius.lg,
      backgroundColor: t.accentLight,
      borderWidth: 1,
      borderColor: t.accent,
    },
    icon: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: t.accent,
      alignItems: 'center',
      justifyContent: 'center',
    },
    title: { fontSize: 15, fontWeight: '800', color: Colors.foodText },
    sub: { marginTop: 2, fontSize: 12.5, color: Colors.foodTextSecondary },
  });
