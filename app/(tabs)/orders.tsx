/**
 * app/(tabs)/orders.tsx — Customer orders list.
 *
 * Wired to GET /api/orders (src/services/orders.ts) — replaces the old
 * hardcoded static list with real data from the backend.
 *
 * Active orders (placed/confirmed/preparing/out_for_delivery) link to the
 * live tracking screen. Delivered/cancelled orders show the same screen in
 * a read-only final state.
 */

import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
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
import { Colors } from '../../src/constants/Colors';
import { BorderRadius, Shadows, Spacing } from '../../src/constants/Theme';
import { listOrders, describeStatus, type OrderSummary } from '../../src/services/orders';
import { logger } from '../../src/lib/logger';

// ─── Status display map ──────────────────────────────────────────────────────

const STATUS_ICON: Record<string, { name: string; color: string }> = {
  placed: { name: 'time-outline', color: Colors.warning },
  confirmed: { name: 'checkmark-circle-outline', color: Colors.info },
  preparing: { name: 'flame-outline', color: Colors.warning },
  ready: { name: 'bag-check-outline', color: Colors.info },
  out_for_delivery: { name: 'bicycle', color: Colors.foodAccent },
  delivered: { name: 'checkmark-circle', color: Colors.success },
  cancelled: { name: 'close-circle', color: Colors.danger },
};

const ACTIVE_STATUSES = new Set(['placed', 'confirmed', 'preparing', 'ready', 'out_for_delivery']);

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatTotal(total: number): string {
  return '₹' + Math.round(total).toLocaleString('en-IN');
}

// ─── Order card ──────────────────────────────────────────────────────────────

function OrderCard({ order }: { order: OrderSummary }) {
  const statusMeta = STATUS_ICON[order.status] ?? { name: 'ellipse-outline', color: Colors.foodTextMuted };
  const { label } = describeStatus(order.status);
  const isActive = ACTIVE_STATUSES.has(order.status);

  const handlePress = useCallback(() => {
    // Both active and completed orders open the tracking screen —
    // it gracefully handles the delivered/cancelled terminal states.
    router.push(`/order/${order.id}/track`);
  }, [order.id]);

  // Show the first 2 items as a summary line
  const itemSummary = order.items
    .slice(0, 2)
    .map((i) => `${i.quantity}x ${i.name}`)
    .join(', ')
    + (order.items.length > 2 ? ` +${order.items.length - 2} more` : '');

  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={`Order ${order.id} — ${label}`}
    >
      {/* Top row: order ref + status badge */}
      <View style={styles.cardTop}>
        <Text style={styles.orderId}># YU-{order.id.slice(-8).toUpperCase()}</Text>
        <View style={[styles.statusBadge, { backgroundColor: statusMeta.color + '1A' }]}>
          <Ionicons name={statusMeta.name as any} size={13} color={statusMeta.color} />
          <Text style={[styles.statusText, { color: statusMeta.color }]}>{label}</Text>
        </View>
      </View>

      {/* Item summary */}
      <Text style={styles.itemSummary} numberOfLines={1}>{itemSummary}</Text>

      <View style={styles.divider} />

      {/* Bottom row: date + item count + total + chevron */}
      <View style={styles.cardBottom}>
        <View style={styles.metaItem}>
          <Ionicons name="calendar-outline" size={12} color={Colors.foodTextMuted} />
          <Text style={styles.metaText}>{formatDate(order.createdAt)}</Text>
        </View>
        <View style={styles.metaItem}>
          <Ionicons name="bag-outline" size={12} color={Colors.foodTextMuted} />
          <Text style={styles.metaText}>{order.itemCount} item{order.itemCount !== 1 ? 's' : ''}</Text>
        </View>
        <Text style={styles.total}>{formatTotal(order.total)}</Text>
        {isActive && (
          <View style={styles.trackChip}>
            <Text style={styles.trackChipText}>Track</Text>
            <Ionicons name="chevron-forward" size={12} color={Colors.foodAccent} />
          </View>
        )}
      </View>
    </Pressable>
  );
}

// ─── Empty state ─────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <View style={styles.emptyState}>
      <Ionicons name="bag-outline" size={64} color={Colors.foodBorder} />
      <Text style={styles.emptyTitle}>No orders yet</Text>
      <Text style={styles.emptySubtitle}>Your placed orders will appear here</Text>
      <Pressable style={styles.browseBtn} onPress={() => router.navigate('/(tabs)')}>
        <Text style={styles.browseBtnText}>Browse restaurants</Text>
      </Pressable>
    </View>
  );
}

