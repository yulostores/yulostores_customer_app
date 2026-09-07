import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Keyboard,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AddressRow from '../../src/components/location/AddressRow';
import { Colors } from '../../src/constants/Colors';
import { BorderRadius, Spacing } from '../../src/constants/Theme';
import { useDeliveryLocation } from '../../src/context/DeliveryLocationContext';
import { useAccentTheme } from '../../src/hooks/useAccentTheme';
import { DEFAULT_REGION, getCurrentCoordinates, LocationError } from '../../src/lib/geo';
import { logger, reportError } from '../../src/lib/logger';
import { searchPlaces, type PlaceSuggestion } from '../../src/lib/placesSearch';
import type { LatLng } from '../../src/types/address';

const DEBOUNCE_MS = 350;

export default function LocationSearchScreen() {
  const { accent } = useAccentTheme();
  const { activeLocation } = useDeliveryLocation();
  const near: LatLng = activeLocation?.coordinates ?? DEFAULT_REGION;

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PlaceSuggestion[]>([]);
  const [searching, setSearching] = useState(false);
  const [locating, setLocating] = useState(false);
  const [touched, setTouched] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    abortRef.current?.abort();

    const q = query.trim();
    if (q.length < 3) {
      setResults([]);
      setSearching(false);
      return;
    }

    setSearching(true);
    timerRef.current = setTimeout(async () => {
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      const found = await searchPlaces(q, { near, signal: ctrl.signal });
      if (!ctrl.signal.aborted) {
        setResults(found);
        setSearching(false);
        setTouched(true);
      }
    }, DEBOUNCE_MS);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // `near` is stable enough for a search bias; re-running on its identity churn
    // would cancel in-flight lookups mid-type.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const goToMap = useCallback((coords: LatLng, source: string) => {
    Keyboard.dismiss();
    router.push({
      pathname: '/location/map',
      params: { lat: String(coords.latitude), lng: String(coords.longitude), source },
    });
  }, []);

  const useCurrentLocation = async () => {
    if (locating) return;
    setLocating(true);
    try {
      goToMap(await getCurrentCoordinates(), 'gps');
    } catch (err) {
      if (!(err instanceof LocationError)) {
        reportError('location', 'Use-current-location threw an unexpected error', err);
        throw err;
      }
      logger.warn('location', 'GPS unavailable — opening map at fallback centre', { code: err.code });
      goToMap(near, 'fallback');
    } finally {
      setLocating(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <StatusBar style="dark" />

      {/* Search bar */}
      <View style={styles.searchRow}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={Colors.foodText} />
        </Pressable>
        <View style={styles.inputWrap}>
          <Ionicons name="search" size={18} color={Colors.foodTextMuted} />
          <TextInput
            style={styles.input}
            value={query}
            onChangeText={setQuery}
            placeholder="Search area, street name, landmark…"
            placeholderTextColor={Colors.foodTextMuted}
            autoFocus
            returnKeyType="search"
            autoCorrect={false}
          />
          {searching ? (
            <ActivityIndicator size="small" color={accent} />
          ) : query.length > 0 ? (
            <Pressable onPress={() => setQuery('')} hitSlop={10}>
              <Ionicons name="close-circle" size={18} color={Colors.foodTextMuted} />
            </Pressable>
          ) : null}
        </View>
      </View>

      <ScrollView
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.body}
      >
        <AddressRow
          icon="navigate"
          primary="Use my current location"
          secondary="Uses GPS to place the pin"
          tint
          loading={locating}
          onPress={useCurrentLocation}
        />
        <View style={styles.divider} />
        <AddressRow
          icon="map"
          primary="Select location on map"
          secondary="Drop and drag the pin yourself"
          onPress={() => goToMap(near, 'manual')}
        />

        {query.trim().length >= 3 ? (
          <>
            <View style={styles.divider} />
            {results.map((r) => (
              <AddressRow
                key={r.id}
                icon="location-outline"
                primary={r.primary}
                secondary={r.secondary}
                onPress={() => goToMap(r.coordinates, 'search')}
              />
            ))}
            {!searching && touched && results.length === 0 ? (
              <Text style={styles.empty}>
                No matches. Try a nearby landmark or a 6-digit pincode.
              </Text>
            ) : null}
          </>
        ) : (
          <Text style={styles.hint}>
            Start typing to search, or drop the pin on the map.
          </Text>
        )}

        <Text style={styles.attribution}>Search by OpenStreetMap</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.foodSurface },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.foodBorder,
  },
  backBtn: { width: 36, height: 44, alignItems: 'center', justifyContent: 'center' },
  inputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    height: 44,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.foodSearchBg,
    paddingHorizontal: Spacing.md,
  },
  input: { flex: 1, fontSize: 14.5, color: Colors.foodText, padding: 0 },
  body: { paddingHorizontal: Spacing.base, paddingTop: Spacing.sm, paddingBottom: Spacing['2xl'] },
  divider: { height: 1, backgroundColor: Colors.foodBorder, marginLeft: 48 },
  hint: {
    marginTop: Spacing.lg,
    fontSize: 13,
    color: Colors.foodTextSecondary,
    textAlign: 'center',
  },
  empty: {
    marginTop: Spacing.md,
    fontSize: 13,
    color: Colors.foodTextSecondary,
    lineHeight: 19,
  },
  attribution: {
    marginTop: Spacing['2xl'],
    fontSize: 11,
    color: Colors.foodTextMuted,
    textAlign: 'center',
  },
});
