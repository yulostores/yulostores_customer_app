import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  FlatList,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors } from '../../src/constants/Colors';
import { BorderRadius, Shadows, Spacing } from '../../src/constants/Theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// --- Mock data ---
const BANNERS = [
  { id: '1', label: 'Summer Sale', sub: 'Up to 50% off on Electronics', color: '#7B2FBE' },
  { id: '2', label: 'New Arrivals', sub: 'Fresh Fashion Picks Just Landed', color: '#5C1A9A' },
  { id: '3', label: 'Free Delivery', sub: 'On orders above ₦10,000', color: '#4C1D95' },
];

const CATEGORIES = [
  { id: '1', icon: 'phone-portrait-outline', label: 'Electronics' },
  { id: '2', icon: 'shirt-outline', label: 'Fashion' },
  { id: '3', icon: 'home-outline', label: 'Home' },
  { id: '4', icon: 'fitness-outline', label: 'Sports' },
  { id: '5', icon: 'book-outline', label: 'Books' },
  { id: '6', icon: 'fast-food-outline', label: 'Food' },
  { id: '7', icon: 'sparkles-outline', label: 'Beauty' },
  { id: '8', icon: 'car-outline', label: 'Auto' },
];

const FEATURED = [
  {
    id: '1',
    name: 'iPhone 15 Pro Max',
    price: '₦850,000',
    rating: '4.9',
    reviews: '2.3k',
    badge: 'Hot 🔥',
  },
  {
    id: '2',
    name: 'Samsung QLED TV 55"',
    price: '₦430,000',
    rating: '4.7',
    reviews: '1.1k',
    badge: 'Sale',
  },
  {
    id: '3',
    name: 'Nike Air Max 2025',
    price: '₦75,000',
    rating: '4.8',
    reviews: '845',
    badge: 'New',
  },
  {
    id: '4',
    name: 'Sony WH-1000XM5',
    price: '₦185,000',
    rating: '4.9',
    reviews: '3.2k',
    badge: 'Top Pick',
  },
];

// --- Sub-components ---

function Banner() {
  const [activeIndex, setActiveIndex] = useState(0);

  return (
    <View style={styles.bannerContainer}>
      <FlatList
        data={BANNERS}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        keyExtractor={(item) => item.id}
        onMomentumScrollEnd={(e) => {
          const index = Math.round(e.nativeEvent.contentOffset.x / (SCREEN_WIDTH - 32));
          setActiveIndex(index);
        }}
        renderItem={({ item }) => (
          <LinearGradient
            colors={[item.color, '#1A0533']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.bannerCard}
          >
            <View>
              <Text style={styles.bannerBadge}>✨ Limited Time</Text>
              <Text style={styles.bannerLabel}>{item.label}</Text>
              <Text style={styles.bannerSub}>{item.sub}</Text>
              <Pressable style={styles.bannerBtn}>
                <Text style={styles.bannerBtnText}>Shop Now</Text>
                <Ionicons name="arrow-forward" size={14} color={Colors.primaryDark} />
              </Pressable>
            </View>
            <Ionicons name="bag-handle" size={80} color="rgba(255,255,255,0.12)" />
          </LinearGradient>
        )}
      />
      {/* Dots */}
      <View style={styles.dots}>
        {BANNERS.map((_, i) => (
          <View
            key={i}
            style={[styles.dot, i === activeIndex && styles.dotActive]}
          />
        ))}
      </View>
    </View>
  );
}

function CategoryItem({ icon, label }: { icon: string; label: string }) {
  const scale = useRef(new Animated.Value(1)).current;

  const onPress = () => {
    Animated.sequence([
      Animated.timing(scale, { toValue: 0.9, duration: 80, useNativeDriver: true }),
      Animated.timing(scale, { toValue: 1, duration: 80, useNativeDriver: true }),
    ]).start();
  };

  return (
    <Pressable onPress={onPress}>
      <Animated.View style={[styles.categoryItem, { transform: [{ scale }] }]}>
        <View style={styles.categoryIconWrap}>
          <Ionicons name={icon as any} size={22} color={Colors.primaryLight} />
        </View>
        <Text style={styles.categoryLabel}>{label}</Text>
      </Animated.View>
    </Pressable>
  );
}

