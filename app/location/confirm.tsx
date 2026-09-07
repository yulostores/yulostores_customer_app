/**
 * app/location/confirm.tsx — Premium "Add address details" form.
 *
 * Flow: map.tsx → (lat, lng, place JSON) → here → saved to /api/users/me/addresses
 *
 * UX (Zomato/Swiggy style):
 *  ① Geo-resolved location card with "Change" link
 *  ② Editable address chips: Street · Pincode · City · State
 *     Pre-filled from reverse-geocode, each individually tappable to edit
 *  ③ House / Flat / Block no. (required)
 *  ④ Floor (optional) + Landmark (optional) row
 *  ⑤ Address label: Home / Work / Other
 *  ⑥ Receiver details (collapsible optional section)
 *  ⑦ "Set as default" toggle
 *  ⑧ Save Address CTA
 *
 * Every field is sent to the backend as a separate named field so the DB stores
 * pincode / state / street / city individually, not collapsed into one line.
 */

import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useMemo, useRef, useState } from 'react';
import {
  Animated,
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
import { buildAddressPayload } from '../../src/lib/address';
import { logger, reportError } from '../../src/lib/logger';
import { ApiError } from '../../src/services/api';
import type { AddressLabel, LatLng, ResolvedPlace } from '../../src/types/address';

// ─── Small presentational components ─────────────────────────────────────────

/** Standard labelled text field */
function Field({
  label,
  required,
  ...input
}: { label: string; required?: boolean } & React.ComponentProps<typeof TextInput>) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={fieldStyles.wrap}>
      <Text style={fieldStyles.label}>
        {label}
        {required ? <Text style={{ color: Colors.foodAccent }}> *</Text> : null}
      </Text>
      <TextInput
        style={[fieldStyles.input, focused && fieldStyles.inputFocused]}
        placeholderTextColor={Colors.foodTextMuted}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        {...input}
      />
    </View>
  );
}

const fieldStyles = StyleSheet.create({
  wrap: { marginBottom: Spacing.base },
  label: { fontSize: 12, fontWeight: '700', color: Colors.foodTextSecondary, marginBottom: 6, letterSpacing: 0.3 },
  input: {
    height: 52,
    borderRadius: BorderRadius.md,
    borderWidth: 1.5,
    borderColor: Colors.foodBorder,
    paddingHorizontal: Spacing.base,
    fontSize: 14.5,
    color: Colors.foodText,
    backgroundColor: Colors.foodSurface,
  },
  inputFocused: { borderColor: Colors.foodAccent },
});

/** Editable "chip" — shows a pre-filled value with a pencil icon; tapping focuses a TextInput */
function EditableChip({
  icon,
  label,
  value,
  placeholder,
  onChangeText,
  keyboardType,
  maxLength,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  placeholder: string;
  onChangeText: (t: string) => void;
  keyboardType?: React.ComponentProps<typeof TextInput>['keyboardType'];
  maxLength?: number;
}) {
  const inputRef = useRef<TextInput>(null);
  const [focused, setFocused] = useState(false);
  const hasValue = value.trim().length > 0;

  return (
    <Pressable style={[chipStyles.chip, focused && chipStyles.chipFocused]} onPress={() => inputRef.current?.focus()}>
      <Ionicons name={icon} size={14} color={focused ? Colors.foodAccent : Colors.foodTextMuted} style={{ marginTop: 1 }} />
      <View style={chipStyles.inner}>
        <Text style={chipStyles.chipLabel}>{label}</Text>
        <TextInput
          ref={inputRef}
          style={chipStyles.chipInput}
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={Colors.foodTextMuted}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          keyboardType={keyboardType}
          maxLength={maxLength}
          returnKeyType="done"
        />
      </View>
      <Ionicons name="create-outline" size={13} color={hasValue || focused ? Colors.foodAccent : Colors.foodBorder} />
    </Pressable>
  );
}

