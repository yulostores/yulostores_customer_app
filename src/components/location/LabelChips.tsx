/**
 * LabelChips — Home / Work / Other selector for tagging a saved address.
 * Maps 1:1 onto the backend's `label` enum (see User.js `addressSchema`).
 */

import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Colors } from '../../constants/Colors';
import { BorderRadius, Spacing } from '../../constants/Theme';
import {
  ORANGE_ACCENT,
  useAccentTheme,
  useThemedStyles,
  type AccentTheme,
} from '../../hooks/useAccentTheme';
import type { AddressLabel } from '../../types/address';

const OPTIONS: { value: AddressLabel; label: string; icon: React.ComponentProps<typeof Ionicons>['name'] }[] = [
  { value: 'home', label: 'Home', icon: 'home' },
  { value: 'work', label: 'Work', icon: 'briefcase' },
  { value: 'other', label: 'Other', icon: 'bookmark' },
];

interface Props {
  value: AddressLabel;
  onChange: (value: AddressLabel) => void;
}

export default function LabelChips({ value, onChange }: Props) {
  const styles = useThemedStyles(makeStyles);
  const { accent } = useAccentTheme();
  return (
    <View style={styles.row}>
      {OPTIONS.map((opt) => {
        const active = opt.value === value;
        return (
          <Pressable
            key={opt.value}
            onPress={() => onChange(opt.value)}
            accessibilityRole="radio"
            accessibilityState={{ selected: active }}
            style={[styles.chip, active && styles.chipActive]}
          >
            <Ionicons
              name={opt.icon}
              size={15}
              color={active ? accent : Colors.foodTextSecondary}
            />
            <Text style={[styles.label, active && styles.labelActive]}>{opt.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const makeStyles = (t: AccentTheme) =>
  StyleSheet.create({
  row: { flexDirection: 'row', gap: Spacing.sm },
  chip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 42,
    borderRadius: BorderRadius.md,
    borderWidth: 1.5,
    borderColor: Colors.foodBorderStrong,
    backgroundColor: Colors.foodSurface,
  },
  chipActive: { borderColor: t.accent, backgroundColor: t.accentLight },
  label: { fontSize: 13.5, fontWeight: '600', color: Colors.foodTextSecondary },
  labelActive: { color: t.accent },
  });

const styles = makeStyles(ORANGE_ACCENT);
