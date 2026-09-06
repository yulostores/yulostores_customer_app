import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors } from '../../src/constants/Colors';
import { BorderRadius, Shadows, Spacing } from '../../src/constants/Theme';

const CATEGORIES = [
  { id: '1', icon: 'phone-portrait-outline', label: 'Electronics', count: '1,240 items', color: '#7B2FBE' },
  { id: '2', icon: 'shirt-outline', label: 'Fashion', count: '3,800 items', color: '#EC4899' },
  { id: '3', icon: 'home-outline', label: 'Home & Living', count: '920 items', color: '#10B981' },
  { id: '4', icon: 'fitness-outline', label: 'Sports & Fitness', count: '640 items', color: '#F59E0B' },
  { id: '5', icon: 'book-outline', label: 'Books & Education', count: '2,100 items', color: '#3B82F6' },
  { id: '6', icon: 'fast-food-outline', label: 'Food & Groceries', count: '560 items', color: '#EF4444' },
  { id: '7', icon: 'sparkles-outline', label: 'Beauty & Care', count: '1,080 items', color: '#A855F7' },
  { id: '8', icon: 'car-outline', label: 'Automobiles', count: '380 items', color: '#6B7280' },
  { id: '9', icon: 'game-controller-outline', label: 'Gaming', count: '490 items', color: '#14B8A6' },
  { id: '10', icon: 'paw-outline', label: 'Pet Supplies', count: '210 items', color: '#F97316' },
];

export default function CategoriesScreen() {
  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <LinearGradient colors={[Colors.bgDark, Colors.bgMid]} style={styles.bg}>
        <View style={styles.header}>
          <Text style={styles.title}>Categories</Text>
          <Text style={styles.subtitle}>Browse all product categories</Text>
        </View>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.list}
        >
          {CATEGORIES.map((cat) => (
            <Pressable key={cat.id} style={styles.card}>
              <View style={[styles.iconWrap, { backgroundColor: cat.color + '25' }]}>
                <Ionicons name={cat.icon as any} size={26} color={cat.color} />
              </View>
              <View style={styles.info}>
                <Text style={styles.catLabel}>{cat.label}</Text>
                <Text style={styles.catCount}>{cat.count}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
            </Pressable>
          ))}
          <View style={{ height: 20 }} />
        </ScrollView>
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
  list: { paddingHorizontal: Spacing.base, gap: Spacing.md },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.bgCard,
    borderRadius: BorderRadius.lg,
    padding: Spacing.base,
    borderWidth: 1,
    borderColor: Colors.border,
    gap: Spacing.md,
    ...Shadows.sm,
  },
  iconWrap: {
    width: 52,
    height: 52,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  info: { flex: 1 },
  catLabel: { fontSize: 15, fontWeight: '700', color: Colors.white },
  catCount: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
});