// ─── Screen ──────────────────────────────────────────────────────────────────

const PAGE_SIZE = 20;

export default function OrdersScreen() {
  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPage = useCallback(async (p: number, append = false) => {
    try {
      const result = await listOrders(p);
      setOrders((prev) => (append ? [...prev, ...result.orders] : result.orders));
      setTotal(result.total);
      setPage(p);
      setError(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load orders';
      logger.warn('OrdersScreen', 'fetchPage failed', { page: p, msg });
      setError(msg);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    fetchPage(1).finally(() => setLoading(false));
  }, [fetchPage]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchPage(1);
    setRefreshing(false);
  }, [fetchPage]);

  const handleLoadMore = useCallback(async () => {
    if (loadingMore || orders.length >= total) return;
    setLoadingMore(true);
    await fetchPage(page + 1, true);
    setLoadingMore(false);
  }, [loadingMore, orders.length, total, fetchPage, page]);

  // ── Loading ──
  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={styles.header}>
          <Text style={styles.title}>My Orders</Text>
        </View>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={Colors.foodAccent} />
        </View>
      </SafeAreaView>
    );
  }

  // ── Error ──
  if (error && orders.length === 0) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={styles.header}>
          <Text style={styles.title}>My Orders</Text>
        </View>
        <View style={styles.centered}>
          <Ionicons name="alert-circle-outline" size={48} color={Colors.danger} />
          <Text style={styles.errorText}>{error}</Text>
          <Pressable style={styles.retryBtn} onPress={handleRefresh}>
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.title}>My Orders</Text>
        <Text style={styles.subtitle}>{total} order{total !== 1 ? 's' : ''} placed</Text>
      </View>

      <FlatList
        data={orders}
        keyExtractor={(o) => o.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => <OrderCard order={item} />}
        ListEmptyComponent={<EmptyState />}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={Colors.foodAccent}
            colors={[Colors.foodAccent]}
          />
        }
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.4}
        ListFooterComponent={
          loadingMore ? (
            <ActivityIndicator style={{ marginVertical: 16 }} color={Colors.foodAccent} />
          ) : null
        }
      />
    </SafeAreaView>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.foodBg },

  header: {
    paddingHorizontal: Spacing.base,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.base,
    borderBottomWidth: 1,
    borderBottomColor: Colors.foodBorder,
  },
  title: { fontSize: 26, fontWeight: '800', color: Colors.foodText },
  subtitle: { fontSize: 13, color: Colors.foodTextMuted, marginTop: 2 },

  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.md },
  errorText: { fontSize: 14, color: Colors.foodText, textAlign: 'center', paddingHorizontal: Spacing.xl },
  retryBtn: {
    backgroundColor: Colors.foodAccent,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.full,
  },
  retryText: { fontSize: 14, fontWeight: '700', color: Colors.white },

  list: { paddingHorizontal: Spacing.base, gap: Spacing.md, paddingTop: Spacing.md, paddingBottom: 24 },

  card: {
    backgroundColor: Colors.foodSurface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.base,
    borderWidth: 1,
    borderColor: Colors.foodBorder,
    ...Shadows.sm,
  },
  cardPressed: { opacity: 0.88, backgroundColor: Colors.foodBgSecondary },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  orderId: { fontSize: 13, fontWeight: '700', color: Colors.foodText },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
  },
  statusText: { fontSize: 12, fontWeight: '700' },
  itemSummary: {
    fontSize: 13,
    color: Colors.foodTextSecondary,
    marginTop: Spacing.xs,
    marginBottom: Spacing.sm,
  },
  divider: { height: 1, backgroundColor: Colors.foodBorder, marginVertical: Spacing.sm },
  cardBottom: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { fontSize: 12, color: Colors.foodTextMuted },
  total: { marginLeft: 'auto', fontSize: 15, fontWeight: '800', color: Colors.foodText },
  trackChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    marginLeft: Spacing.sm,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.foodAccentLight,
  },
  trackChipText: { fontSize: 12, fontWeight: '700', color: Colors.foodAccent },

  // Empty state
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
    paddingHorizontal: Spacing.xl,
    gap: Spacing.md,
  },
  emptyTitle: { fontSize: 20, fontWeight: '800', color: Colors.foodText },
  emptySubtitle: { fontSize: 14, color: Colors.foodTextSecondary, textAlign: 'center' },
  browseBtn: {
    backgroundColor: Colors.foodAccent,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.full,
    marginTop: Spacing.sm,
  },
  browseBtnText: { fontSize: 14, fontWeight: '700', color: Colors.white },
});
