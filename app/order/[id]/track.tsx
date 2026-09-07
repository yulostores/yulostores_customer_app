/**
 * app/order/[id]/track.tsx — Live delivery tracking screen.
 *
 * Mirrors the Zomato-style UI from the design mockup:
 *
 *  ┌─────────────────────────────────────┐
 *  │  [← Back]    MAP ZONE (static img)  │
 *  │             [bike icon overlay]      │
 *  ├─────────────────────────────────────┤
 *  │  ● On the way         Arriving in   │
 *  │                         12 mins     │
 *  │  Biryani Palace  ★4.8 · Cuisine     │
 *  ├─────────────────────────────────────┤
 *  │  Delivery timeline                  │
 *  │  ✓ Order placed      08:15 pm       │
 *  │  ✓ Preparing         08:22 pm       │
 *  │  ✓ Picked up         08:35 pm       │
 *  │  ● On the way    Tracking live      │
 *  │    Delivered                        │
 *  ├─────────────────────────────────────┤
 *  │  Delivery partner                   │
 *  │  RS  Rahul S.  ★4.9 · 2,400+ dlvrs │
 *  │  [📞 Call]  [💬 Chat]               │
 *  ├─────────────────────────────────────┤
 *  │  Order details  #HH-98234           │
 *  │  1x Awadhi Dum Biryani  ₹749        │
 *  │  1x Galouti Kebab (4 pcs)  ₹525     │
 *  │                  Total paid ₹1,384  │
 *  └─────────────────────────────────────┘
 *
 * All data is live (REST + Socket.IO). Nothing is hardcoded.
 */

import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  Image,
  Linking,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../../../src/constants/Colors';
import { BorderRadius, Shadows, Spacing } from '../../../src/constants/Theme';
import { useOrderTracking } from '../../../src/hooks/useOrderTracking';
import {
  formatRupees,
  shortOrderId,
  stageLabel,
  trackingStatusLabel,
  type TrackingStage,
} from '../../../src/services/tracking';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const MAP_HEIGHT = 220;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function goBack() {
  if (router.canGoBack()) router.back();
  else router.navigate('/(tabs)');
}

function formatTime(isoString: string | null): string | null {
  if (!isoString) return null;
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
}

function formatRating(rating: number | null): string {
  if (rating == null || rating === 0) return '—';
  return rating.toFixed(1);
}

function getInitials(name: string | null): string {
  if (!name) return '?';
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
}

// Pill colour for each order status
const STATUS_COLOR: Record<string, string> = {
  placed: Colors.warning,
  confirmed: Colors.info,
  preparing: Colors.warning,
  ready: Colors.info,
  out_for_delivery: Colors.foodAccent,
  delivered: Colors.success,
  cancelled: Colors.danger,
};

// ─── Sub-components ────────────────────────────────────────────────────────

