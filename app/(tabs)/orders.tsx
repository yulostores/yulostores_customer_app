/**
 * app/(tabs)/orders.tsx — the customer's "Order history".
 *
 * Data, paging and auth handling all come from useOrders() (src/hooks/useOrders.ts):
 * GET /api/orders, 20 per page, newest first, with a mounted / stale-response
 * guard and a 401 → "sign in" branch. Nothing on this screen is hard-coded — the
 * card's storefront name, item summary, total, timestamp and the "veg-only fleet"
 * tag are all fields of the order document.
 *
 * Active orders (placed/confirmed/preparing/ready/out_for_delivery) show a status
 * pill and open the live tracking screen. A finished delivery order shows
 * "Reorder", which re-adds its items to the cart via POST /api/orders/:id/reorder
 * (src/services/orders.ts) and drops the customer on the cart tab.
 */

import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RemoteImage } from '../../src/components/RemoteImage';
import { Colors } from '../../src/constants/Colors';
import { BorderRadius, Shadows, Spacing } from '../../src/constants/Theme';
import { useAuth } from '../../src/context/AuthContext';
import { useCart } from '../../src/context/CartContext';
import {
  ORANGE_ACCENT,
  useAccentTheme,
  useThemedStyles,
  type AccentTheme,
} from '../../src/hooks/useAccentTheme';
import { useTabBarInset } from '../../src/components/TabBar';
import { useCanGoBack } from '../../src/hooks/useCanGoBack';
import { useOrders } from '../../src/hooks/useOrders';
import { logger, reportError } from '../../src/lib/logger';
import { ApiError } from '../../src/services/api';
import { toCartCachePayload } from '../../src/services/cart';
import {
  reorder,
  removedReasonLabel,
  statusMeta,
  type OrderSummary,
} from '../../src/services/orders';

// ─── Status display ──────────────────────────────────────────────────────────

const ACTIVE_STATUSES = new Set([
  'placed',
  'confirmed',
  'preparing',
  'ready',
  'out_for_delivery',
]);

