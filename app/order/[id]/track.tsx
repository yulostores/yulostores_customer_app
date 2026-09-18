/**
 * app/order/[id]/track.tsx — Live delivery tracking screen.
 *
 * Mirrors the Zomato-style UI from the design mockup:
 *
 *  ┌─────────────────────────────────────┐
 *  │  [← Back]    MAP ZONE (live map)    │
 *  │           [live partner marker]      │
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
import { useCallback, useEffect, useRef, useState } from 'react';
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
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import TrackingMap from '../../../src/components/tracking/TrackingMap';
import { Colors } from '../../../src/constants/Colors';
import { BorderRadius, Shadows, Spacing } from '../../../src/constants/Theme';
import {
  ORANGE_ACCENT,
  useAccentTheme,
  useThemedStyles,
  type AccentTheme,
} from '../../../src/hooks/useAccentTheme';
import { useOrderTracking } from '../../../src/hooks/useOrderTracking';
import { ApiError } from '../../../src/services/api';
import { submitReview } from '../../../src/services/orders';
import {
  formatRupees,
  shortOrderId,
  stageLabel,
  trackingStatusLabel,
  type TrackingStage,
  type VegFleetState,
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

// ─── Veg-fleet search card ────────────────────────────────────────────────

function formatCountdown(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, '0')}`;
}

function VegFleetCard({
  vegFleet,
  onKeepWaiting,
  onUseAnyPartner,
}: {
  vegFleet: VegFleetState;
  onKeepWaiting: () => Promise<void>;
  onUseAnyPartner: () => Promise<void>;
}) {
  const styles = useThemedStyles(makeStyles);
  const { accent } = useAccentTheme();
  const [secondsLeft, setSecondsLeft] = useState(vegFleet.remainingSeconds ?? 0);
  const [busy, setBusy] = useState<'keep' | 'any' | null>(null);

  // Resync the local ticking countdown whenever the server sends a fresh value
  // (a socket update, or the response from one of the two actions below).
  useEffect(() => {
    setSecondsLeft(vegFleet.remainingSeconds ?? 0);
  }, [vegFleet.remainingSeconds]);

  useEffect(() => {
    if (vegFleet.status !== 'searching') return;
    const timer = setInterval(() => setSecondsLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(timer);
  }, [vegFleet.status]);

  if (vegFleet.status === 'fallback_any_partner') {
    return (
      <View style={styles.card}>
        <View style={styles.vegFleetNoteRow}>
          <Ionicons name="information-circle" size={18} color={Colors.info} />
          <Text style={styles.vegFleetNoteText}>
            We’ve assigned any available partner to get your order there faster.
          </Text>
        </View>
      </View>
    );
  }

  if (vegFleet.status !== 'searching') return null;

  const handleKeepWaiting = async () => {
    if (busy) return;
    setBusy('keep');
    try {
      await onKeepWaiting();
    } catch {
      Alert.alert('Could not extend the search', 'Please try again.');
    } finally {
      setBusy(null);
    }
  };

  const handleUseAnyPartner = () => {
    if (busy) return;
    Alert.alert(
      'Switch to any partner?',
      'Your order may then be delivered by a partner who isn’t on the veg-only fleet.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Switch',
          style: 'destructive',
          onPress: async () => {
            setBusy('any');
            try {
              await onUseAnyPartner();
            } catch {
              Alert.alert('Could not switch partners', 'Please try again.');
            } finally {
              setBusy(null);
            }
          },
        },
      ],
    );
  };

  return (
    <View style={styles.card}>
      <View style={styles.vegFleetHeaderRow}>
        <Ionicons name="leaf" size={18} color={Colors.foodVegGreen} />
        <Text style={styles.sectionTitle}>Looking for a veg-only partner</Text>
      </View>
      <Text style={styles.vegFleetCountdown}>{formatCountdown(secondsLeft)}</Text>
      <Text style={styles.vegFleetHint}>
        We’re finding a delivery partner from our veg-only fleet for this order.
      </Text>
      <View style={styles.vegFleetActions}>
        <Pressable
          style={({ pressed }) => [styles.actionBtn, pressed && styles.actionBtnPressed]}
          onPress={handleKeepWaiting}
          disabled={busy !== null}
        >
          {busy === 'keep' ? (
            <ActivityIndicator size="small" color={accent} />
          ) : (
            <Text style={styles.actionBtnText}>Keep waiting</Text>
          )}
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.actionBtn, pressed && styles.actionBtnPressed]}
          onPress={handleUseAnyPartner}
          disabled={busy !== null}
        >
          {busy === 'any' ? (
            <ActivityIndicator size="small" color={accent} />
          ) : (
            <Text style={styles.actionBtnText}>Switch to any partner</Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

// ─── Rate-your-order card ──────────────────────────────────────────────────

function ReviewCard({ orderId }: { orderId: string }) {
  const styles = useThemedStyles(makeStyles);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [status, setStatus] = useState<'idle' | 'submitting' | 'done' | 'already'>('idle');

  const submit = async () => {
    if (rating === 0 || status === 'submitting') return;
    setStatus('submitting');
    try {
      await submitReview(orderId, rating, comment);
      setStatus('done');
    } catch (err) {
      if (err instanceof ApiError && err.code === 'ALREADY_REVIEWED') {
        setStatus('already');
      } else {
        setStatus('idle');
        Alert.alert(
          'Could not submit your rating',
          err instanceof ApiError ? err.message : 'Please try again.',
        );
      }
    }
  };

  if (status === 'done' || status === 'already') {
    return (
      <View style={styles.card}>
        <View style={styles.reviewDoneRow}>
          <Ionicons
            name={status === 'done' ? 'checkmark-circle' : 'star'}
            size={20}
            color={status === 'done' ? Colors.success : Colors.foodRating}
          />
          <Text style={styles.reviewDoneText}>
            {status === 'done'
              ? 'Thanks for rating your order!'
              : 'You’ve already rated this order — thanks!'}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <Text style={styles.sectionTitle}>Rate your order</Text>
      <View style={styles.starRow}>
        {[1, 2, 3, 4, 5].map((n) => (
          <Pressable key={n} onPress={() => setRating(n)} hitSlop={6}>
            <Ionicons
              name={n <= rating ? 'star' : 'star-outline'}
              size={30}
              color={n <= rating ? Colors.foodRating : Colors.foodBorder}
            />
          </Pressable>
        ))}
      </View>
      <TextInput
        style={styles.reviewInput}
        value={comment}
        onChangeText={(t) => setComment(t.slice(0, 1000))}
        placeholder="Tell us about the food or delivery (optional)"
        placeholderTextColor={Colors.foodTextMuted}
        multiline
        textAlignVertical="top"
      />
      <Pressable
        style={[styles.reviewSubmitBtn, rating === 0 && styles.reviewSubmitBtnDisabled]}
        onPress={submit}
        disabled={rating === 0 || status === 'submitting'}
      >
        {status === 'submitting' ? (
          <ActivityIndicator size="small" color={Colors.white} />
        ) : (
          <Text style={styles.reviewSubmitText}>Submit rating</Text>
        )}
      </Pressable>
    </View>
  );
}

// ─── Main screen ─────────────────────────────────────────────────────────────

export default function TrackingScreen() {
  const styles = useThemedStyles(makeStyles);
  const { accent } = useAccentTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { tracking, partnerLocation, loading, error, refetch, vegFleet, keepWaiting, useAnyPartner } =
    useOrderTracking(id ?? '');

  const [refreshing, setRefreshing] = useState(false);

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
    if (!tracking) return;
    router.push({
      pathname: '/help/new',
      params: { category: 'order_delayed', orderId: tracking.orderId },
    });
  }, [tracking]);

  // ─── Loading / error states ───────────────────────────────────────────────

  if (loading) {
    return (
      <View style={[styles.centered, { paddingTop: insets.top }]}>
        <StatusBar style="dark" />
        <ActivityIndicator size="large" color={accent} />
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

  const statusColor = STATUS_COLOR[tracking.status] ?? accent;
  const statusLabel = trackingStatusLabel(tracking.status, tracking.assignmentStatus);
  const isOnTheWay = tracking.status === 'out_for_delivery';
  const isDelivered = tracking.status === 'delivered';
  const isCancelled = tracking.status === 'cancelled';

  // The backend returns an ETA for every pre-delivery phase now, not only once the rider is
  // carrying the food, so the customer sees a number from the moment they pay — which is what
  // every mature delivery app does and what this screen used to withhold.
  const showEta = !isDelivered && !isCancelled && tracking.etaMinutes != null;

  // A straight-line fallback estimate is a genuinely worse number than a traffic-aware routed
  // one, so it is worded as the approximation it is rather than presented with the same
  // confidence. See `etaSource` in src/services/tracking.ts.
  const etaPrefix = tracking.etaSource === 'here' ? 'Arriving in' : 'Arriving in about';

  const stages = ['placed', 'confirmed', 'preparing', 'ready', 'out_for_delivery', 'delivered'] as TrackingStage[];
  const currentStageIndex = stages.indexOf(tracking.status as TrackingStage);

  return (
    <View style={[styles.root, { backgroundColor: Colors.foodBg }]}>
      <StatusBar style="light" />

      {/* ── MAP ZONE ─────────────────────────────────────────────────────── */}
      <View style={[styles.mapContainer, { paddingTop: insets.top }]}>
        <TrackingMap
          partnerLocation={partnerLocation}
          destination={tracking.deliveryAddress?.coordinates ?? null}
          restaurant={tracking.restaurant.coordinates}
          routePolyline={tracking.route?.polyline ?? null}
          assignmentStatus={tracking.assignmentStatus}
        />

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
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={accent} />
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

            {/* ETA — shown through every phase of the order, not only after pickup */}
            {showEta && (
              <Text style={styles.etaLabel}>
                {etaPrefix}{' '}
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

          {/* ETA countdown (large) — reserved for the leg where the rider is actually carrying
              the food, so the big number keeps meaning "almost there" rather than competing with
              the softer earlier estimates now shown in the pill row above. */}
          {isOnTheWay && tracking.etaMinutes != null && (
            <Text style={styles.etaCountdown}>{tracking.etaMinutes} mins</Text>
          )}

          {/* Restaurant info */}
          {tracking.restaurant.name && (
            <View style={styles.restaurantRow}>
              <View style={styles.restaurantIconBox}>
                <Ionicons name="storefront-outline" size={16} color={accent} />
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

        {/* ── VEG-FLEET SEARCH ─────────────────────────────────────────────── */}
        {vegFleet && vegFleet.status !== 'not_requested' && (
          <VegFleetCard vegFleet={vegFleet} onKeepWaiting={keepWaiting} onUseAnyPartner={useAnyPartner} />
        )}

        {/* ── RATE YOUR ORDER ──────────────────────────────────────────────── */}
        {isDelivered && <ReviewCard orderId={tracking.orderId} />}

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
                        isCurrent && { color: accent, fontWeight: '700' },
                        isPending && { color: Colors.foodTextMuted },
                      ]}
                    >
                      {stageLabel(entry.stage)}
                    </Text>
                    {timeStr ? (
                      <Text style={styles.timelineTime}>{timeStr}</Text>
                    ) : isCurrent ? (
                      <Text style={[styles.timelineTime, { color: accent }]}>Tracking live</Text>
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

const makeStyles = (t: AccentTheme) =>
  StyleSheet.create({
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
    backgroundColor: t.accent,
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
    backgroundColor: t.accentLight,
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
    borderColor: Colors.foodBorderStrong,
    backgroundColor: Colors.foodSurface,
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
    backgroundColor: t.accent,
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
    borderColor: Colors.foodBorderStrong,
    backgroundColor: Colors.foodSurface,
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

  // ── Veg-fleet search card ──
  vegFleetHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 0 },
  vegFleetCountdown: {
    fontSize: 30,
    fontWeight: '900',
    color: Colors.foodText,
    letterSpacing: -0.5,
    marginTop: Spacing.sm,
  },
  vegFleetHint: {
    fontSize: 12.5,
    color: Colors.foodTextSecondary,
    marginTop: 4,
    lineHeight: 18,
  },
  vegFleetActions: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginTop: Spacing.md,
  },
  vegFleetNoteRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  vegFleetNoteText: { flex: 1, fontSize: 13, color: Colors.foodTextSecondary, lineHeight: 18 },

  // ── Rate-your-order card ──
  starRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.base,
  },
  reviewInput: {
    minHeight: 72,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.foodBorderStrong,
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.sm,
    fontSize: 13.5,
    color: Colors.foodText,
    backgroundColor: Colors.foodSurface,
    marginBottom: Spacing.base,
  },
  reviewSubmitBtn: {
    backgroundColor: t.accent,
    borderRadius: BorderRadius.full,
    paddingVertical: Spacing.md,
    alignItems: 'center',
  },
  reviewSubmitBtnDisabled: { opacity: 0.45 },
  reviewSubmitText: { fontSize: 14, fontWeight: '800', color: Colors.white },
  reviewDoneRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  reviewDoneText: { flex: 1, fontSize: 14, fontWeight: '600', color: Colors.foodText },
  });

const styles = makeStyles(ORANGE_ACCENT);
