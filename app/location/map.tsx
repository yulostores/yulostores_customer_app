import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import ActionButton from '../../src/components/location/ActionButton';
import CenterPin from '../../src/components/location/CenterPin';
import MapCanvas, { type MapCanvasHandle } from '../../src/components/location/MapCanvas';
import { Colors } from '../../src/constants/Colors';
import { Elevation, BorderRadius, Spacing } from '../../src/constants/Theme';
import { useDeliveryLocation } from '../../src/context/DeliveryLocationContext';
import {
  ORANGE_ACCENT,
  useAccentTheme,
  useThemedStyles,
  type AccentTheme,
} from '../../src/hooks/useAccentTheme';
import {
  DEFAULT_REGION,
  getCurrentCoordinates,
  LocationError,
  reverseGeocode,
} from '../../src/lib/geo';
import { logger, reportError } from '../../src/lib/logger';
import { checkServiceability, type ServiceabilityResult } from '../../src/services/geo';
import type { LatLng, ResolvedPlace } from '../../src/types/address';

export default function LocationMapScreen() {
  const styles = useThemedStyles(makeStyles);
  const { accent } = useAccentTheme();
  const params = useLocalSearchParams<{ lat?: string; lng?: string; source?: string }>();
  const { activeLocation } = useDeliveryLocation();

  const initialCenter: LatLng =
    params.lat && params.lng
      ? { latitude: Number(params.lat), longitude: Number(params.lng) }
      : activeLocation?.coordinates ?? DEFAULT_REGION;

  const mapRef = useRef<MapCanvasHandle>(null);
  const centerRef = useRef<LatLng>(initialCenter);
  const reqRef = useRef(0);

  const [moving, setMoving] = useState(false);
  const [place, setPlace] = useState<ResolvedPlace | null>(null);
  const [resolving, setResolving] = useState(true);
  const [locating, setLocating] = useState(false);
  const [coverage, setCoverage] = useState<ServiceabilityResult | null>(null);

  const resolve = useCallback(async (coords: LatLng) => {
    centerRef.current = coords;
    const id = ++reqRef.current;
    setResolving(true);

    // Naming the place and checking whether anyone delivers there are independent questions, so
    // they run together rather than in sequence — the customer waits for the slower of the two
    // instead of for both. The coverage check is a local geo query, not a paid lookup, so it is
    // cheap enough to re-run every time the pin settles.
    const [next, serviceable] = await Promise.all([
      reverseGeocode(coords),
      checkServiceability(coords),
    ]);

    // The request-id guard keeps a slow answer for an abandoned pin from overwriting the current
    // one — the same pattern the reverse geocode already used.
    if (id === reqRef.current) {
      setPlace(next);
      setCoverage(serviceable);
      setResolving(false);
    }
  }, []);

  // Resolve the starting point once.
  useEffect(() => {
    resolve(initialCenter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const recenterToGps = async () => {
    if (locating) return;
    setLocating(true);
    try {
      const coords = await getCurrentCoordinates();
      mapRef.current?.animateTo(coords);
      resolve(coords);
    } catch (err) {
      if (!(err instanceof LocationError)) {
        reportError('location', 'Recenter-to-GPS threw an unexpected error', err);
        throw err;
      }
      // Permission denied / no fix / timeout — keep the current pin, but leave a
      // trail so a "the locate button does nothing" report is diagnosable.
      logger.warn('location', 'Could not recenter to GPS', { code: err.code });
    } finally {
      setLocating(false);
    }
  };

  const confirm = () => {
    router.push({
      pathname: '/location/confirm',
      params: {
        lat: String(centerRef.current.latitude),
        lng: String(centerRef.current.longitude),
        place: place ? JSON.stringify(place) : '',
      },
    });
  };

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />

      <MapCanvas
        ref={mapRef}
        initialCenter={initialCenter}
        onMovingChange={setMoving}
        onCenterChange={(c) => {
          centerRef.current = c;
        }}
        onCenterSettled={resolve}
        style={StyleSheet.absoluteFill}
      />

      <View style={styles.pinLayer} pointerEvents="none">
        <CenterPin moving={moving} caption="Your order will be delivered here" />
      </View>

      {/* Top controls */}
      <SafeAreaView edges={['top']} style={styles.topBar}>
        <Pressable style={styles.circleBtn} onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="arrow-back" size={22} color={Colors.foodText} />
        </Pressable>
        <Pressable style={styles.searchPill} onPress={() => router.push('/location/search')}>
          <Ionicons name="search" size={16} color={Colors.foodTextMuted} />
          <Text style={styles.searchPillText} numberOfLines={1}>
            {resolving ? 'Locating…' : place?.title ?? 'Search for a different area'}
          </Text>
        </Pressable>
      </SafeAreaView>

      {/* Bottom sheet */}
      <View style={styles.sheet}>
        <Pressable style={styles.locateBtn} onPress={recenterToGps}>
          {locating ? (
            <ActivityIndicator size="small" color={accent} />
          ) : (
            <Ionicons name="locate" size={18} color={accent} />
          )}
          <Text style={styles.locateText}>Use current location</Text>
        </Pressable>

        <SafeAreaView edges={['bottom']}>
          <Text style={styles.kicker}>DELIVERING YOUR ORDER TO</Text>
          <View style={styles.addrRow}>
            <Ionicons name="location" size={20} color={accent} style={{ marginTop: 2 }} />
            <View style={styles.addrText}>
              {resolving ? (
                <Text style={styles.addrTitle}>Getting address…</Text>
              ) : (
                <>
                  <Text style={styles.addrTitle} numberOfLines={1}>
                    {place?.title ?? 'Pinned location'}
                  </Text>
                  <Text style={styles.addrSub} numberOfLines={2}>
                    {place?.subtitle || 'Address not detected — you can add details next'}
                  </Text>
                </>
              )}
            </View>
          </View>

          {/* Advisory, never blocking. Finding out that nothing delivers here is far better
              learned at the pin than from an empty home feed afterwards — but a customer who
              knows something we don't (a new restaurant, a radius about to change) can still
              proceed, and a failed check reports as serviceable so an API hiccup never traps
              anyone. */}
          {!resolving && coverage && !coverage.serviceable && (
            <View style={styles.coverageWarning}>
              <Ionicons name="alert-circle" size={16} color={Colors.warning} />
              <Text style={styles.coverageText}>
                No restaurants deliver to this spot yet. You can still save it, but a pin closer
                to a market area will give you more choice.
              </Text>
            </View>
          )}

          <ActionButton
            label="Confirm location & proceed"
            onPress={confirm}
            disabled={moving}
            style={styles.confirm}
          />
        </SafeAreaView>
      </View>
    </View>
  );
}

const makeStyles = (t: AccentTheme) =>
  StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.locMapWash },
  pinLayer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.base,
    paddingTop: Spacing.sm,
  },
  circleBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: Colors.foodSurface,
    alignItems: 'center',
    justifyContent: 'center',
    ...Elevation.raised,
  },
  searchPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    height: 42,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.white,
    paddingHorizontal: Spacing.base,
    ...Elevation.raised,
  },
  searchPillText: { flex: 1, fontSize: 13.5, color: Colors.foodText },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: Colors.foodSurface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.md,
    ...Elevation.sticky,
  },
  locateBtn: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    marginBottom: Spacing.xs,
  },
  locateText: { fontSize: 13, fontWeight: '700', color: t.accent },
  kicker: {
    fontSize: 10.5,
    fontWeight: '700',
    letterSpacing: 0.8,
    color: Colors.foodTextMuted,
    marginTop: Spacing.xs,
  },
  addrRow: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.sm },
  addrText: { flex: 1 },
  addrTitle: { fontSize: 16, fontWeight: '700', color: Colors.foodText },
  addrSub: { fontSize: 13, color: Colors.foodTextSecondary, marginTop: 2, lineHeight: 18 },
  coverageWarning: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.sm,
    marginTop: Spacing.base,
    padding: Spacing.sm,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.warning + '14',
  },
  coverageText: { flex: 1, fontSize: 12, lineHeight: 17, color: Colors.foodTextSecondary },
  confirm: { marginTop: Spacing.base, marginBottom: Spacing.sm },
  });

const styles = makeStyles(ORANGE_ACCENT);