const TONE_COLOR: Record<string, string> = {
  accent: Colors.foodAccent,
  positive: Colors.success,
  muted: Colors.foodTextMuted,
  danger: Colors.danger,
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function goBack() {
  // Reached from the Profile menu and from the checkout-success screen (which
  // `replace`s, leaving nothing to pop) — fall back to Home in that case.
  if (router.canGoBack()) router.back();
  else router.navigate('/(tabs)');
}

function formatTotal(total: number): string {
  return '₹' + Math.round(total).toLocaleString('en-IN');
}

/** "Today, 8:12 PM" · "Yesterday, 1:30 PM" · "12 Jul, 9:05 PM" · "12 Jul 2024, 9:05 PM". */
function formatOrderWhen(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';

  const time = d.toLocaleTimeString('en-IN', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
  const now = new Date();
  const midnight = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const daysAgo = Math.round((midnight(now) - midnight(d)) / 86_400_000);

  if (daysAgo <= 0) return `Today, ${time}`;
  if (daysAgo === 1) return `Yesterday, ${time}`;

  const date = d.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    ...(d.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' }),
  });
  return `${date}, ${time}`;
}

// ─── Order card ──────────────────────────────────────────────────────────────

function OrderCard({
  order,
  onReorder,
  reordering,
}: {
  order: OrderSummary;
  onReorder: () => void;
  reordering: boolean;
}) {
  const styles = useThemedStyles(makeStyles);
  const { accent } = useAccentTheme();
  const isActive = ACTIVE_STATUSES.has(order.status);
  const meta = statusMeta(order.status);
  const toneColor = TONE_COLOR[meta.tone] ?? Colors.foodTextMuted;

  // Storefront name is the card's identity; fall back to the item summary only
  // when the restaurant record is gone.
  const heading = order.restaurantName ?? order.title;
  const showItemLine = !!order.restaurantName && !!order.title;

  const openTracking = useCallback(() => {
    // The tracking screen renders the delivered / cancelled terminal states too.
    router.push(`/order/${order.id}/track`);
  }, [order.id]);

  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      onPress={openTracking}
      accessibilityRole="button"
      accessibilityLabel={`${heading} — ${meta.label}`}
    >
      <RemoteImage
        uri={order.restaurantLogo ?? undefined}
        style={styles.logo}
        icon="storefront-outline"
        iconSize={20}
      />

      <View style={styles.body}>
        <View style={styles.headingRow}>
          <Text style={styles.name} numberOfLines={1}>{heading}</Text>
          <Text style={styles.total}>{formatTotal(order.total)}</Text>
        </View>

        {showItemLine ? (
          <Text style={styles.items} numberOfLines={1}>
            {order.title}
            {order.itemCount > 1 ? ` · ${order.itemCount} items` : ''}
          </Text>
        ) : null}

        <Text style={styles.when}>{formatOrderWhen(order.createdAt)}</Text>

        {order.deliveredViaVegFleet ? (
          <View style={styles.vegTag}>
            <Ionicons name="leaf" size={13} color={Colors.foodVegGreen} />
            <Text style={styles.vegTagText}>Delivered via veg-only fleet</Text>
          </View>
        ) : isActive ? (
          <View style={[styles.statusPill, { backgroundColor: toneColor + '1A' }]}>
            <Ionicons name={meta.icon as any} size={12} color={toneColor} />
            <Text style={[styles.statusText, { color: toneColor }]}>{meta.label}</Text>
          </View>
        ) : order.status === 'cancelled' ? (
          <Text style={styles.cancelled}>
            {order.cancelledLabel ?? 'Cancelled'}
            {order.refundPending ? <Text style={styles.refundNote}> · Refund in progress</Text> : null}
          </Text>
        ) : null}

        <View style={styles.actionRow}>
          {isActive ? (
            <View style={styles.trackBtn}>
              <Text style={styles.trackBtnText}>Track order</Text>
              <Ionicons name="chevron-forward" size={13} color={accent} />
            </View>
          ) : order.canReorder ? (
            <Pressable
              style={({ pressed }) => [styles.reorderBtn, pressed && styles.reorderBtnPressed]}
              onPress={onReorder}
              disabled={reordering}
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel={`Reorder from ${heading}`}
            >
              {reordering ? (
                <ActivityIndicator size="small" color={accent} />
              ) : (
                <>
                  <Ionicons name="repeat" size={15} color={accent} />
                  <Text style={styles.reorderBtnText}>Reorder</Text>
                </>
              )}
            </Pressable>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

// ─── Empty state ─────────────────────────────────────────────────────────────

function EmptyState() {
  const styles = useThemedStyles(makeStyles);
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

// ─── Centered notice (not signed in / load error) ────────────────────────────

function CenteredNotice({
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
      <Text style={styles.errorText}>{message}</Text>
      {actionLabel && onAction && (
        <Pressable style={styles.retryBtn} onPress={onAction}>
          <Text style={styles.retryText}>{actionLabel}</Text>
        </Pressable>
      )}
    </View>
  );
}

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function OrdersScreen() {
  const styles = useThemedStyles(makeStyles);
  const { accent } = useAccentTheme();
  const { signOut } = useAuth();
  const { syncFromServer } = useCart();
  // Order history is a root tab as well as a push target (Profile → "Order
  // history"), so the back arrow only shows when something is stacked below.
  const canGoBack = useCanGoBack();
  const tabBarInset = useTabBarInset();
  const {
    orders,
    total,
    isLoading,
    isRefreshing,
    isPaging,
    error,
    notSignedIn,
    refresh,
    loadMore,
  } = useOrders();

  const [reorderingId, setReorderingId] = useState<string | null>(null);

  // Refresh whenever this tab regains focus (e.g. returning from the live tracking
  // screen after a restaurant/delivery-partner status change) so status pills don't
  // go stale until a manual pull-to-refresh. Skips the very first focus — the mount
  // effect inside useOrders() already covers the initial load.
  const hasFocusedOnceRef = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (hasFocusedOnceRef.current) refresh();
      hasFocusedOnceRef.current = true;
    }, [refresh]),
  );

  const handleReorder = useCallback(
    async (order: OrderSummary) => {
      if (reorderingId) return;
      setReorderingId(order.id);
      try {
        const { snapshot, removedItems } = await reorder(order.id);
        syncFromServer(toCartCachePayload(snapshot));

        if (removedItems.length === 0) {
          router.push('/(tabs)/cart');
          return;
        }

        const named = removedItems.filter((r) => r.name);
        const detail =
          named.length > 0
            ? named.map((r) => `${r.name} (${removedReasonLabel(r.reason)})`).join('\n')
            : `${removedItems.length} item${removedItems.length !== 1 ? 's' : ''} could not be added.`;
        const anyAdded = snapshot.cart.lines.length > 0;

        Alert.alert(
          anyAdded ? 'Some items weren’t added' : 'Couldn’t reorder',
          anyAdded
            ? `${detail}\n\nEverything still available is in your cart.`
            : `${detail}\n\nNothing from this order is available right now.`,
          anyAdded
            ? [
                { text: 'Not now', style: 'cancel' },
                { text: 'View cart', onPress: () => router.push('/(tabs)/cart') },
              ]
            : [{ text: 'OK' }],
        );
      } catch (err) {
        if (err instanceof ApiError && err.code === 'CART_RESTAURANT_CONFLICT') {
          const current = (err.details as { currentRestaurantName?: string } | null)
            ?.currentRestaurantName;
          Alert.alert(
            'You already have a cart',
            `Your cart has items from ${current ?? 'another restaurant'}. Clear it first, then reorder.`,
          );
        } else if (err instanceof ApiError && err.status === 401) {
          Alert.alert('Sign in required', 'Please sign in again to reorder.');
        } else if (err instanceof ApiError && err.status >= 400 && err.status < 500) {
          logger.warn('orders', `Reorder rejected — ${err.status} ${err.code}`, {
            orderId: order.id,
            code: err.code,
          });
          Alert.alert('Couldn’t reorder', err.message || 'Please try again.');
        } else {
          reportError('orders', 'Reorder failed', err, { orderId: order.id });
          Alert.alert('Something went wrong', 'Please try again in a moment.');
        }
      } finally {
        setReorderingId(null);
      }
    },
    [reorderingId, syncFromServer],
  );

  const header = (
    <View style={styles.header}>
      {canGoBack ? (
        <Pressable onPress={goBack} hitSlop={10} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={Colors.foodText} />
        </Pressable>
      ) : (
        // Keeps the title optically centred between the two 36dp side slots.
        <View style={styles.backBtn} />
      )}
      <Text style={styles.headerTitle}>Order history</Text>
      <View style={styles.backBtn} />
    </View>
  );

  // ── First load ──
  if (isLoading) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <StatusBar style="dark" />
        {header}
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={accent} />
        </View>
      </SafeAreaView>
    );
  }

  // ── Bypass / expired session ──
  if (notSignedIn) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <StatusBar style="dark" />
        {header}
        <CenteredNotice
          icon="lock-closed-outline"
          title="Sign in to see your orders"
          message="Your order history is tied to your account. Sign in again to pick up where you left off."
          actionLabel="Sign in"
          onAction={signOut}
        />
      </SafeAreaView>
    );
  }

  // ── Load error, nothing on screen ──
  if (error && orders.length === 0) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <StatusBar style="dark" />
        {header}
        <CenteredNotice
          icon="alert-circle-outline"
          title="Couldn’t load your orders"
          message={error}
          actionLabel="Retry"
          onAction={refresh}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <StatusBar style="dark" />
      {header}

      <FlatList
        data={orders}
        keyExtractor={(o) => o.id}
        // The tab bar floats over the page — the last card has to clear it.
        contentContainerStyle={[styles.list, { paddingBottom: tabBarInset }]}
        renderItem={({ item }) => (
          <OrderCard
            order={item}
            reordering={reorderingId === item.id}
            onReorder={() => handleReorder(item)}
          />
        )}
        ListHeaderComponent={
          orders.length > 0 ? (
            <Text style={styles.count}>
              {total} order{total !== 1 ? 's' : ''}
            </Text>
          ) : null
        }
        ListEmptyComponent={<EmptyState />}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={refresh}
            tintColor={accent}
            colors={[accent]}
          />
        }
        onEndReached={loadMore}
        onEndReachedThreshold={0.4}
        ListFooterComponent={
          isPaging ? (
            <ActivityIndicator style={{ marginVertical: 16 }} color={accent} />
          ) : null
        }
      />
    </SafeAreaView>
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

  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.md },
  noticeTitle: { fontSize: 18, fontWeight: '800', color: Colors.foodText, marginTop: 4 },
  errorText: {
    fontSize: 14,
    color: Colors.foodText,
    textAlign: 'center',
    paddingHorizontal: Spacing.xl,
  },
  retryBtn: {
    backgroundColor: t.accent,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.full,
  },
  retryText: { fontSize: 14, fontWeight: '700', color: Colors.white },

  list: {
    paddingHorizontal: Spacing.base,
    gap: Spacing.md,
    paddingTop: Spacing.md,
  },
  count: { fontSize: 13, color: Colors.foodTextMuted, marginBottom: Spacing.xs },

  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.md,
    backgroundColor: Colors.foodSurface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.base,
    borderWidth: 1,
    borderColor: Colors.foodBorder,
    ...Shadows.sm,
  },
  cardPressed: { opacity: 0.9, backgroundColor: Colors.foodBgSecondary },

  logo: { width: 44, height: 44, borderRadius: BorderRadius.md },

  body: { flex: 1, gap: 3 },
  headingRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  name: { flex: 1, fontSize: 15, fontWeight: '800', color: Colors.foodText, letterSpacing: -0.2 },
  total: { fontSize: 15, fontWeight: '800', color: Colors.foodText },
  items: { fontSize: 12.5, color: Colors.foodTextSecondary },
  when: { fontSize: 12.5, color: Colors.foodTextMuted, marginTop: 1 },

  vegTag: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: Spacing.xs },
  vegTagText: { fontSize: 12.5, fontWeight: '600', color: Colors.foodVegGreen },

  statusPill: {
    flexDirection: 'row',
    alignSelf: 'flex-start',
    alignItems: 'center',
    gap: 5,
    marginTop: Spacing.xs,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: BorderRadius.full,
  },
  statusText: { fontSize: 12, fontWeight: '700' },
  cancelled: { fontSize: 12.5, fontWeight: '600', color: Colors.danger, marginTop: Spacing.xs },
  refundNote: { fontWeight: '600', color: Colors.foodTextSecondary },

  actionRow: { flexDirection: 'row', alignItems: 'center', marginTop: Spacing.sm },
  trackBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: BorderRadius.full,
    backgroundColor: t.accentLight,
  },
  trackBtnText: { fontSize: 13, fontWeight: '800', color: t.accent },
  reorderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minWidth: 108,
    minHeight: 36,
    paddingHorizontal: 16,
    borderRadius: BorderRadius.full,
    borderWidth: 1.5,
    borderColor: t.accent,
  },
  reorderBtnPressed: { backgroundColor: t.accentLight },
  reorderBtnText: { fontSize: 13, fontWeight: '800', color: t.accent },

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
    backgroundColor: t.accent,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.full,
    marginTop: Spacing.sm,
  },
  browseBtnText: { fontSize: 14, fontWeight: '700', color: Colors.white },
  });

const styles = makeStyles(ORANGE_ACCENT);
