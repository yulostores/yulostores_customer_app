import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import {
  Dimensions,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import ActionButton from '../../src/components/location/ActionButton';
import AddressRow from '../../src/components/location/AddressRow';
import { Colors } from '../../src/constants/Colors';
import { BorderRadius, Spacing } from '../../src/constants/Theme';
import { useDeliveryLocation } from '../../src/context/DeliveryLocationContext';
import {
  ORANGE_ACCENT,
  useAccentTheme,
  useThemedStyles,
  type AccentTheme,
} from '../../src/hooks/useAccentTheme';
import { getCurrentCoordinates, LocationError } from '../../src/lib/geo';
import { logger, reportError } from '../../src/lib/logger';
import type { SavedAddress } from '../../src/types/address';

const { height: SCREEN_H } = Dimensions.get('window');
const MAP_H = Math.round(SCREEN_H * 0.42);

const LABEL_ICON = { home: 'home', work: 'briefcase', other: 'bookmark' } as const;

export default function LocationEntryScreen() {
  const styles = useThemedStyles(makeStyles);
  const { accent } = useAccentTheme();
  const { savedAddresses, chooseSaved } = useDeliveryLocation();
  const [locating, setLocating] = useState(false);
  const [permHint, setPermHint] = useState(false);

  const leave = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };

  const useCurrentLocation = async () => {
    if (locating) return;
    setLocating(true);
    setPermHint(false);
    try {
      const coords = await getCurrentCoordinates();
      router.push({
        pathname: '/location/map',
        params: { lat: String(coords.latitude), lng: String(coords.longitude), source: 'gps' },
      });
    } catch (err) {
      if (err instanceof LocationError && err.code === 'PERMISSION_DENIED') {
        logger.warn('location', 'Location permission denied on entry screen');
        setPermHint(true);
      } else {
        if (!(err instanceof LocationError)) {
          reportError('location', 'Use-current-location threw an unexpected error', err);
        } else {
          logger.warn('location', 'GPS unavailable — opening map at fallback centre', { code: err.code });
        }
        router.push({ pathname: '/location/map', params: { source: 'fallback' } });
      }
    } finally {
      setLocating(false);
    }
  };

  const pickSaved = (a: SavedAddress) => {
    chooseSaved(a);
    leave();
  };

  return (
    <View style={styles.root}>
      <StatusBar style="dark" />

      {/* Illustrated map header */}
      <View style={[styles.mapArea, { height: MAP_H }]}>
        <LinearGradient
          colors={[Colors.locMapWash, '#EFF6F1']}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.grid} pointerEvents="none">
          {Array.from({ length: 6 }).map((_, i) => (
            <View key={`h${i}`} style={[styles.gridLine, { top: `${(i + 1) * 14}%` }]} />
          ))}
          {Array.from({ length: 5 }).map((_, i) => (
            <View key={`v${i}`} style={[styles.gridLineV, { left: `${(i + 1) * 17}%` }]} />
          ))}
        </View>
        <View style={styles.pinBlock}>
          <Ionicons name="location-outline" size={40} color={accent} />
          <View style={styles.pinDot} />
        </View>

        <SafeAreaView edges={['top']} style={styles.headerSafe}>
          {router.canGoBack() ? (
            <Pressable onPress={leave} style={styles.backBtn} hitSlop={10}>
              <Ionicons name="arrow-back" size={22} color={Colors.foodText} />
            </Pressable>
          ) : null}
        </SafeAreaView>
      </View>

      {/* Sheet */}
      <View style={styles.sheet}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.sheetContent}
        >
          <Text style={styles.title}>Where should we{'\n'}deliver to?</Text>
          <Text style={styles.subtitle}>
            We use your location to show restaurants that deliver to you
          </Text>

          <Pressable
            style={styles.searchField}
            onPress={() => router.push('/location/search')}
          >
            <Ionicons name="search" size={18} color={Colors.foodTextMuted} />
            <Text style={styles.searchPlaceholder}>Enter your flat, area, or landmark</Text>
          </Pressable>

          <ActionButton
            label="Use current location"
            icon="navigate"
            onPress={useCurrentLocation}
            loading={locating}
            style={styles.cta}
          />
          <ActionButton
            label="Enter address manually"
            variant="outline"
            onPress={() => router.push('/location/search')}
            style={styles.ctaOutline}
          />

          {permHint ? (
            <Text style={styles.permHint}>
              Location permission is off. Enable it in Settings, or enter your address
              manually above.
            </Text>
          ) : null}

          {savedAddresses.length > 0 ? (
            <View style={styles.savedBlock}>
              <Text style={styles.savedHeading}>SAVED ADDRESSES</Text>
              {savedAddresses.slice(0, 3).map((a) => (
                <AddressRow
                  key={a._id}
                  icon={LABEL_ICON[a.label] ?? 'location'}
                  primary={a.customLabel || a.label[0].toUpperCase() + a.label.slice(1)}
                  secondary={[a.street, a.city, a.pincode].filter(Boolean).join(', ')}
                  onPress={() => pickSaved(a)}
                  chevron
                />
              ))}
            </View>
          ) : null}
        </ScrollView>
      </View>
    </View>
  );
}

const makeStyles = (t: AccentTheme) =>
  StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.locMapWash },
  mapArea: { width: '100%', overflow: 'hidden' },
  grid: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  gridLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: Colors.locMapWashLine,
  },
  gridLineV: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: Colors.locMapWashLine,
  },
  pinBlock: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pinDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: t.accent,
    marginTop: -4,
    opacity: 0.5,
  },
  headerSafe: { position: 'absolute', top: 0, left: 0, right: 0, paddingHorizontal: Spacing.base },
  backBtn: {
    marginTop: Spacing.sm,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 3,
  },
  sheet: {
    flex: 1,
    marginTop: -24,
    backgroundColor: Colors.foodSurface,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
  },
  sheetContent: {
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.xl,
    paddingBottom: Spacing['3xl'],
  },
  title: {
    fontSize: 27,
    lineHeight: 34,
    fontWeight: '800',
    color: Colors.foodText,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 14.5,
    lineHeight: 21,
    color: Colors.foodTextSecondary,
    marginTop: Spacing.sm,
    marginBottom: Spacing.xl,
  },
  searchField: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    height: 52,
    borderRadius: BorderRadius.lg,
    borderWidth: 1.5,
    borderColor: Colors.foodBorder,
    paddingHorizontal: Spacing.base,
    marginBottom: Spacing.lg,
  },
  searchPlaceholder: { fontSize: 14, color: Colors.foodTextMuted },
  cta: { marginBottom: Spacing.md },
  ctaOutline: {},
  permHint: {
    marginTop: Spacing.md,
    fontSize: 12.5,
    lineHeight: 18,
    color: Colors.foodTextSecondary,
  },
  savedBlock: { marginTop: Spacing.xl },
  savedHeading: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
    color: Colors.foodTextMuted,
    marginBottom: Spacing.xs,
  },
  });

const styles = makeStyles(ORANGE_ACCENT);
