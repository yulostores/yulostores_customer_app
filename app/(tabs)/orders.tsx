import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors } from '../../src/constants/Colors';
import { BorderRadius, Shadows, Spacing } from '../../src/constants/Theme';

type OrderStatus = 'Delivered' | 'In Transit' | 'Processing' | 'Cancelled';

const STATUS_MAP: Record<OrderStatus, { icon: string; color: string }> = {
  Delivered: { icon: 'checkmark-circle', color: Colors.success },
  'In Transit': { icon: 'bicycle', color: Colors.info },
  Processing: { icon: 'time', color: Colors.warning },
  Cancelled: { icon: 'close-circle', color: Colors.danger },
};

const ORDERS = [
  { id: 'YS-004521', date: 'Sep 5, 2026', status: 'Delivered' as OrderStatus, total: '₦1,035,000', items: 2 },
  { id: 'YS-004489', date: 'Sep 2, 2026', status: 'In Transit' as OrderStatus, total: '₦75,000', items: 1 },
  { id: 'YS-004401', date: 'Aug 28, 2026', status: 'Processing' as OrderStatus, total: '₦430,000', items: 1 },
  { id: 'YS-004320', date: 'Aug 20, 2026', status: 'Cancelled' as OrderStatus, total: '₦22,500', items: 3 },
];

export default function OrdersScreen() {
  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <LinearGradient colors={[Colors.bgDark, Colors.bgMid]} style={styles.bg}>
        <View style={styles.header}>
          <Text style={styles.title}>My Orders</Text>
          <Text style={styles.subtitle}>{ORDERS.length} orders placed</Text>
        </View>
        <FlatList
          data={ORDERS}
          keyExtractor={(o) => o.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => {
            const meta = STATUS_MAP[item.status];
            return (
              <View style={styles.card}>
                <View style={styles.cardTop}>
                  <Text style={styles.orderId}># {item.id}</Text>
                  <View style={[styles.statusBadge, { backgroundColor: meta.color + '22' }]}>
                    <Ionicons name={meta.icon as any} size={13} color={meta.color} />
                    <Text style={[styles.statusText, { color: meta.color }]}>{item.status}</Text>
                  </View>
                </View>
                <View style={styles.divider} />
                <View style={styles.cardBottom}>
                  <View style={styles.metaItem}>
                    <Ionicons name="calendar-outline" size={13} color={Colors.textMuted} />
                    <Text style={styles.metaText}>{item.date}</Text>
                  </View>
                  <View style={styles.metaItem}>
                    <Ionicons name="bag-outline" size={13} color={Colors.textMuted} />
                    <Text style={styles.metaText}>{item.items} item{item.items > 1 ? 's' : ''}</Text>
                  </View>
                  <Text style={styles.total}>{item.total}</Text>
                </View>
              </View>
            );
          }}
        />
      </LinearGradient>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.bgDark },
  bg: { flex: 1 },
  header: { paddingHorizontal: Spacing.base, paddingTop: Spacing.md, paddingBottom: Spacing.base },
  title: { fontSize: 26, fontWeight: '800', color: Colors.white },
  subtitle: { fontSize: 13, color: Colors.textMuted, marginTop: 2 },
  list: { paddingHorizontal: Spacing.base, gap: Spacing.md, paddingBottom: 20 },
  card: {
    backgroundColor: Colors.bgCard,
    borderRadius: BorderRadius.lg,
    padding: Spacing.base,
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadows.sm,
  },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  orderId: { fontSize: 14, fontWeight: '700', color: Colors.white },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
  },
  statusText: { fontSize: 12, fontWeight: '700' },
  divider: { height: 1, backgroundColor: Colors.divider, marginVertical: Spacing.md },
  cardBottom: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaText: { fontSize: 12, color: Colors.textMuted },
  total: { marginLeft: 'auto', fontSize: 15, fontWeight: '800', color: Colors.primaryLight },
});
