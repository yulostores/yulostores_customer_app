import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import ActionButton from '../../src/components/location/ActionButton';
import LabelChips from '../../src/components/location/LabelChips';
import { Colors } from '../../src/constants/Colors';
import { BorderRadius, Spacing } from '../../src/constants/Theme';
import { useDeliveryLocation } from '../../src/context/DeliveryLocationContext';
import { buildAddressPayload, summarisePlace } from '../../src/lib/address';
import { logger, reportError } from '../../src/lib/logger';
import { ApiError } from '../../src/services/api';
import type { AddressLabel, LatLng, ResolvedPlace } from '../../src/types/address';

function Field({
  label,
  ...input
}: { label: string } & React.ComponentProps<typeof TextInput>) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={styles.input}
        placeholderTextColor={Colors.foodTextMuted}
        {...input}
      />
    </View>
  );
}

export default function LocationConfirmScreen() {
  const { lat, lng, place: placeRaw } = useLocalSearchParams<{
    lat?: string;
    lng?: string;
    place?: string;
  }>();
  const { saveAddress } = useDeliveryLocation();

  const coordinates: LatLng = {
    latitude: Number(lat ?? 0),
    longitude: Number(lng ?? 0),
  };
  const place: ResolvedPlace | null = useMemo(() => {
    if (!placeRaw) return null;
    try {
      return JSON.parse(placeRaw) as ResolvedPlace;
    } catch (err) {
      logger.warn('location', 'Could not parse place param on confirm screen', {
        reason: err instanceof Error ? err.message : String(err),
      });
      return null;
    }
  }, [placeRaw]);
  const summary = summarisePlace(place);

  const [house, setHouse] = useState('');
  const [floor, setFloor] = useState('');
  const [landmark, setLandmark] = useState('');
  const [label, setLabel] = useState<AddressLabel>('home');
  const [customLabel, setCustomLabel] = useState('');
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [isDefault, setIsDefault] = useState(false);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSave =
    house.trim().length > 0 &&
    (label !== 'other' || customLabel.trim().length > 0) &&
    !saving;

  const onSave = async () => {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    try {
      const payload = buildAddressPayload(coordinates, place, {
        house,
        floor,
        landmark,
        label,
        customLabel,
        contactName,
        contactPhone,
        isDefault,
      });
      await saveAddress(payload);
      router.replace('/');
    } catch (err) {
      // `saveAddress` only rethrows genuine server rejections (validation, 5xx);
      // auth/network failures are handled inside it as an on-device save.
      reportError('location', 'Address save failed on confirm screen', err, {
        label,
        isDefault,
      });
      setError(
        err instanceof ApiError
          ? err.message
          : 'Could not save this address. Please try again.',
      );
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <StatusBar style="dark" />

      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={Colors.foodText} />
        </Pressable>
        <Text style={styles.headerTitle}>Add address details</Text>
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={8}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.body}
        >
          {/* Resolved location card */}
          <View style={styles.locCard}>
            <Ionicons name="location" size={20} color={Colors.foodAccent} style={{ marginTop: 2 }} />
            <View style={styles.flex}>
              <Text style={styles.locTitle} numberOfLines={1}>
                {summary.title}
              </Text>
              <Text style={styles.locSub} numberOfLines={2}>
                {summary.subtitle}
              </Text>
            </View>
            <Pressable onPress={() => router.back()} hitSlop={8}>
              <Text style={styles.changeLink}>Change</Text>
            </Pressable>
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Field
            label="House / Flat / Block no."
            value={house}
            onChangeText={setHouse}
            placeholder="e.g. B-402, Sunrise Apartments"
            autoFocus
          />
          <View style={styles.pairRow}>
            <View style={styles.flex}>
              <Field
                label="Floor (optional)"
                value={floor}
                onChangeText={setFloor}
                placeholder="e.g. 4"
              />
            </View>
            <View style={styles.flex}>
              <Field
                label="Landmark (optional)"
                value={landmark}
                onChangeText={setLandmark}
                placeholder="e.g. near City Hospital"
              />
            </View>
          </View>

          <Text style={styles.fieldLabel}>Save address as</Text>
          <LabelChips value={label} onChange={setLabel} />
          {label === 'other' ? (
            <TextInput
              style={[styles.input, styles.customLabelInput]}
              value={customLabel}
              onChangeText={(t) => setCustomLabel(t.slice(0, 40))}
              placeholder="Name this address, e.g. Gym, Mom's place"
              placeholderTextColor={Colors.foodTextMuted}
            />
          ) : null}

          <Text style={[styles.fieldLabel, styles.sectionGap]}>Receiver details (optional)</Text>
          <Field
            label="Receiver's name"
            value={contactName}
            onChangeText={setContactName}
            placeholder="Who receives the order here"
          />
          <Field
            label="Receiver's phone"
            value={contactPhone}
            onChangeText={(t) => setContactPhone(t.replace(/\D/g, '').slice(0, 10))}
            placeholder="10-digit mobile number"
            keyboardType="number-pad"
          />

          <Pressable style={styles.defaultRow} onPress={() => setIsDefault((v) => !v)}>
            <View style={styles.flex}>
              <Text style={styles.defaultTitle}>Set as default address</Text>
              <Text style={styles.defaultSub}>Used automatically at checkout</Text>
            </View>
            <Switch
              value={isDefault}
              onValueChange={setIsDefault}
              trackColor={{ true: Colors.foodAccent, false: Colors.foodBorder }}
              thumbColor={Colors.white}
            />
          </Pressable>
        </ScrollView>

        <View style={styles.footer}>
          <ActionButton
            label="Save address"
            onPress={onSave}
            loading={saving}
            disabled={!canSave}
          />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.foodSurface },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.foodBorder,
  },
  backBtn: { width: 36, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '700', color: Colors.foodText },
  body: {
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing['3xl'],
  },
  locCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    backgroundColor: Colors.foodBgSecondary,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.lg,
  },
  locTitle: { fontSize: 14.5, fontWeight: '700', color: Colors.foodText },
  locSub: { fontSize: 12.5, color: Colors.foodTextSecondary, marginTop: 2, lineHeight: 17 },
  changeLink: { fontSize: 13, fontWeight: '700', color: Colors.foodAccent },
  error: {
    fontSize: 13,
    color: Colors.authDanger,
    marginBottom: Spacing.md,
  },
  field: { marginBottom: Spacing.base },
  fieldLabel: {
    fontSize: 12.5,
    fontWeight: '700',
    color: Colors.foodTextSecondary,
    marginBottom: 6,
  },
  input: {
    height: 50,
    borderRadius: BorderRadius.md,
    borderWidth: 1.5,
    borderColor: Colors.foodBorder,
    paddingHorizontal: Spacing.base,
    fontSize: 14.5,
    color: Colors.foodText,
    backgroundColor: Colors.foodSurface,
  },
  pairRow: { flexDirection: 'row', gap: Spacing.md },
  customLabelInput: { marginTop: Spacing.md },
  sectionGap: { marginTop: Spacing.xl },
  defaultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: Spacing.xl,
    paddingVertical: Spacing.sm,
  },
  defaultTitle: { fontSize: 14.5, fontWeight: '600', color: Colors.foodText },
  defaultSub: { fontSize: 12.5, color: Colors.foodTextSecondary, marginTop: 2 },
  footer: {
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.md,
    paddingBottom: Platform.OS === 'ios' ? Spacing.xl : Spacing.base,
    borderTopWidth: 1,
    borderTopColor: Colors.foodBorder,
    backgroundColor: Colors.foodSurface,
  },
});
