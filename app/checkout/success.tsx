/**
 * app/checkout/success.tsx — order confirmation.
 *
 * Reached with `router.replace` from the Payment screen once the order is placed
 * and (for online methods) paid. Params carry enough for an instant render;
 * `GET /api/orders/:id` then confirms the authoritative status / payment state.
 */

import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../../src/constants/Colors';
import { BorderRadius, Spacing } from '../../src/constants/Theme';
import { reportError } from '../../src/lib/logger';
import { getOrder, type OrderView } from '../../src/services/orders';

const formatMoney = (n: number) =>
  '₹' + Math.max(0, n).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function etaText(iso: string | null): string | null {
  if (!iso) return null;
  const mins = Math.round((new Date(iso).getTime() - Date.now()) / 60000);
  if (!Number.isFinite(mins) || mins <= 0) return null;
  return `Arriving in about ${mins} min`;
}

export default function OrderSuccessScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{
    orderId?: string;
    cod?: string;
    total?: string;
    method?: string;
  }>();

  const orderId = typeof params.orderId === 'string' ? params.orderId : '';
  const isCod = params.cod === '1';
  const paramTotal = Number(params.total) || 0;
  const methodLabel = typeof params.method === 'string' ? params.method : null;

  const [order, setOrder] = useState<OrderView | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    if (!orderId) {
      setLoaded(true);
      return;
    }
    getOrder(orderId)
      .then((o) => {
        if (alive) setOrder(o);
      })
      .catch((err) => {
        // The order was placed — a failed confirmation read is not worth alarming
        // the customer over; fall back to the params we were handed.
        reportError('checkout', 'Could not load placed order for confirmation', err, { orderId });
      })
      .finally(() => {
        if (alive) setLoaded(true);
      });
    return () => {
      alive = false;
    };
  }, [orderId]);

  const total = order?.grandTotal || paramTotal;
  const paid = order ? order.paymentStatus === 'paid' : !isCod;
  const eta = etaText(order?.estimatedDeliveryTime ?? null);

  const paymentLine = isCod
    ? 'Pay on delivery'
    : paid
      ? `Paid${methodLabel ? ` · ${methodLabel}` : ''}`
      : `Payment ${order?.paymentStatus ?? 'pending'}`;

  return (
    <View style={styles.screen}>
      <StatusBar style="dark" />
      <View style={{ height: insets.top }} />

      <View style={styles.body}>
        <View style={styles.badge}>
          <Ionicons name="checkmark" size={44} color={Colors.white} />
        </View>

        <Text style={styles.title}>Order placed</Text>
        <Text style={styles.subtitle}>
          {isCod
            ? 'Your order is confirmed. Keep the exact amount ready for delivery.'
            : 'Your payment went through and your order is confirmed.'}
        </Text>

        {!loaded ? (
          <ActivityIndicator style={{ marginTop: Spacing.lg }} color={Colors.foodAccent} />
        ) : (
          <View style={styles.card}>
            <Row label="Order ID" value={`#${(order?.id ?? orderId).slice(-8).toUpperCase()}`} />
            <View style={styles.divider} />
            <Row label="Amount" value={formatMoney(total)} />
            <View style={styles.divider} />
            <Row label="Payment" value={paymentLine} highlight={paid || isCod} />
            {order?.deliveryLine ? (
              <>
                <View style={styles.divider} />
                <Row label="Delivering to" value={order.deliveryLine} />
              </>
            ) : null}
            {eta ? (
              <>
                <View style={styles.divider} />
                <Row label="ETA" value={eta} />
              </>
            ) : null}
          </View>
        )}
      </View>

      <View style={[styles.footer, { paddingBottom: insets.bottom + Spacing.md }]}>
        <Pressable style={styles.primaryBtn} onPress={() => router.replace('/(tabs)/orders')}>
          <Text style={styles.primaryBtnText}>View my orders</Text>
        </Pressable>
        <Pressable style={styles.secondaryBtn} onPress={() => router.replace('/(tabs)')}>
          <Text style={styles.secondaryBtnText}>Back to home</Text>
        </Pressable>
      </View>
    </View>
  );
}

function Row({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, highlight && styles.rowValueHighlight]} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.foodBg },
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Spacing.xl },

  badge: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: Colors.foodVegGreen,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.lg,
  },
  title: { fontSize: 24, fontWeight: '800', color: Colors.foodText },
  subtitle: {
    fontSize: 14,
    color: Colors.foodTextSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginTop: Spacing.sm,
  },

  card: {
    alignSelf: 'stretch',
    marginTop: Spacing.xl,
    backgroundColor: Colors.foodCardBg,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.foodBorder,
    paddingHorizontal: Spacing.base,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.md,
    gap: Spacing.md,
  },
  rowLabel: { fontSize: 13, color: Colors.foodTextSecondary },
  rowValue: { flex: 1, textAlign: 'right', fontSize: 13.5, fontWeight: '700', color: Colors.foodText },
  rowValueHighlight: { color: Colors.foodVegGreen },
  divider: { height: 1, backgroundColor: Colors.foodBorder },

  footer: {
    paddingHorizontal: Spacing.base,
    paddingTop: Spacing.md,
    gap: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.foodBorder,
    backgroundColor: Colors.foodSurface,
  },
  primaryBtn: {
    height: 52,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.foodAccent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnText: { fontSize: 16, fontWeight: '800', color: Colors.white },
  secondaryBtn: { height: 46, alignItems: 'center', justifyContent: 'center' },
  secondaryBtnText: { fontSize: 14, fontWeight: '700', color: Colors.foodTextSecondary },
});
