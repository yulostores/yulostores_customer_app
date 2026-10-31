/**
 * app/order/[id]/bill.tsx — the customer's bill for one order, to read in the app.
 *
 * View only: printing and "Save as PDF" are for the restaurant (owner portal), so this screen
 * renders the bill natively instead of handing it to the system print sheet. Same data and same
 * wording helpers in src/lib/billHtml.ts, data from src/services/orderBill.ts → getOrderBill — every amount is the server's own: item prices frozen on the order and
 * the order's `charges.lines`.
 */

import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors } from '../../../src/constants/Colors';
import { BorderRadius, Shadows, Spacing } from '../../../src/constants/Theme';
import { useAccentTheme, useThemedStyles, type AccentTheme } from '../../../src/hooks/useAccentTheme';
import {
  formatPaise as paise,
  formatPlacedAt,
  formatRupees as rupees,
  paymentLine,
  shortOrderRef,
  type BillData,
} from '../../../src/lib/billHtml';
import { reportError } from '../../../src/lib/logger';
import { getOrderBill } from '../../../src/services/orderBill';

function goBack() {
  if (router.canGoBack()) router.back();
  else router.navigate('/orders');
}

export default function OrderBillScreen() {
  const styles = useThemedStyles(makeStyles);
  const { accent } = useAccentTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const orderId = typeof id === 'string' ? id : '';
  const [bill, setBill] = useState<BillData | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(() => {
    setFailed(false);
    getOrderBill(orderId)
      .then(setBill)
      .catch((err) => {
        reportError('bill', 'Could not load the bill', err, { orderId });
        setFailed(true);
      });
  }, [orderId]);

  useEffect(() => {
    if (orderId) load();
  }, [orderId, load]);

  const header = (
    <View style={styles.header}>
      <Pressable onPress={goBack} hitSlop={10} style={styles.backBtn} accessibilityLabel="Back">
        <Ionicons name="arrow-back" size={24} color={Colors.foodText} />
      </Pressable>
      <Text style={styles.title}>Bill</Text>
    </View>
  );

  if (!bill) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <StatusBar style="dark" />
        {header}
        <View style={styles.centered}>
          {failed ? (
            <>
              <Ionicons name="cloud-offline-outline" size={44} color={Colors.foodBorder} />
              <Text style={styles.centeredTitle}>Couldn’t load the bill</Text>
              <Pressable style={styles.retryBtn} onPress={load}>
                <Text style={styles.retryText}>Try again</Text>
              </Pressable>
            </>
          ) : (
            <ActivityIndicator size="large" color={accent} />
          )}
        </View>
      </SafeAreaView>
    );
  }

  const placedAt = formatPlacedAt(bill.placedAt);
  const totalPaise = bill.charges.find((c) => c.key === 'grand_total')?.amountPaise;
  const total = totalPaise != null ? paise(totalPaise) : rupees(bill.grandTotal);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <StatusBar style="dark" />
      {header}
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.card}>
          <Text style={styles.restaurant}>{bill.restaurant.name}</Text>
          {bill.restaurant.addressLine ? <Text style={styles.muted}>{bill.restaurant.addressLine}</Text> : null}
          {bill.restaurant.phone ? <Text style={styles.muted}>Phone: {bill.restaurant.phone}</Text> : null}
          {bill.restaurant.gstin ? <Text style={styles.muted}>GSTIN: {bill.restaurant.gstin}</Text> : null}

          {bill.status === 'cancelled' ? (
            <View style={styles.banner}>
              <Text style={styles.bannerText}>ORDER CANCELLED</Text>
            </View>
          ) : null}

          <View style={styles.divider} />

          <View style={styles.metaRow}>
            <View style={styles.metaCol}>
              <Text style={styles.label}>BILL</Text>
              <Text style={styles.strong}>Order {shortOrderRef(bill.orderId)}</Text>
              {placedAt ? <Text style={styles.muted}>{placedAt}</Text> : null}
            </View>
            <View style={styles.metaCol}>
              <Text style={styles.label}>DELIVERED TO</Text>
              {bill.customer.name ? <Text style={styles.body}>{bill.customer.name}</Text> : null}
              {bill.customer.addressLine ? <Text style={styles.muted}>{bill.customer.addressLine}</Text> : null}
            </View>
          </View>

          <View style={styles.divider} />

          {bill.items.map((item, i) => (
            <View key={`${item.name}-${i}`} style={styles.row}>
              <View style={styles.rowMain}>
                <Text style={styles.body}>{item.name}</Text>
                <Text style={styles.sub}>
                  {item.quantity} × {rupees(item.unitPrice)}
                </Text>
              </View>
              <Text style={styles.amount}>{rupees(item.unitPrice * item.quantity)}</Text>
            </View>
          ))}

          <View style={styles.divider} />

          {bill.charges
            .filter((c) => c.key !== 'grand_total')
            .map((c) => (
              <View key={c.key} style={styles.row}>
                <View style={styles.rowMain}>
                  <Text style={styles.body}>{c.label}</Text>
                  {c.sublabel ? <Text style={styles.sub}>{c.sublabel}</Text> : null}
                </View>
                <Text style={styles.amount}>{c.amountPaise == null ? '—' : paise(c.amountPaise)}</Text>
              </View>
            ))}

          <View style={[styles.row, styles.totalRow]}>
            <Text style={styles.totalLabel}>Total</Text>
            <Text style={styles.totalValue}>{total}</Text>
          </View>

          <Text style={[styles.label, styles.paymentLabel]}>PAYMENT</Text>
          <Text style={styles.body}>{paymentLine(bill.paymentMethod, bill.paymentStatus)}</Text>
        </View>

        <Text style={styles.foot}>Ordered on Yulo Stores · Prices include the taxes shown above</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const makeStyles = (t: AccentTheme) =>
  StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: Colors.foodBg },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: Spacing.md,
      paddingHorizontal: Spacing.lg,
      paddingTop: Spacing.md,
      paddingBottom: Spacing.base,
    },
    backBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
    title: { flex: 1, fontSize: 24, fontWeight: '800', color: Colors.foodText, letterSpacing: -0.5 },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.sm },
    centeredTitle: { fontSize: 16, fontWeight: '800', color: Colors.foodText },
    retryBtn: {
      backgroundColor: t.accent,
      paddingHorizontal: Spacing.xl,
      paddingVertical: Spacing.md,
      borderRadius: BorderRadius.full,
      marginTop: Spacing.sm,
    },
    retryText: { fontSize: 14, fontWeight: '700', color: Colors.white },
    scroll: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing['3xl'] },
    card: {
      backgroundColor: Colors.foodSurface,
      borderRadius: BorderRadius.lg,
      padding: Spacing.lg,
      borderWidth: 1,
      borderColor: Colors.foodBorder,
      ...Shadows.sm,
    },
    restaurant: { fontSize: 18, fontWeight: '800', color: Colors.foodText, marginBottom: 2 },
    muted: { fontSize: 12.5, color: Colors.foodTextSecondary, lineHeight: 18 },
    banner: {
      marginTop: Spacing.md,
      borderWidth: 2,
      borderColor: Colors.danger,
      borderRadius: BorderRadius.sm,
      paddingVertical: Spacing.sm,
      alignItems: 'center',
    },
    bannerText: { color: Colors.danger, fontWeight: '800', letterSpacing: 0.5 },
    divider: { height: 1, backgroundColor: Colors.foodBorder, marginVertical: Spacing.md },
    metaRow: { flexDirection: 'row', gap: Spacing.md },
    metaCol: { flex: 1 },
    label: { fontSize: 10.5, fontWeight: '700', letterSpacing: 0.6, color: Colors.foodTextMuted, marginBottom: 2 },
    strong: { fontSize: 14, fontWeight: '800', color: Colors.foodText },
    body: { fontSize: 14, color: Colors.foodText },
    sub: { fontSize: 12, color: Colors.foodTextMuted, marginTop: 1 },
    row: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.md, paddingVertical: 6 },
    rowMain: { flex: 1 },
    amount: { fontSize: 14, color: Colors.foodText, fontVariant: ['tabular-nums'] },
    totalRow: {
      borderTopWidth: 2,
      borderTopColor: Colors.foodText,
      marginTop: Spacing.sm,
      paddingTop: Spacing.md,
    },
    totalLabel: { flex: 1, fontSize: 16, fontWeight: '800', color: Colors.foodText },
    totalValue: { fontSize: 16, fontWeight: '800', color: Colors.foodText, fontVariant: ['tabular-nums'] },
    paymentLabel: { marginTop: Spacing.lg },
    foot: {
      textAlign: 'center',
      fontSize: 11.5,
      color: Colors.foodTextMuted,
      marginTop: Spacing.lg,
    },
  });