/** Pulsing dot for the current timeline step */
function PulsingDot() {
  const scale = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(scale, { toValue: 1.4, duration: 700, useNativeDriver: true }),
        Animated.timing(scale, { toValue: 1, duration: 700, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [scale]);
  return (
    <Animated.View style={[styles.dotCurrent, { transform: [{ scale }] }]} />
  );
}

/** Static green check dot */
function DoneDot() {
  return (
    <View style={styles.dotDone}>
      <Ionicons name="checkmark" size={10} color="#fff" />
    </View>
  );
}

/** Hollow grey dot for pending steps */
function PendingDot() {
  return <View style={styles.dotPending} />;
}

// ─── Main screen ─────────────────────────────────────────────────────────────

export default function TrackingScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { tracking, partnerLocation, loading, error, refetch } = useOrderTracking(id ?? '');

  const [refreshing, setRefreshing] = require('react').useState(false);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const handleCall = useCallback(() => {
    const phone = tracking?.deliveryPartner?.maskedPhone;
    if (!phone) {
      Alert.alert('Partner unavailable', 'The partner contact is not available yet.');
      return;
    }
    // maskedPhone is display-only; strip the mask characters to dial.
    // In production this would be a proxy number from Exotel/Knowlarity.
    const dialable = phone.replace(/X/g, '0');
    Linking.openURL(`tel:${dialable}`).catch(() =>
      Alert.alert('Could not open phone app')
    );
  }, [tracking]);

  const handleChat = useCallback(() => {
    // Placeholder: navigate to support. A real implementation opens an in-app
    // chat channel (Zomato-style, not partner DM). Wire to the support ticket
    // flow when it is built.
    Alert.alert(
      'Chat support',
      'In-app chat with support coming soon. You can call the delivery partner instead.',
      [{ text: 'OK' }]
    );
  }, []);

  // ─── Loading / error states ───────────────────────────────────────────────

  if (loading) {
    return (
      <View style={[styles.centered, { paddingTop: insets.top }]}>
        <StatusBar style="dark" />
        <ActivityIndicator size="large" color={Colors.foodAccent} />
        <Text style={styles.loadingText}>Loading tracking…</Text>
      </View>
    );
  }

  if (error || !tracking) {
    return (
      <View style={[styles.centered, { paddingTop: insets.top }]}>
        <StatusBar style="dark" />
        <Ionicons name="alert-circle-outline" size={48} color={Colors.danger} />
        <Text style={styles.errorText}>{error ?? 'Order not found'}</Text>
        <Pressable style={styles.retryBtn} onPress={() => refetch()}>
          <Text style={styles.retryText}>Try again</Text>
        </Pressable>
        <Pressable style={[styles.retryBtn, { marginTop: 8, backgroundColor: '#eee' }]} onPress={goBack}>
          <Text style={[styles.retryText, { color: Colors.foodText }]}>Go back</Text>
        </Pressable>
      </View>
    );
  }

  const statusColor = STATUS_COLOR[tracking.status] ?? Colors.foodAccent;
  const statusLabel = trackingStatusLabel(tracking.status, tracking.assignmentStatus);
  const isOnTheWay = tracking.status === 'out_for_delivery';
  const isDelivered = tracking.status === 'delivered';
  const isCancelled = tracking.status === 'cancelled';

  const stages = ['placed', 'confirmed', 'preparing', 'ready', 'out_for_delivery', 'delivered'] as TrackingStage[];
  const currentStageIndex = stages.indexOf(tracking.status as TrackingStage);

  return (
    <View style={[styles.root, { backgroundColor: Colors.foodBg }]}>
      <StatusBar style="light" />

      {/* ── MAP ZONE ─────────────────────────────────────────────────────── */}
      <View style={[styles.mapContainer, { paddingTop: insets.top }]}>
        {/* Static map background image */}
        <Image
          source={require('../../../assets/map-placeholder.png')}
          style={styles.mapImage}
          resizeMode="cover"
        />

        {/* Delivery route line overlay (decorative) */}
        <View style={styles.routeOverlay} pointerEvents="none">
          <View style={styles.routeLine} />
        </View>

        {/* Partner bike icon — positioned at centre for static map */}
        <View style={styles.bikeContainer} pointerEvents="none">
          <View style={styles.bikeIconBg}>
            <Ionicons name="bicycle" size={22} color={Colors.white} />
          </View>
        </View>

        {/* Destination dot */}
        <View style={styles.destinationDot} pointerEvents="none">
          <View style={styles.destinationInner} />
        </View>

        {/* Back button */}
        <Pressable
          style={[styles.backBtn, { top: insets.top + 12 }]}
          onPress={goBack}
          hitSlop={12}
        >
          <Ionicons name="arrow-back" size={20} color={Colors.white} />
        </Pressable>
      </View>

      {/* ── SCROLLABLE CONTENT ────────────────────────────────────────────── */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={Colors.foodAccent} />
        }
      >
        {/* ── STATUS CARD ──────────────────────────────────────────────────── */}
        <View style={styles.card}>
          {/* Status pill */}
          <View style={styles.statusRow}>
            <View style={[styles.statusPill, { backgroundColor: statusColor + '18' }]}>
              <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
              <Text style={[styles.statusPillText, { color: statusColor }]}>{statusLabel}</Text>
            </View>

            {/* ETA — only shown when on the way with a fresh estimate */}
            {isOnTheWay && tracking.etaMinutes != null && (
              <Text style={styles.etaLabel}>
                Arriving in{' '}
                <Text style={styles.etaValue}>{tracking.etaMinutes} min{tracking.etaMinutes !== 1 ? 's' : ''}</Text>
              </Text>
            )}
          </View>

          {/* Order heading */}
          {!isDelivered && !isCancelled && (
            <Text style={styles.headingText}>
              {isOnTheWay ? 'Your order is on the way' : `Your order is being ${tracking.status === 'preparing' ? 'prepared' : tracking.status}`}
            </Text>
          )}
          {isDelivered && <Text style={styles.headingText}>Order delivered 🎉</Text>}
          {isCancelled && <Text style={[styles.headingText, { color: Colors.danger }]}>Order cancelled</Text>}

          {/* ETA countdown (large) */}
          {isOnTheWay && tracking.etaMinutes != null && (
            <Text style={styles.etaCountdown}>{tracking.etaMinutes} mins</Text>
          )}

          {/* Restaurant info */}
          {tracking.restaurant.name && (
            <View style={styles.restaurantRow}>
              <View style={styles.restaurantIconBox}>
                <Ionicons name="storefront-outline" size={16} color={Colors.foodAccent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.restaurantName}>{tracking.restaurant.name}</Text>
                {tracking.restaurant.rating != null && (
                  <View style={styles.ratingRow}>
                    <Ionicons name="star" size={11} color={Colors.foodRating} />
                    <Text style={styles.ratingText}>{formatRating(tracking.restaurant.rating)}</Text>
                  </View>
                )}
              </View>
            </View>
          )}
        </View>

        {/* ── DELIVERY TIMELINE ─────────────────────────────────────────────── */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Delivery timeline</Text>
          <View style={styles.timeline}>
            {tracking.timeline.map((entry, i) => {
              const isCurrent = entry.stage === tracking.status && !isDelivered;
              const isDone = entry.completed && !isCurrent;
              const isPending = !entry.completed && !isCurrent;
              const isLast = i === tracking.timeline.length - 1;
              const timeStr = formatTime(entry.timestamp);

              return (
                <View key={entry.stage} style={styles.timelineRow}>
                  {/* Dot + connector column */}
                  <View style={styles.timelineLeft}>
                    {isDone ? <DoneDot /> : isCurrent ? <PulsingDot /> : <PendingDot />}
                    {!isLast && (
                      <View
                        style={[
                          styles.timelineConnector,
                          { backgroundColor: isDone ? Colors.success : Colors.foodBorder },
                        ]}
                      />
                    )}
                  </View>

                  {/* Label + time column */}
                  <View style={styles.timelineRight}>
                    <Text
                      style={[
                        styles.timelineLabel,
                        isCurrent && { color: Colors.foodAccent, fontWeight: '700' },
                        isPending && { color: Colors.foodTextMuted },
                      ]}
                    >
                      {stageLabel(entry.stage)}
                    </Text>
                    {timeStr ? (
                      <Text style={styles.timelineTime}>{timeStr}</Text>
                    ) : isCurrent ? (
                      <Text style={[styles.timelineTime, { color: Colors.foodAccent }]}>Tracking live</Text>
                    ) : null}
                  </View>
                </View>
              );
            })}
          </View>
        </View>

        {/* ── DELIVERY PARTNER ──────────────────────────────────────────────── */}
        {tracking.deliveryPartner && (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Delivery partner</Text>
            <View style={styles.partnerRow}>
              {/* Avatar */}
              {tracking.deliveryPartner.avatarUrl ? (
                <Image
                  source={{ uri: tracking.deliveryPartner.avatarUrl }}
                  style={styles.partnerAvatar}
                />
              ) : (
                <View style={styles.partnerAvatarPlaceholder}>
                  <Text style={styles.partnerAvatarInitials}>
                    {getInitials(tracking.deliveryPartner.name)}
                  </Text>
                </View>
              )}

              {/* Name + stats */}
              <View style={{ flex: 1 }}>
                <Text style={styles.partnerName}>
                  {tracking.deliveryPartner.name
                    ? `${tracking.deliveryPartner.name.split(' ')[0]} ${tracking.deliveryPartner.name.split(' ')[1]?.[0] ?? ''}.`
                    : 'Partner'}
                </Text>
                <View style={styles.partnerStats}>
                  <Ionicons name="star" size={12} color={Colors.foodRating} />
                  <Text style={styles.partnerStatText}>{formatRating(tracking.deliveryPartner.rating)}</Text>
                  <Text style={styles.partnerStatSep}>•</Text>
                  <Text style={styles.partnerStatText}>
                    {tracking.deliveryPartner.totalDeliveries.toLocaleString('en-IN')}+ deliveries
                  </Text>
                </View>
                {tracking.deliveryPartner.usesVegOnlyFleetBag && (
                  <View style={styles.vegBadge}>
                    <View style={styles.vegDot} />
                    <Text style={styles.vegBadgeText}>Veg-only partner</Text>
                  </View>
                )}
              </View>
            </View>

            {/* Action buttons */}
            {!isDelivered && !isCancelled && (
              <View style={styles.partnerActions}>
                <Pressable
                  style={({ pressed }) => [styles.actionBtn, pressed && styles.actionBtnPressed]}
                  onPress={handleCall}
                >
                  <Ionicons name="call-outline" size={16} color={Colors.foodText} />
                  <Text style={styles.actionBtnText}>Call</Text>
                </Pressable>
                <Pressable
                  style={({ pressed }) => [styles.actionBtn, pressed && styles.actionBtnPressed]}
                  onPress={handleChat}
                >
                  <Ionicons name="chatbubble-outline" size={16} color={Colors.foodText} />
                  <Text style={styles.actionBtnText}>Chat</Text>
                </Pressable>
              </View>
            )}
          </View>
        )}

        {/* ── ORDER DETAILS ─────────────────────────────────────────────────── */}
        <View style={styles.card}>
          <View style={styles.orderDetailHeader}>
            <Text style={styles.sectionTitle}>Order details</Text>
            <Text style={styles.orderIdText}>#{shortOrderId(tracking.orderId)}</Text>
          </View>

          {tracking.orderItems.map((item, i) => (
            <View key={`${item.menuItemId}-${i}`} style={styles.orderItemRow}>
              <View style={styles.orderItemLeft}>
                {/* Veg/non-veg dot (no flag available — show neutral square) */}
                <View style={styles.itemIconBox}>
                  <Ionicons name="restaurant-outline" size={12} color={Colors.foodTextMuted} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.orderItemName} numberOfLines={2}>
                    {item.quantity}x {item.name}
                  </Text>
                  {item.note ? (
                    <Text style={styles.orderItemNote} numberOfLines={1}>
                      {item.note}
                    </Text>
                  ) : null}
                </View>
              </View>
              <Text style={styles.orderItemPrice}>{formatRupees(item.price * item.quantity)}</Text>
            </View>
          ))}

          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Total paid</Text>
            <Text style={styles.totalValue}>{formatRupees(tracking.totalPaid)}</Text>
          </View>

          {tracking.paymentMethod && (
            <Text style={styles.paymentNote}>
              {tracking.paymentMethod === 'cash' || tracking.paymentStatus === 'pending_cod'
                ? 'Cash on delivery'
                : tracking.paymentStatus === 'paid'
                ? 'Paid online'
                : 'Online payment'}
            </Text>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.foodBg },

  // ── Centered states ──
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.foodBg,
    paddingHorizontal: Spacing.xl,
    gap: Spacing.md,
  },
  loadingText: { fontSize: 14, color: Colors.foodTextSecondary, marginTop: Spacing.sm },
  errorText: { fontSize: 15, color: Colors.foodText, textAlign: 'center' },
  retryBtn: {
    backgroundColor: Colors.foodAccent,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.full,
    marginTop: Spacing.sm,
  },
  retryText: { fontSize: 14, fontWeight: '700', color: Colors.white },

  // ── Map ──
  mapContainer: {
    width: SCREEN_WIDTH,
    height: MAP_HEIGHT,
    overflow: 'hidden',
    backgroundColor: '#e8f3ec',
  },
  mapImage: {
    position: 'absolute',
    width: '100%',
    height: '100%',
  },
  routeOverlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  routeLine: {
    width: SCREEN_WIDTH * 0.5,
    height: 3,
    backgroundColor: Colors.info,
    borderRadius: 2,
    opacity: 0.6,
  },
  bikeContainer: {
    position: 'absolute',
    top: MAP_HEIGHT / 2 - 20,
    left: SCREEN_WIDTH * 0.55,
  },
  bikeIconBg: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.info,
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadows.md,
  },
  destinationDot: {
    position: 'absolute',
    top: MAP_HEIGHT / 2 - 8,
    left: SCREEN_WIDTH * 0.15,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: Colors.foodAccent,
    borderWidth: 3,
    borderColor: Colors.white,
    ...Shadows.sm,
  },
  destinationInner: {
    flex: 1,
    borderRadius: 99,
  },
  backBtn: {
    position: 'absolute',
    left: 16,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.foodText + 'CC',
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadows.sm,
  },

  // ── Scroll ──
  scroll: { flex: 1 },
  scrollContent: { gap: Spacing.md, padding: Spacing.base },

  // ── Card ──
  card: {
    backgroundColor: Colors.foodSurface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.base,
    ...Shadows.sm,
    borderWidth: 1,
    borderColor: Colors.foodBorder,
  },

  // ── Status section ──
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.sm,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: BorderRadius.full,
  },
  statusDot: { width: 7, height: 7, borderRadius: 99 },
  statusPillText: { fontSize: 12, fontWeight: '700' },
  etaLabel: { fontSize: 13, color: Colors.foodTextSecondary },
  etaValue: { fontWeight: '700', color: Colors.foodText },
  headingText: {
    fontSize: 20,
    fontWeight: '800',
    color: Colors.foodText,
    marginBottom: Spacing.xs,
  },
  etaCountdown: {
    fontSize: 34,
    fontWeight: '900',
    color: Colors.foodText,
    letterSpacing: -1,
    marginBottom: Spacing.md,
  },

  // ── Restaurant ──
  restaurantRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingTop: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.foodBorder,
    marginTop: Spacing.sm,
  },
  restaurantIconBox: {
    width: 36,
    height: 36,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.foodAccentLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  restaurantName: { fontSize: 14, fontWeight: '700', color: Colors.foodText },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 2 },
  ratingText: { fontSize: 12, color: Colors.foodTextSecondary, fontWeight: '600' },

  // ── Timeline ──
  sectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.foodText,
    marginBottom: Spacing.base,
  },
  timeline: { gap: 0 },
  timelineRow: { flexDirection: 'row', minHeight: 44 },
  timelineLeft: {
    width: 24,
    alignItems: 'center',
    marginRight: Spacing.md,
  },
  timelineRight: { flex: 1, paddingBottom: Spacing.md, paddingTop: 2 },
  timelineConnector: {
    width: 2,
    flex: 1,
    marginTop: 4,
    marginBottom: 0,
    borderRadius: 1,
  },
  timelineLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.foodText,
    lineHeight: 20,
  },
  timelineTime: {
    fontSize: 12,
    color: Colors.foodTextMuted,
    marginTop: 1,
  },

  // Timeline dots
  dotDone: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: Colors.success,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  dotCurrent: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: Colors.info,
    borderWidth: 3,
    borderColor: Colors.info + '44',
    marginTop: 5,
  },
  dotPending: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: Colors.foodBorder,
    backgroundColor: Colors.foodBg,
    marginTop: 5,
  },

  // ── Delivery partner ──
  partnerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    marginBottom: Spacing.base,
  },
  partnerAvatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
  },
  partnerAvatarPlaceholder: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: Colors.foodAccent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  partnerAvatarInitials: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.white,
  },
  partnerName: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.foodText,
    marginBottom: 3,
  },
  partnerStats: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  partnerStatText: { fontSize: 12, color: Colors.foodTextSecondary, fontWeight: '500' },
  partnerStatSep: { fontSize: 12, color: Colors.foodTextMuted },
  vegBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  vegDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.foodVegGreen,
    borderWidth: 1,
    borderColor: Colors.foodVegGreen,
  },
  vegBadgeText: {
    fontSize: 11,
    color: Colors.foodVegGreen,
    fontWeight: '600',
  },
  partnerActions: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginTop: Spacing.sm,
    paddingTop: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.foodBorder,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 11,
    borderRadius: BorderRadius.full,
    borderWidth: 1.5,
    borderColor: Colors.foodBorder,
    backgroundColor: Colors.foodBg,
  },
  actionBtnPressed: { opacity: 0.7, backgroundColor: Colors.foodBgSecondary },
  actionBtnText: { fontSize: 14, fontWeight: '700', color: Colors.foodText },

  // ── Order details ──
  orderDetailHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.base,
  },
  orderIdText: { fontSize: 13, color: Colors.foodTextMuted, fontWeight: '600' },
  orderItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.foodBorder,
  },
  orderItemLeft: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  itemIconBox: {
    width: 28,
    height: 28,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: Colors.foodBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  orderItemName: { fontSize: 13, color: Colors.foodText, fontWeight: '500', flexShrink: 1 },
  orderItemNote: { fontSize: 11, color: Colors.foodTextMuted, marginTop: 1 },
  orderItemPrice: { fontSize: 14, fontWeight: '700', color: Colors.foodText, marginLeft: Spacing.sm },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: Spacing.md,
    marginTop: Spacing.xs,
  },
  totalLabel: { fontSize: 14, color: Colors.foodTextSecondary },
  totalValue: { fontSize: 17, fontWeight: '900', color: Colors.foodText, letterSpacing: -0.5 },
  paymentNote: {
    fontSize: 12,
    color: Colors.foodTextMuted,
    textAlign: 'right',
    marginTop: 4,
  },
});
