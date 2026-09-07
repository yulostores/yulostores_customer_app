/**
 * app/help/new.tsx — compose a support request for a chosen topic.
 *
 * The `category` param picks a {@link SupportTopic}; there is no free-text
 * subject (the backend derives `SupportTicket.subject` from the category). The
 * customer writes a description and, for order-related topics, may attach one of
 * their recent orders (`useOrders` → the same `GET /api/orders` list as the
 * Orders tab). Submitting calls `createTicket()` → `POST /api/support/tickets`
 * and lands on the new ticket's thread.
 */

import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors } from '../../src/constants/Colors';
import { BorderRadius, Elevation, Shadows, Spacing } from '../../src/constants/Theme';
import { useAuth } from '../../src/context/AuthContext';
import {
  ORANGE_ACCENT,
  useThemedStyles,
  type AccentTheme,
} from '../../src/hooks/useAccentTheme';
import { useOrders } from '../../src/hooks/useOrders';
import { logger, reportError } from '../../src/lib/logger';
import { ApiError } from '../../src/services/api';
import { statusMeta, type OrderSummary } from '../../src/services/orders';
import { createTicket, topicFor } from '../../src/services/support';

const MAX_DESCRIPTION = 1000;
const RECENT_ORDERS_SHOWN = 6;

function goBack() {
  if (router.canGoBack()) router.back();
  else router.navigate('/help');
}