function ProductCard({ item }: { item: (typeof FEATURED)[0] }) {
  const [wishlisted, setWishlisted] = useState(false);
  const scale = useRef(new Animated.Value(1)).current;

  const onAddToCart = () => {
    Animated.sequence([
      Animated.timing(scale, { toValue: 0.93, duration: 80, useNativeDriver: true }),
      Animated.timing(scale, { toValue: 1, duration: 80, useNativeDriver: true }),
    ]).start();
  };

  return (
    <Animated.View style={[styles.productCard, { transform: [{ scale }] }]}>
      {/* Image placeholder */}
      <LinearGradient
        colors={['#2D0B5C', '#4C1D95']}
        style={styles.productImage}
      >
        <Ionicons name="image-outline" size={40} color="rgba(255,255,255,0.2)" />
        <View style={styles.badgeWrap}>
          <Text style={styles.badgeText}>{item.badge}</Text>
        </View>
        <Pressable
          style={styles.wishlistBtn}
          onPress={() => setWishlisted((v) => !v)}
        >
          <Ionicons
            name={wishlisted ? 'heart' : 'heart-outline'}
            size={18}
            color={wishlisted ? '#EF4444' : Colors.white}
          />
        </Pressable>
      </LinearGradient>

      <View style={styles.productInfo}>
        <Text style={styles.productName} numberOfLines={2}>
          {item.name}
        </Text>
        <View style={styles.ratingRow}>
          <Ionicons name="star" size={12} color={Colors.secondary} />
          <Text style={styles.ratingText}>
            {item.rating} ({item.reviews})
          </Text>
        </View>
        <View style={styles.priceRow}>
          <Text style={styles.priceText}>{item.price}</Text>
          <Pressable style={styles.addBtn} onPress={onAddToCart}>
            <Ionicons name="add" size={18} color={Colors.white} />
          </Pressable>
        </View>
      </View>
    </Animated.View>
  );
}

// --- Main Screen ---
export default function HomeScreen() {
  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <LinearGradient
        colors={[Colors.bgDark, Colors.bgMid]}
        style={styles.bg}
      >
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          {/* Header */}
          <View style={styles.header}>
            <View>
              <Text style={styles.greeting}>Good evening 👋</Text>
              <Text style={styles.appTitle}>Yulo Stores</Text>
            </View>
            <View style={styles.headerActions}>
              <Pressable style={styles.iconBtn}>
                <Ionicons name="notifications-outline" size={22} color={Colors.textSecondary} />
                <View style={styles.notifBadge} />
              </Pressable>
              <Pressable style={styles.avatarBtn}>
                <Ionicons name="person" size={18} color={Colors.white} />
              </Pressable>
            </View>
          </View>

          {/* Search */}
          <View style={styles.searchWrap}>
            <Ionicons name="search-outline" size={18} color={Colors.textMuted} style={styles.searchIcon} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search products, brands..."
              placeholderTextColor={Colors.textMuted}
            />
            <Pressable style={styles.filterBtn}>
              <Ionicons name="options-outline" size={18} color={Colors.primaryLight} />
            </Pressable>
          </View>

          {/* Banner */}
          <Banner />

          {/* Categories */}
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Categories</Text>
            <Pressable>
              <Text style={styles.seeAll}>See all</Text>
            </Pressable>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.categoriesList}
          >
            {CATEGORIES.map((cat) => (
              <CategoryItem key={cat.id} icon={cat.icon} label={cat.label} />
            ))}
          </ScrollView>

          {/* Flash Sale Promo */}
          <LinearGradient
            colors={['#D97706', '#F59E0B']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.flashSale}
          >
            <View>
              <Text style={styles.flashLabel}>⚡ Flash Sale</Text>
              <Text style={styles.flashSub}>Ends in 02:45:30</Text>
            </View>
            <Pressable style={styles.flashBtn}>
              <Text style={styles.flashBtnText}>View All</Text>
            </Pressable>
          </LinearGradient>

          {/* Featured Products */}
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Featured Products</Text>
            <Pressable>
              <Text style={styles.seeAll}>See all</Text>
            </Pressable>
          </View>
          <View style={styles.productsGrid}>
            {FEATURED.map((item) => (
              <ProductCard key={item.id} item={item} />
            ))}
          </View>

          {/* Bottom spacer */}
          <View style={{ height: 20 }} />
        </ScrollView>
      </LinearGradient>
    </SafeAreaView>
  );
}