const chipStyles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    flex: 1,
    backgroundColor: Colors.foodSurface,
    borderRadius: BorderRadius.md,
    borderWidth: 1.5,
    borderColor: Colors.foodBorder,
    paddingHorizontal: Spacing.sm + 2,
    paddingVertical: Spacing.sm,
    minHeight: 56,
  },
  chipFocused: { borderColor: Colors.foodAccent, backgroundColor: Colors.foodAccentLight + '60' },
  inner: { flex: 1 },
  chipLabel: { fontSize: 10, fontWeight: '700', color: Colors.foodTextMuted, letterSpacing: 0.3, marginBottom: 2 },
  chipInput: { fontSize: 13.5, fontWeight: '600', color: Colors.foodText, padding: 0 },
});

/** Collapsible section header */
function SectionToggle({
  label,
  open,
  onPress,
}: {
  label: string;
  open: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable style={sectionStyles.toggle} onPress={onPress}>
      <Text style={sectionStyles.label}>{label}</Text>
      <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={16} color={Colors.foodTextSecondary} />
    </Pressable>
  );
}

const sectionStyles = StyleSheet.create({
  toggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.md,
    marginTop: Spacing.sm,
  },
  label: { fontSize: 13.5, fontWeight: '700', color: Colors.foodTextSecondary },
});

