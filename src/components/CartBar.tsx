import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Animated, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Colors } from '../constants/Colors';
import { BorderRadius } from '../constants/Theme';
import { useCart } from '../context/CartContext';
import { useAccentTheme } from '../hooks/useAccentTheme';

/**
 * Floating "sticky cart" pill for the Home screen — a port of the Figma
 * "Floating Sticky Cart Preview Card".
 *
 * Renders nothing until the cart holds at least one item, then slides up from
 * the bottom edge: the customer may not be looking at the bottom of the screen
 * when a dish is added, so it arrives with motion that reads as "your cart is
 * down here" rather than as a layout jump.
 *
 * Self-contained — it reads the cart from context and paints its accent from
 * the app-wide veg theme (orange normally, green while "Pure veg restaurants
 * only" is on, same as the tab bar and every CTA), so the screen only has to
 * drop `<CartBar />` above the tab bar.
 *
 * `View cart` and `View menu` are logged TODOs for now: neither the cart screen
 * nor a restaurant menu route exists yet.
 */

const BAR_HEIGHT = 80;

export default function CartBar() {
  const { cart, itemCount, clear } = useCart();
  const accent = useAccentTheme().accent;

  const anim = useRef(new Animated.Value(0)).current;
  const hasCart = !!cart && itemCount > 0;

  const [dismissed, setDismissed] = useState(false);
  const prevCount = useRef(itemCount);

  useEffect(() => {
    if (itemCount !== prevCount.current) {
      setDismissed(false);
      prevCount.current = itemCount;
    }
  }, [itemCount]);

  useEffect(() => {
    if (!hasCart || dismissed) return;
    Animated.spring(anim, {
      toValue: 1,
      useNativeDriver: true,
      damping: 18,
      stiffness: 240,
      mass: 0.7,
    }).start();
  }, [hasCart, anim, dismissed]);

  if (!hasCart || !cart || dismissed) return null;

  const handleDismiss = () => {
    Animated.timing(anim, {
      toValue: 0,
      duration: 160,
      useNativeDriver: true,
    }).start(() => setDismissed(true));
  };

  const handleViewCart = () => router.push('/cart');

  const handleViewMenu = () => router.push(`/restaurant/${cart.restaurantId}`);

  const translateY = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [BAR_HEIGHT + 40, 0],
  });

  return (
    <Animated.View
      style={[styles.shadow, { opacity: anim, transform: [{ translateY }] }]}
    >
      <View style={styles.pill}>
        {/* Left — restaurant, tap through to its menu. Equal-flex slots on
            either side of the fixed-width button are what centre it. */}
        <View style={styles.sideSlot}>
          <Pressable
            style={styles.menuLink}
            onPress={handleViewMenu}
            accessibilityRole="button"
            accessibilityLabel={`View menu for ${cart.restaurantName}`}
          >
            {cart.restaurantImage ? (
              <Image
                source={{ uri: cart.restaurantImage }}
                style={styles.avatar}
                resizeMode="cover"
              />
            ) : (
              <View style={[styles.avatar, styles.avatarFallback]}>
                <Ionicons name="restaurant" size={18} color={Colors.foodTextMuted} />
              </View>
            )}

            <View style={styles.menuText}>
              <Text style={styles.restaurantName} numberOfLines={1}>
                {cart.restaurantName}
              </Text>
              <View style={styles.viewMenuRow}>
                <Text style={[styles.viewMenu, { color: accent }]}>View menu</Text>
                <Ionicons name="chevron-forward" size={12} color={accent} />
              </View>
            </View>
          </Pressable>
        </View>

        {/* Centre — the CTA. */}
        <Pressable
          style={[styles.cta, { backgroundColor: accent }]}
          onPress={handleViewCart}
          accessibilityRole="button"
          accessibilityLabel={`View cart, ${itemCount} ${itemCount === 1 ? 'item' : 'items'}`}
        >
          <Text style={styles.ctaTitle}>View cart</Text>
          <Text style={styles.ctaCount}>
            {itemCount} {itemCount === 1 ? 'item' : 'items'}
          </Text>
        </Pressable>

        {/* Right — empty the cart. */}
        <View style={[styles.sideSlot, styles.sideSlotEnd]}>
          <Pressable
            style={styles.closeBtn}
            onPress={handleDismiss}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={`Empty your cart from ${cart.restaurantName}`}
          >
            <Ionicons name="close" size={16} color={Colors.foodText} />
          </Pressable>
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  // The shadow lives on the outer view; the rounded clip lives on the inner
  // one — a view can't both cast a shadow and clip its children to bounds.
  shadow: {
    marginHorizontal: 16,
    borderRadius: BAR_HEIGHT / 2,
    backgroundColor: Colors.foodCardBg,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
  },
  pill: {
    height: BAR_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: BAR_HEIGHT / 2,
    borderWidth: 1,
    borderColor: Colors.foodBorder,
    backgroundColor: Colors.foodCardBg,
    paddingHorizontal: 12,
    overflow: 'hidden',
  },
  sideSlot: {
    flex: 1,
    minWidth: 0,
  },
  sideSlotEnd: {
    alignItems: 'flex-end',
  },
  menuLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: Colors.foodBgSecondary,
  },
  avatarFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuText: {
    flex: 1,
    minWidth: 0,
  },
  restaurantName: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '700',
    color: Colors.foodText,
  },
  viewMenuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  viewMenu: {
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '600',
  },
  cta: {
    minHeight: 48,
    borderRadius: BorderRadius.full,
    paddingHorizontal: 20,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaTitle: {
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '700',
    color: Colors.white,
    textAlign: 'center',
  },
  ctaCount: {
    fontSize: 9,
    lineHeight: 14,
    fontWeight: '600',
    color: Colors.white,
    opacity: 0.9,
    textAlign: 'center',
  },
  closeBtn: {
    marginLeft: 4,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
