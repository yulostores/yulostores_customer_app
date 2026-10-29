/**
 * app/restaurants/nearby.tsx — every restaurant near the delivery location.
 *
 * Home's "Restaurants near you" shows only the first few the feed returns (NEARBY_LIMIT on the
 * backend); its "See all" used to open an empty search screen. This is the whole list: pages of
 * GET /api/restaurants?lat&lng (src/services/restaurants.ts), nearest first, the same card Home
 * draws (src/components/RestaurantNearbyCard.tsx). Pure-veg mode narrows it the way search does.
 */

import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import RestaurantNearbyCard from '../../src/components/RestaurantNearbyCard';
import { Colors } from '../../src/constants/Colors';
import { BorderRadius, Spacing } from '../../src/constants/Theme';
import { useDeliveryLocation } from '../../src/context/DeliveryLocationContext';
import { useVegMode } from '../../src/context/VegModeContext';
import {
  useAccentTheme,
  useThemedStyles,
  type AccentTheme,
} from '../../src/hooks/useAccentTheme';
import { logger, reportError } from '../../src/lib/logger';
import { ApiError } from '../../src/services/api';
import { fetchRestaurants } from '../../src/services/restaurants';
import type { Restaurant } from '../../src/types/restaurant';

function goBack() {
  if (router.canGoBack()) router.back();
  else router.navigate('/(tabs)');
}

export default function NearbyRestaurantsScreen() {
  const styles = useThemedStyles(makeStyles);
  const { accent } = useAccentTheme();
  const { activeLocation } = useDeliveryLocation();
  const { enabled: vegEnabled, scope: vegScope } = useVegMode();
  const vegOnly = vegEnabled && vegScope === 'pure_veg_only';

  const located = activeLocation != null && !activeLocation.unlocated;
  const lat = located ? activeLocation.coordinates.latitude : undefined;
  const lng = located ? activeLocation.coordinates.longitude : undefined;

  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isPaging, setIsPaging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A newer request (location / veg change, refresh) makes an older one's answer stale.
  const requestRef = useRef(0);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const fetchPage = useCallback(
    async (target: number, mode: 'load' | 'refresh' | 'more') => {
      if (lat === undefined || lng === undefined) {
        setIsLoading(false);
        return;
      }
      const requestId = ++requestRef.current;
      const isCurrent = () => mountedRef.current && requestRef.current === requestId;

      if (mode === 'load') setIsLoading(true);
      else if (mode === 'refresh') setIsRefreshing(true);
      else setIsPaging(true);
      if (mode !== 'more') setError(null);

      try {
        const res = await fetchRestaurants({ lat, lng, page: target, vegOnly });
        if (!isCurrent()) return;
        setRestaurants((prev) => {
          if (mode !== 'more') return res.restaurants;
          const seen = new Set(prev.map((r) => r._id));
          return [...prev, ...res.restaurants.filter((r) => !seen.has(r._id))];
        });
        setPage(res.pagination.page);
        setHasMore(res.pagination.page < res.pagination.pages);
      } catch (err) {
        if (err instanceof ApiError && err.status >= 400 && err.status < 500) {
          logger.warn('nearby', `Nearby restaurants unavailable — ${err.status} ${err.code}`);
        } else {
          reportError('nearby', 'Failed to load nearby restaurants', err, { page: target });
        }
        if (isCurrent() && mode !== 'more') {
          setError(err instanceof Error && err.message ? err.message : 'Could not load restaurants.');
        }
      } finally {
        if (isCurrent()) {
          setIsLoading(false);
          setIsRefreshing(false);
          setIsPaging(false);
        }
      }
    },
    [lat, lng, vegOnly],
  );

  useEffect(() => {
    fetchPage(1, 'load');
  }, [fetchPage]);

  const loadMore = useCallback(() => {
    if (isLoading || isRefreshing || isPaging || !hasMore) return;
    fetchPage(page + 1, 'more');
  }, [isLoading, isRefreshing, isPaging, hasMore, page, fetchPage]);

  const header = (
    <View style={styles.header}>
      <Pressable onPress={goBack} hitSlop={10} style={styles.backBtn} accessibilityLabel="Go back">
        <Ionicons name="arrow-back" size={22} color={Colors.foodText} />
      </Pressable>
      <Text style={styles.headerTitle}>Restaurants near you</Text>
      <View style={styles.backBtn} />
    </View>
  );

  let body: ReactNode;
  if (!located) {
    body = (
      <Notice
        icon="location-outline"
        title="Where should we deliver?"
        message="Set your delivery location to see the restaurants around you."
        actionLabel="Set location"
        onAction={() => router.push('/location')}
      />
    );
  } else if (isLoading) {
    body = (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={accent} />
      </View>
    );
  } else if (error && restaurants.length === 0) {
    body = (
      <Notice
        icon="cloud-offline-outline"
        title="Couldn’t load restaurants"
        message={error}
        actionLabel="Try again"
        onAction={() => fetchPage(1, 'load')}
      />
    );
  } else {
    body = (
      <FlatList
        data={restaurants}
        keyExtractor={(r) => r._id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => <RestaurantNearbyCard restaurant={item} />}
        ListEmptyComponent={
          <Notice
            icon="storefront-outline"
            title="Nothing nearby yet"
            message={
              vegOnly
                ? 'No pure-veg restaurants deliver here yet. Turn off pure-veg mode to see all.'
                : 'No restaurants deliver to this address yet. Try a different location.'
            }
          />
        }
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => fetchPage(1, 'refresh')}
            tintColor={accent}
            colors={[accent]}
          />
        }
        onEndReached={loadMore}
        onEndReachedThreshold={0.4}
        ListFooterComponent={
          isPaging ? <ActivityIndicator style={styles.footerSpinner} color={accent} /> : undefined
        }
      />
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <StatusBar style="dark" />
      {header}
      {body}
    </SafeAreaView>
  );
}

function Notice({
  icon,
  title,
  message,
  actionLabel,
  onAction,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.centered}>
      <Ionicons name={icon} size={48} color={Colors.foodBorder} />
      <Text style={styles.noticeTitle}>{title}</Text>
      <Text style={styles.noticeText}>{message}</Text>
      {actionLabel && onAction ? (
        <Pressable style={styles.actionBtn} onPress={onAction}>
          <Text style={styles.actionBtnText}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const makeStyles = (t: AccentTheme) =>
  StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: Colors.foodBg },

    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: Spacing.base,
      paddingVertical: Spacing.sm + 2,
      borderBottomWidth: 1,
      borderBottomColor: Colors.foodBorder,
      backgroundColor: Colors.foodSurface,
    },
    backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
    headerTitle: { fontSize: 18, fontWeight: '800', color: Colors.foodText, letterSpacing: -0.3 },

    list: { paddingHorizontal: Spacing.base, paddingTop: Spacing.md, paddingBottom: 24 },
    footerSpinner: { marginVertical: 16 },

    centered: {
      flexGrow: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: Spacing.md,
      padding: Spacing.xl,
      paddingTop: 72,
    },
    noticeTitle: { fontSize: 18, fontWeight: '800', color: Colors.foodText, marginTop: 4 },
    noticeText: { fontSize: 14, color: Colors.foodTextSecondary, textAlign: 'center' },
    actionBtn: {
      backgroundColor: t.accent,
      paddingHorizontal: Spacing.xl,
      paddingVertical: Spacing.md,
      borderRadius: BorderRadius.full,
      marginTop: Spacing.sm,
    },
    actionBtnText: { fontSize: 14, fontWeight: '700', color: Colors.white },
  });