// ─── Main Screen ──────────────────────────────────────────────────────────────

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

  // ── Pre-fill all fields from reverse geocode ──────────────────────────────
  const [house, setHouse] = useState('');
  const [floor, setFloor] = useState('');
  const [landmark, setLandmark] = useState('');

  // Address sub-components — individually editable
  const [street, setStreet] = useState(place?.street ?? '');
  const [pincode, setPincode] = useState(place?.pincode ?? '');
  const [city, setCity] = useState(place?.city ?? '');
  const [state, setState] = useState(place?.region ?? '');

  const [label, setLabel] = useState<AddressLabel>('home');
  const [customLabel, setCustomLabel] = useState('');
  const [isDefault, setIsDefault] = useState(false);

  // Optional receiver section
  const [receiverOpen, setReceiverOpen] = useState(false);
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const receiverAnim = useRef(new Animated.Value(0)).current;
  const toggleReceiver = () => {
    const next = !receiverOpen;
    setReceiverOpen(next);
    Animated.spring(receiverAnim, {
      toValue: next ? 1 : 0,
      useNativeDriver: false,
      tension: 120,
      friction: 12,
    }).start();
  };

  const canSave =
    house.trim().length > 0 &&
    (label !== 'other' || customLabel.trim().length > 0) &&
    !saving;

  const onSave = async () => {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    try {
      // Build the payload manually so each field is sent as a separate DB column
      const streetLine = [
        house.trim(),
        floor.trim() ? `Floor ${floor.trim()}` : undefined,
        landmark.trim() || undefined,
      ]
        .filter(Boolean)
        .join(', ') || street || place?.title || undefined;

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

      // Override with individually corrected sub-fields
      payload.street = streetLine;
      payload.city = city.trim() || place?.city;
      payload.state = state.trim() || place?.region;
      payload.pincode = pincode.trim() || place?.pincode;

      await saveAddress(payload);
      // Go to saved addresses list so the user sees their new entry
      router.replace('/address');
    } catch (err) {
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

  const resolvedTitle = place?.title ?? 'Pinned location';
  const resolvedSub =
    [place?.street, place?.district, place?.city, place?.region, place?.pincode]
      .filter(Boolean)
      .join(', ') || 'Address details not detected';

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <StatusBar style="dark" />

      {/* ── Header ── */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={Colors.foodText} />
        </Pressable>
        <Text style={styles.headerTitle}>Add address details</Text>
        <View style={{ width: 36 }} />
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
          {/* ① Resolved location card */}
          <View style={styles.locCard}>
            <View style={styles.locIconWrap}>
              <Ionicons name="location" size={18} color={Colors.foodAccent} />
            </View>
            <View style={styles.flex}>
              <Text style={styles.locTitle} numberOfLines={1}>{resolvedTitle}</Text>
              <Text style={styles.locSub} numberOfLines={2}>{resolvedSub}</Text>
            </View>
            <Pressable onPress={() => router.back()} hitSlop={8} style={styles.changeBtn}>
              <Text style={styles.changeBtnText}>Change</Text>
            </Pressable>
          </View>

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          {/* ② Address sub-fields — Editable chips row */}
          <Text style={styles.sectionTitle}>CONFIRM ADDRESS DETAILS</Text>
          <Text style={styles.sectionSubtitle}>Pre-filled from your pin. Tap any field to correct it.</Text>

          <View style={styles.chipsGrid}>
            <View style={styles.chipFullRow}>
              <EditableChip
                icon="navigate-circle-outline"
                label="STREET / AREA"
                value={street}
                placeholder={place?.street ?? 'Street, area, colony…'}
                onChangeText={setStreet}
              />
            </View>
            <View style={styles.chipRow}>
              <EditableChip
                icon="mail-outline"
                label="PINCODE"
                value={pincode}
                placeholder={place?.pincode ?? '6-digit code'}
                onChangeText={(t) => setPincode(t.replace(/\D/g, '').slice(0, 6))}
                keyboardType="number-pad"
                maxLength={6}
              />
              <EditableChip
                icon="business-outline"
                label="CITY"
                value={city}
                placeholder={place?.city ?? 'City'}
                onChangeText={setCity}
              />
            </View>
            <View style={styles.chipFullRow}>
              <EditableChip
                icon="map-outline"
                label="STATE"
                value={state}
                placeholder={place?.region ?? 'State'}
                onChangeText={setState}
              />
            </View>
          </View>

          {/* Divider */}
          <View style={styles.divider} />

          {/* ③ House / flat details */}
          <Text style={styles.sectionTitle}>FLAT / HOUSE DETAILS</Text>

          <Field
            label="House / Flat / Block no."
            required
            value={house}
            onChangeText={setHouse}
            placeholder="e.g. B-402, Sunrise Apartments"
            autoFocus={pincode.length > 0}
            returnKeyType="next"
          />

          <View style={styles.pairRow}>
            <View style={styles.flex}>
              <Field
                label="Floor (optional)"
                value={floor}
                onChangeText={setFloor}
                placeholder="e.g. 4th"
                keyboardType="default"
              />
            </View>
            <View style={styles.flex}>
              <Field
                label="Landmark (optional)"
                value={landmark}
                onChangeText={setLandmark}
                placeholder="e.g. Near City Mall"
              />
            </View>
          </View>

          {/* Divider */}
          <View style={styles.divider} />

          {/* ④ Address label */}
          <Text style={styles.sectionTitle}>SAVE ADDRESS AS</Text>
          <LabelChips value={label} onChange={setLabel} />
          {label === 'other' ? (
            <TextInput
              style={[fieldStyles.input, { marginTop: Spacing.md }]}
              value={customLabel}
              onChangeText={(t) => setCustomLabel(t.slice(0, 40))}
              placeholder="Name it — e.g. Gym, Mom's place"
              placeholderTextColor={Colors.foodTextMuted}
            />
          ) : null}

          {/* Divider */}
          <View style={styles.divider} />

          {/* ⑤ Receiver details (collapsible) */}
          <SectionToggle
            label="Receiver details (optional)"
            open={receiverOpen}
            onPress={toggleReceiver}
          />

          {receiverOpen ? (
            <View style={styles.receiverSection}>
              <Text style={styles.receiverHint}>
                Fill this if someone else (family, colleague, reception) receives the order here.
              </Text>
              <Field
                label="Receiver's name"
                value={contactName}
                onChangeText={setContactName}
                placeholder="Full name"
              />
              <Field
                label="Receiver's phone"
                value={contactPhone}
                onChangeText={(t) => setContactPhone(t.replace(/\D/g, '').slice(0, 10))}
                placeholder="10-digit mobile number"
                keyboardType="number-pad"
              />
            </View>
          ) : null}

          {/* Divider */}
          <View style={styles.divider} />

          {/* ⑥ Set as default */}
          <Pressable style={styles.defaultRow} onPress={() => setIsDefault((v) => !v)}>
            <View style={styles.defaultIconWrap}>
              <Ionicons name="star" size={18} color={isDefault ? Colors.foodAccent : Colors.foodTextMuted} />
            </View>
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

          {!canSave && house.trim().length === 0 ? (
            <Text style={styles.requiredHint}>
              * House / Flat number is required to save this address
            </Text>
          ) : null}
        </ScrollView>

        {/* ── Footer CTA ── */}
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

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.foodSurface },
  flex: { flex: 1 },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.sm + 2,
    borderBottomWidth: 1,
    borderBottomColor: Colors.foodBorder,
  },
  backBtn: { width: 36, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '800', color: Colors.foodText },

  // Body
  body: {
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing['3xl'],
  },

  // Location card
  locCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    backgroundColor: Colors.foodBgSecondary,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    marginBottom: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.foodBorder,
  },
  locIconWrap: {
    width: 34,
    height: 34,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.foodAccentLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  locTitle: { fontSize: 14.5, fontWeight: '700', color: Colors.foodText },
  locSub: { fontSize: 12.5, color: Colors.foodTextSecondary, marginTop: 2, lineHeight: 17 },
  changeBtn: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.foodAccentLight,
    alignSelf: 'flex-start',
    marginTop: 2,
  },
  changeBtnText: { fontSize: 12.5, fontWeight: '800', color: Colors.foodAccent },

  // Error
  errorText: {
    fontSize: 13,
    color: Colors.authDanger,
    marginBottom: Spacing.md,
    backgroundColor: '#FEF2F2',
    padding: Spacing.sm,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: '#FECACA',
  },

  // Section labels
  sectionTitle: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
    color: Colors.foodTextMuted,
    marginBottom: 4,
  },
  sectionSubtitle: {
    fontSize: 12,
    color: Colors.foodTextSecondary,
    marginBottom: Spacing.md,
    lineHeight: 17,
  },

  // Chips grid
  chipsGrid: { gap: Spacing.sm, marginBottom: Spacing.base },
  chipFullRow: { flexDirection: 'row' },
  chipRow: { flexDirection: 'row', gap: Spacing.sm },

  // Divider
  divider: {
    height: 1,
    backgroundColor: Colors.foodBorder,
    marginVertical: Spacing.xl,
  },

  // Pair row
  pairRow: { flexDirection: 'row', gap: Spacing.md },

  // Receiver section
  receiverSection: {
    backgroundColor: Colors.foodBgSecondary,
    borderRadius: BorderRadius.lg,
    padding: Spacing.base,
    marginTop: Spacing.xs,
    borderWidth: 1,
    borderColor: Colors.foodBorder,
  },
  receiverHint: {
    fontSize: 12.5,
    color: Colors.foodTextSecondary,
    lineHeight: 17,
    marginBottom: Spacing.base,
  },

  // Default row
  defaultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  defaultIconWrap: {
    width: 38,
    height: 38,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.foodBgSecondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  defaultTitle: { fontSize: 14.5, fontWeight: '600', color: Colors.foodText },
  defaultSub: { fontSize: 12.5, color: Colors.foodTextSecondary, marginTop: 2 },

  requiredHint: {
    fontSize: 12,
    color: Colors.foodTextSecondary,
    marginTop: Spacing.sm,
    fontStyle: 'italic',
  },

  // Footer
  footer: {
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.md,
    paddingBottom: Platform.OS === 'ios' ? Spacing.xl : Spacing.base,
    borderTopWidth: 1,
    borderTopColor: Colors.foodBorder,
    backgroundColor: Colors.foodSurface,
  },
});
