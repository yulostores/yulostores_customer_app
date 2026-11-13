/**
 * DemographicsFields — optional gender chips and a DD/MM/YYYY date of birth, with the short
 * "why we ask" line. Shared by Edit profile and the one-time prompt.
 */
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Colors } from '../../constants/Colors';
import { BorderRadius, Spacing } from '../../constants/Theme';
import { useThemedStyles, type AccentTheme } from '../../hooks/useAccentTheme';
import { GENDER_OPTIONS, maskDobInput, WHY_WE_ASK, type Gender } from '../../lib/demographics';

export function DemographicsFields({
  gender,
  onGender,
  dob,
  onDob,
  dobError,
}: {
  gender: Gender | null;
  onGender: (g: Gender | null) => void;
  dob: string;
  onDob: (text: string) => void;
  dobError?: string | null;
}) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View>
      <Text style={styles.why}>{WHY_WE_ASK}</Text>
      <Text style={styles.label}>Gender (optional)</Text>
      <View style={styles.chips} accessibilityRole="radiogroup">
        {GENDER_OPTIONS.map((o) => {
          const on = gender === o.value;
          return (
            <Pressable
              key={o.value}
              accessibilityRole="radio"
              accessibilityState={{ checked: on }}
              onPress={() => onGender(on ? null : o.value)}
              style={[styles.chip, on && styles.chipOn]}
            >
              <Text style={[styles.chipText, on && styles.chipTextOn]}>{o.label}</Text>
            </Pressable>
          );
        })}
      </View>
      <Text style={[styles.label, { marginTop: Spacing.lg }]}>Date of birth (optional)</Text>
      <TextInput
        style={[styles.input, dobError ? styles.inputError : null]}
        value={dob}
        onChangeText={(t) => onDob(maskDobInput(t))}
        placeholder="DD/MM/YYYY"
        placeholderTextColor={Colors.foodTextMuted}
        keyboardType="number-pad"
        maxLength={10}
        accessibilityLabel="Date of birth, day month year"
      />
      {dobError ? <Text style={styles.error}>{dobError}</Text> : null}
    </View>
  );
}

const makeStyles = (t: AccentTheme) =>
  StyleSheet.create({
    why: { fontSize: 12.5, lineHeight: 18, color: Colors.foodTextSecondary, marginBottom: Spacing.md },
    label: { fontSize: 12, fontWeight: '700', color: Colors.foodTextSecondary, marginBottom: 6, letterSpacing: 0.3 },
    chips: { flexDirection: 'row', gap: Spacing.sm },
    chip: {
      paddingHorizontal: Spacing.base,
      height: 40,
      borderRadius: BorderRadius.full,
      borderWidth: 1.5,
      borderColor: Colors.foodBorderStrong,
      alignItems: 'center',
      justifyContent: 'center',
    },
    chipOn: { borderColor: t.accent, backgroundColor: t.accentLight },
    chipText: { fontSize: 14, fontWeight: '600', color: Colors.foodText },
    chipTextOn: { color: t.accentDark, fontWeight: '800' },
    input: {
      height: 52,
      borderRadius: BorderRadius.md,
      borderWidth: 1.5,
      borderColor: Colors.foodBorderStrong,
      paddingHorizontal: Spacing.base,
      fontSize: 14.5,
      color: Colors.foodText,
      backgroundColor: Colors.foodSurface,
    },
    inputError: { borderColor: Colors.authDanger },
    error: { marginTop: 6, fontSize: 12.5, color: Colors.authDanger },
  });
