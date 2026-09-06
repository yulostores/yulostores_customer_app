/**
 * AddressRow — icon + two-line address, used for search results, the saved-list
 * and the "current location" shortcut.
 */

import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Colors } from '../../constants/Colors';
import { Spacing } from '../../constants/Theme';

interface Props {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  primary: string;
  secondary?: string;
  onPress?: () => void;
  tint?: boolean;
  loading?: boolean;
  chevron?: boolean;
}

export default function AddressRow({
  icon,
  primary,
  secondary,
  onPress,
  tint = false,
  loading = false,
  chevron = false,
}: Props) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress || loading}
      style={({ pressed }) => [styles.row, pressed && onPress ? styles.pressed : null]}
    >
      <View style={[styles.iconWrap, tint && styles.iconWrapTint]}>
        {loading ? (
          <ActivityIndicator size="small" color={Colors.foodAccent} />
        ) : (
          <Ionicons name={icon} size={18} color={tint ? Colors.foodAccent : Colors.foodTextSecondary} />
        )}
      </View>

      <View style={styles.body}>
        <Text style={[styles.primary, tint && styles.primaryTint]} numberOfLines={1}>
          {primary}
        </Text>
        {secondary ? (
          <Text style={styles.secondary} numberOfLines={2}>
            {secondary}
          </Text>
        ) : null}
      </View>

      {chevron ? (
        <Ionicons name="chevron-forward" size={16} color={Colors.foodTextMuted} />
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.md,
    gap: Spacing.md,
  },
  pressed: { opacity: 0.6 },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.foodBgSecondary,
  },
  iconWrapTint: { backgroundColor: Colors.foodAccentLight },
  body: { flex: 1 },
  primary: { fontSize: 14.5, fontWeight: '600', color: Colors.foodText },
  primaryTint: { color: Colors.foodAccent },
  secondary: { fontSize: 12.5, color: Colors.foodTextSecondary, marginTop: 2, lineHeight: 17 },
});
