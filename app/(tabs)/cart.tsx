import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useState } from 'react';
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors } from '../../src/constants/Colors';
import { BorderRadius, Shadows, Spacing } from '../../src/constants/Theme';

type CartItem = {
  id: string;
  name: string;
  price: number;
  qty: number;
};

const INITIAL_ITEMS: CartItem[] = [
  { id: '1', name: 'iPhone 15 Pro Max', price: 850000, qty: 1 },
  { id: '2', name: 'Sony WH-1000XM5', price: 185000, qty: 1 },
];

const fmt = (n: number) =>
  '₦' + n.toLocaleString('en-NG');

export default function CartScreen() {
  const [items, setItems] = useState<CartItem[]>(INITIAL_ITEMS);

  const updateQty = (id: string, delta: number) => {
    setItems((prev) =>
      prev
        .map((i) => (i.id === id ? { ...i, qty: i.qty + delta } : i))
        .filter((i) => i.qty > 0),
    );
  };

  const subtotal = items.reduce((sum, i) => sum + i.price * i.qty, 0);
  const delivery = 2500;
  const total = subtotal + delivery;

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <LinearGradient colors={[Colors.bgDark, Colors.bgMid]} style={styles.bg}>
        <View style={styles.header}>
          <Text style={styles.title}>My Cart</Text>
          <Text style={styles.itemCount}>{items.length} item{items.length !== 1 ? 's' : ''}</Text>
        </View>

        {items.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="bag-outline" size={80} color={Colors.textMuted} />
            <Text style={styles.emptyText}>Your cart is empty</Text>
            <Text style={styles.emptySub}>Add items to get started</Text>
          </View>
        ) : (
          <>
            <FlatList
              data={items}
              keyExtractor={(i) => i.id}
              contentContainerStyle={styles.list}
              renderItem={({ item }) => (
                <View style={styles.card}>
                  <LinearGradient
                    colors={['#2D0B5C', '#4C1D95']}
                    style={styles.imgPlaceholder}
                  >
                    <Ionicons name="image-outline" size={28} color="rgba(255,255,255,0.2)" />
                  </LinearGradient>
                  <View style={styles.cardBody}>
                    <Text style={styles.itemName} numberOfLines={2}>{item.name}</Text>
                    <Text style={styles.itemPrice}>{fmt(item.price)}</Text>
                    <View style={styles.qtyRow}>
                      <Pressable style={styles.qtyBtn} onPress={() => updateQty(item.id, -1)}>
                        <Ionicons name="remove" size={16} color={Colors.white} />
                      </Pressable>
                      <Text style={styles.qtyText}>{item.qty}</Text>
                      <Pressable style={styles.qtyBtn} onPress={() => updateQty(item.id, 1)}>
                        <Ionicons name="add" size={16} color={Colors.white} />
                      </Pressable>
                    </View>
                  </View>
                  <Pressable onPress={() => updateQty(item.id, -item.qty)}>
                    <Ionicons name="trash-outline" size={20} color={Colors.danger} />
                  </Pressable>
                </View>
              )}
            />

            {/* Summary */}
            <View style={styles.summary}>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Subtotal</Text>
                <Text style={styles.summaryVal}>{fmt(subtotal)}</Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Delivery</Text>
                <Text style={styles.summaryVal}>{fmt(delivery)}</Text>
              </View>
              <View style={[styles.summaryRow, styles.totalRow]}>
                <Text style={styles.totalLabel}>Total</Text>
                <Text style={styles.totalVal}>{fmt(total)}</Text>
              </View>
              <Pressable style={styles.checkoutBtn}>
                <LinearGradient
                  colors={[Colors.primary, Colors.primaryDark]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.checkoutGradient}
                >
                  <Text style={styles.checkoutText}>Proceed to Checkout</Text>
                  <Ionicons name="arrow-forward" size={18} color={Colors.white} />
                </LinearGradient>
              </Pressable>
            </View>
          </>
        )}
      </LinearGradient>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.bgDark },
  bg: { flex: 1 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.base,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.base,
  },
  title: { fontSize: 26, fontWeight: '800', color: Colors.white },
  itemCount: { fontSize: 13, color: Colors.primaryLight, fontWeight: '600' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  emptyText: { fontSize: 18, fontWeight: '700', color: Colors.white },
  emptySub: { fontSize: 13, color: Colors.textMuted },
  list: { paddingHorizontal: Spacing.base, gap: Spacing.md, paddingBottom: Spacing.base },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.bgCard,
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: Spacing.md,
    ...Shadows.sm,
  },
  imgPlaceholder: {
    width: 72,
    height: 72,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardBody: { flex: 1, gap: 5 },
  itemName: { fontSize: 13, fontWeight: '600', color: Colors.white },
  itemPrice: { fontSize: 15, fontWeight: '800', color: Colors.primaryLight },
  qtyRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 2 },
  qtyBtn: {
    width: 28,
    height: 28,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyText: { fontSize: 15, fontWeight: '700', color: Colors.white, minWidth: 20, textAlign: 'center' },
  summary: {
    backgroundColor: Colors.bgCard,
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: Spacing.md,
  },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between' },
  summaryLabel: { fontSize: 14, color: Colors.textMuted },
  summaryVal: { fontSize: 14, color: Colors.white, fontWeight: '600' },
  totalRow: { borderTopWidth: 1, borderTopColor: Colors.divider, paddingTop: Spacing.md },
  totalLabel: { fontSize: 16, fontWeight: '700', color: Colors.white },
  totalVal: { fontSize: 18, fontWeight: '800', color: Colors.primaryLight },
  checkoutBtn: { borderRadius: BorderRadius.lg, overflow: 'hidden', marginTop: 4 },
  checkoutGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: Spacing.base,
    borderRadius: BorderRadius.lg,
  },
  checkoutText: { fontSize: 16, fontWeight: '700', color: Colors.white },
});