function formatOrderDate(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

// ─── Order option ────────────────────────────────────────────────────────────

function OrderOption({
  order,
  selected,
  onPress,
}: {
  order: OrderSummary;
  selected: boolean;
  onPress: () => void;
}) {
  const styles = useThemedStyles(makeStyles);
  const { label } = statusMeta(order.status);
  return (
    <Pressable
      style={[styles.orderOption, selected && styles.orderOptionSelected]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
    >
      <View style={styles.orderRadio}>
        {selected ? <View style={styles.orderRadioDot} /> : null}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.orderOptionTitle} numberOfLines={1}>
          {order.title}
        </Text>
        <Text style={styles.orderOptionMeta}>
          #{order.id.slice(-6).toUpperCase()} · {label}
          {order.createdAt ? ` · ${formatOrderDate(order.createdAt)}` : ''}
        </Text>
      </View>
    </Pressable>
  );
}

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function NewSupportRequestScreen() {
  const styles = useThemedStyles(makeStyles);
  const { category, orderId: initialOrderId } = useLocalSearchParams<{
    category?: string;
    /** Pre-selects a specific order — e.g. the "Chat" button on tracking. */
    orderId?: string;
  }>();
  const topic = useMemo(() => topicFor(category ?? 'other'), [category]);

  const { signOut, isAuthenticated, session } = useAuth();
  // A local OTP-bypass session has no real token — creating a ticket would 401.
  const notSignedIn = !(isAuthenticated && !session?.bypassed && !!session?.accessToken);
  const { orders, isLoading: ordersLoading } = useOrders();

  const [description, setDescription] = useState('');
  const [orderId, setOrderId] = useState<string | null>(initialOrderId ?? null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const recentOrders = orders.slice(0, RECENT_ORDERS_SHOWN);
  const showOrderPicker = topic.ordersRelevant && !notSignedIn && recentOrders.length > 0;
  const canSubmit = description.trim().length > 0 && !submitting;

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const ticket = await createTicket({
        category: topic.category,
        description,
        orderId: orderId ?? undefined,
      });
      // replace, not push — Back from the thread returns to the landing.
      router.replace({ pathname: '/help/[id]', params: { id: ticket.id } });
    } catch (err) {
      if (err instanceof ApiError && err.status >= 400 && err.status < 500) {
        logger.warn('support', `Could not create ticket — ${err.status} ${err.code}`, {
          category: topic.category,
          code: err.code,
        });
      } else {
        reportError('support', 'Failed to create support ticket', err, {
          category: topic.category,
        });
      }
      setError(
        err instanceof Error && err.message
          ? err.message
          : 'Could not submit your request. Try again.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  const header = (
    <View style={styles.header}>
      <Pressable onPress={goBack} hitSlop={10} style={styles.backBtn}>
        <Ionicons name="arrow-back" size={22} color={Colors.foodText} />
      </Pressable>
      <Text style={styles.headerTitle} numberOfLines={1}>{topic.title}</Text>
      <View style={styles.backBtn} />
    </View>
  );

  if (notSignedIn) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        {header}
        <View style={styles.centered}>
          <Ionicons name="lock-closed-outline" size={44} color={Colors.foodBorder} />
          <Text style={styles.centeredTitle}>Sign in to raise a request</Text>
          <Text style={styles.centeredText}>
            Support requests are tied to your account so we can look into your orders.
          </Text>
          <Pressable style={styles.primaryBtn} onPress={signOut}>
            <Text style={styles.primaryBtnText}>Sign in</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <StatusBar style="dark" />
      {header}

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.blurb}>{topic.blurb}</Text>

          <Text style={styles.fieldLabel}>Tell us what happened</Text>
          <TextInput
            style={styles.textArea}
            value={description}
            onChangeText={(t) => {
              setDescription(t.slice(0, MAX_DESCRIPTION));
              if (error) setError(null);
            }}
            placeholder={topic.prompt}
            placeholderTextColor={Colors.foodTextMuted}
            multiline
            textAlignVertical="top"
            autoFocus
            maxLength={MAX_DESCRIPTION}
          />
          <Text style={styles.counter}>
            {description.length}/{MAX_DESCRIPTION}
          </Text>

          {showOrderPicker ? (
            <>
              <Text style={[styles.fieldLabel, { marginTop: Spacing.lg }]}>
                Related order <Text style={styles.optional}>· optional</Text>
              </Text>
              <View style={styles.orderList}>
                {recentOrders.map((o) => (
                  <OrderOption
                    key={o.id}
                    order={o}
                    selected={orderId === o.id}
                    onPress={() => setOrderId((cur) => (cur === o.id ? null : o.id))}
                  />
                ))}
              </View>
            </>
          ) : topic.ordersRelevant && ordersLoading ? (
            <View style={styles.ordersLoadingRow}>
              <ActivityIndicator size="small" color={Colors.foodTextMuted} />
              <Text style={styles.ordersLoadingText}>Loading your recent orders…</Text>
            </View>
          ) : null}

          {error ? (
            <View style={styles.errorBox}>
              <Ionicons name="alert-circle" size={15} color={Colors.danger} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}
        </ScrollView>

        <View style={styles.footer}>
          <Pressable
            style={[styles.primaryBtn, !canSubmit && styles.primaryBtnDisabled]}
            onPress={submit}
            disabled={!canSubmit}
          >
            {submitting ? (
              <ActivityIndicator color={Colors.white} />
            ) : (
              <Text style={styles.primaryBtnText}>Submit request</Text>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const makeStyles = (t: AccentTheme) =>
  StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.foodBg },
  flex: { flex: 1 },

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
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '800',
    color: Colors.foodText,
    letterSpacing: -0.3,
  },

  scroll: { padding: Spacing.base, paddingBottom: Spacing.xl },

  blurb: {
    fontSize: 13.5,
    color: Colors.foodTextSecondary,
    lineHeight: 19,
    marginBottom: Spacing.lg,
  },

  fieldLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: Colors.foodTextSecondary,
    letterSpacing: 0.4,
    marginBottom: Spacing.sm,
    textTransform: 'uppercase',
  },
  optional: {
    fontWeight: '600',
    color: Colors.foodTextMuted,
    letterSpacing: 0,
  },

  textArea: {
    minHeight: 132,
    borderRadius: BorderRadius.md,
    borderWidth: 1.5,
    borderColor: Colors.foodBorderStrong,
    backgroundColor: Colors.foodSurface,
    paddingHorizontal: Spacing.base,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.md,
    fontSize: 15,
    lineHeight: 21,
    color: Colors.foodText,
  },
  counter: {
    fontSize: 11,
    color: Colors.foodTextMuted,
    alignSelf: 'flex-end',
    marginTop: 6,
  },

  orderList: {
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.foodBorder,
    backgroundColor: Colors.foodSurface,
    overflow: 'hidden',
    ...Elevation.card,
  },
  orderOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.foodBorder,
  },
  orderOptionSelected: { backgroundColor: t.accentLight },
  orderRadio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: Colors.foodTextMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  orderRadioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: t.accent,
  },
  orderOptionTitle: { fontSize: 14, fontWeight: '600', color: Colors.foodText },
  orderOptionMeta: { fontSize: 12, color: Colors.foodTextMuted, marginTop: 2 },

  ordersLoadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.lg,
  },
  ordersLoadingText: { fontSize: 13, color: Colors.foodTextMuted },

  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.base,
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    backgroundColor: '#FDECEC',
  },
  errorText: { flex: 1, fontSize: 13, color: Colors.danger, fontWeight: '600' },

  footer: {
    paddingHorizontal: Spacing.base,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.base,
    borderTopWidth: 1,
    borderTopColor: Colors.foodBorder,
    backgroundColor: Colors.foodSurface,
    ...Elevation.sticky,
  },
  primaryBtn: {
    height: 52,
    borderRadius: BorderRadius.full,
    backgroundColor: t.accent,
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadows.sm,
  },
  primaryBtnDisabled: { opacity: 0.45, shadowOpacity: 0, elevation: 0 },
  primaryBtnText: { fontSize: 15, fontWeight: '800', color: Colors.white, letterSpacing: 0.3 },

  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.xl,
  },
  centeredTitle: { fontSize: 17, fontWeight: '800', color: Colors.foodText, marginTop: Spacing.sm },
  centeredText: {
    fontSize: 13.5,
    color: Colors.foodTextSecondary,
    textAlign: 'center',
    lineHeight: 19,
    marginBottom: Spacing.md,
  },
  });

const styles = makeStyles(ORANGE_ACCENT);