const CARD_WIDTH = (SCREEN_WIDTH - Spacing.base * 2 - Spacing.md) / 2;

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.bgDark,
  },
  bg: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: Spacing.base,
    paddingTop: Spacing.md,
  },

  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.base,
  },
  greeting: {
    fontSize: 13,
    color: Colors.textMuted,
    marginBottom: 2,
  },
  appTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: Colors.white,
    letterSpacing: -0.5,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.bgCard,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  notifBadge: {
    position: 'absolute',
    top: 9,
    right: 9,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.danger,
    borderWidth: 1.5,
    borderColor: Colors.bgMid,
  },
  avatarBtn: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Search
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.bgCard,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.base,
    height: 48,
  },
  searchIcon: {
    marginRight: Spacing.sm,
  },
  searchInput: {
    flex: 1,
    color: Colors.white,
    fontSize: 14,
  },
  filterBtn: {
    width: 32,
    height: 32,
    backgroundColor: 'rgba(123,47,190,0.2)',
    borderRadius: BorderRadius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Banner
  bannerContainer: {
    marginBottom: Spacing.lg,
  },
  bannerCard: {
    width: SCREEN_WIDTH - 32,
    height: 160,
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    overflow: 'hidden',
    ...Shadows.md,
  },
  bannerBadge: {
    fontSize: 11,
    color: Colors.primaryLight,
    fontWeight: '700',
    marginBottom: 6,
    backgroundColor: 'rgba(168,85,247,0.2)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: BorderRadius.full,
    alignSelf: 'flex-start',
  },
  bannerLabel: {
    fontSize: 22,
    fontWeight: '800',
    color: Colors.white,
    marginBottom: 4,
  },
  bannerSub: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginBottom: 14,
  },
  bannerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.white,
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: BorderRadius.full,
    alignSelf: 'flex-start',
  },
  bannerBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.primaryDark,
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
    marginTop: 12,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.border,
  },
  dotActive: {
    width: 20,
    backgroundColor: Colors.primaryLight,
  },

  // Section headers
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.white,
  },
  seeAll: {
    fontSize: 13,
    color: Colors.primaryLight,
    fontWeight: '600',
  },

  // Categories
  categoriesList: {
    paddingRight: Spacing.base,
    gap: Spacing.md,
    marginBottom: Spacing.lg,
  },
  categoryItem: {
    alignItems: 'center',
    gap: 8,
  },
  categoryIconWrap: {
    width: 58,
    height: 58,
    borderRadius: BorderRadius.lg,
    backgroundColor: Colors.bgCard,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryLabel: {
    fontSize: 11,
    color: Colors.textSecondary,
    fontWeight: '600',
  },

  // Flash Sale
  flashSale: {
    borderRadius: BorderRadius.lg,
    padding: Spacing.base,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.lg,
  },
  flashLabel: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.bgDark,
  },
  flashSub: {
    fontSize: 12,
    color: Colors.bgDark,
    fontWeight: '600',
    opacity: 0.75,
    marginTop: 2,
  },
  flashBtn: {
    backgroundColor: Colors.bgDark,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: BorderRadius.full,
  },
  flashBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.secondary,
  },

  // Products
  productsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.md,
  },
  productCard: {
    width: CARD_WIDTH,
    backgroundColor: Colors.bgCard,
    borderRadius: BorderRadius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadows.sm,
  },
  productImage: {
    height: 140,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  badgeWrap: {
    position: 'absolute',
    top: 8,
    left: 8,
    backgroundColor: Colors.secondary,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: BorderRadius.full,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: Colors.bgDark,
  },
  wishlistBtn: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 32,
    height: 32,
    borderRadius: BorderRadius.full,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  productInfo: {
    padding: Spacing.md,
    gap: 6,
  },
  productName: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.white,
    lineHeight: 18,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  ratingText: {
    fontSize: 11,
    color: Colors.textMuted,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  priceText: {
    fontSize: 14,
    fontWeight: '800',
    color: Colors.primaryLight,
  },
  addBtn: {
    width: 28,
    height: 28,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
