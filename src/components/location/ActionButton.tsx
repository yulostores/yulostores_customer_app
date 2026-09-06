/**
 * ActionButton — the pill CTA used across the location flow.
 *
 * `solid`   → filled brand-orange with a soft glow (primary action)
 * `outline` → orange hairline on white (secondary action)
 * Mirrors the sign-in screen's CTA sizing so the two flows feel like one app.
 */

import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Colors } from '../../constants/Colors';
import { BorderRadius, Spacing } from '../../constants/Theme';

type Variant = 'solid' | 'outline';

interface Props {
  label: string;
  onPress: () => void;
  variant?: Variant;
  icon?: React.ComponentProps<typeof Ionicons>['name'];
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}

export default function ActionButton({
  label,
  onPress,
  variant = 'solid',
  icon,
  loading = false,
  disabled = false,
  style,
}: Props) {
  const isSolid = variant === 'solid';
  const inactive = disabled || loading;
  const fg = isSolid ? Colors.authAccentText : Colors.foodAccent;

  return (
    <Pressable
      onPress={onPress}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive, busy: loading }}
      style={({ pressed }) => [
        styles.base,
        isSolid ? styles.solid : styles.outline,
        inactive && (isSolid ? styles.solidInactive : styles.outlineInactive),
        pressed && !inactive && styles.pressed,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <View style={styles.row}>
          {icon ? <Ionicons name={icon} size={18} color={fg} style={styles.icon} /> : null}
          <Text style={[styles.label, { color: fg }]}>{label}</Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    height: 54,
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.lg,
  },
  row: { flexDirection: 'row', alignItems: 'center' },
  icon: { marginRight: Spacing.sm },
  label: { fontSize: 15.5, fontWeight: '700', letterSpacing: 0.2 },
  solid: {
    backgroundColor: Colors.foodAccent,
    shadowColor: Colors.foodAccent,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.32,
    shadowRadius: 14,
    elevation: 4,
  },
  outline: {
    backgroundColor: Colors.foodSurface,
    borderWidth: 1.5,
    borderColor: Colors.foodAccent,
  },
  solidInactive: { backgroundColor: Colors.foodBorder, shadowOpacity: 0, elevation: 0 },
  outlineInactive: { borderColor: Colors.foodBorder },
  pressed: { opacity: 0.85, transform: [{ scale: 0.99 }] },
});
