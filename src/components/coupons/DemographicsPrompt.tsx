/**
 * DemographicsPrompt — the one-time sheet after the first coupon (useDemographicsPrompt decides
 * when). "Not now" closes it for good; Save writes PATCH /api/users/me.
 */
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../../constants/Colors';
import { BorderRadius, Spacing } from '../../constants/Theme';
import { useDemographicsPrompt } from '../../hooks/useDemographicsPrompt';
import { useThemedStyles, type AccentTheme } from '../../hooks/useAccentTheme';
import { parseDob, type Gender } from '../../lib/demographics';
import { reportError } from '../../lib/logger';
import { ApiError } from '../../services/api';
import { updateProfile } from '../../services/profile';
import ActionButton from '../location/ActionButton';
import { DemographicsFields } from './DemographicsFields';

export function DemographicsPrompt({ hasCoupon }: { hasCoupon: boolean }) {
  const { visible, close } = useDemographicsPrompt(hasCoupon);
  const styles = useThemedStyles(makeStyles);
  const insets = useSafeAreaInsets();
  const [gender, setGender] = useState<Gender | null>(null);
  const [dob, setDob] = useState('');
  const [dobError, setDobError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const parsed = parseDob(dob);
  const canSave = !saving && (gender != null || (parsed.ok && parsed.value != null));

  const save = async () => {
    if (!parsed.ok) return setDobError(parsed.error);
    setSaving(true);
    setError(null);
    try {
      await updateProfile({
        ...(gender ? { gender } : {}),
        ...(parsed.value ? { dateOfBirth: parsed.value } : {}),
      });
      close();
    } catch (err) {
      if (!(err instanceof ApiError) || err.status >= 500) reportError('coupons', 'Saving demographics failed', err);
      setError(err instanceof ApiError ? err.message : 'Could not save. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <Pressable style={styles.backdrop} onPress={close} accessibilityLabel="Close" />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + Spacing.base }]}>
        <Text style={styles.title}>Better offers for you</Text>
        <DemographicsFields
          gender={gender}
          onGender={setGender}
          dob={dob}
          onDob={(t) => {
            setDob(t);
            setDobError(null);
          }}
          dobError={dobError}
        />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <View style={{ marginTop: Spacing.xl, gap: Spacing.sm }}>
          <ActionButton label="Save" onPress={save} loading={saving} disabled={!canSave} />
          <Pressable onPress={close} style={styles.notNow} accessibilityRole="button">
            <Text style={styles.notNowText}>Not now</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const makeStyles = (_t: AccentTheme) =>
  StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: 'rgba(20,22,26,0.45)' },
    sheet: {
      backgroundColor: Colors.foodSurface,
      borderTopLeftRadius: BorderRadius.xl,
      borderTopRightRadius: BorderRadius.xl,
      paddingHorizontal: Spacing.xl,
      paddingTop: Spacing.xl,
    },
    title: { fontSize: 19, fontWeight: '800', color: Colors.foodText, marginBottom: Spacing.sm },
    error: { marginTop: Spacing.md, fontSize: 13, color: Colors.authDanger },
    notNow: { height: 44, alignItems: 'center', justifyContent: 'center' },
    notNowText: { fontSize: 14, fontWeight: '700', color: Colors.foodTextSecondary },
  });
