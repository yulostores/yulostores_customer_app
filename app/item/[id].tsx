/**
 * app/item/[id].tsx — the dish customization screen.
 *
 * Everything on it comes from `GET /api/items/:id` (src/hooks/useItemDetail):
 * the hero image, the badge chips (`item.badges`), the category/restaurant
 * subtitle, the base price, and each customization block (`item.optionGroups`).
 * The running total mirrors the backend's own price maths
 * (src/lib/itemPricing) and the "Add to cart" button posts the real selection
 * to `POST /api/cart/items`, which re-validates and re-prices it server-side.
 */

import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../../src/constants/Colors';
import { BorderRadius, Spacing } from '../../src/constants/Theme';
import {
  seedSelections,
  selectSingle,
  setAddonQty,
  toSelectedOptions,
  toggleAddon,
  unitPrice,
  validateSelections,
  type Selections,
} from '../../src/lib/itemPricing';
import { logger, reportError } from '../../src/lib/logger';
import { ApiError } from '../../src/services/api';
import { addItemToCart, clearCart } from '../../src/services/cart';
import { formatBadge } from '../../src/services/items';
import { confirmCartConflict } from '../../src/lib/cartConflict';
import { useCart } from '../../src/context/CartContext';
import {
  ORANGE_ACCENT,
  useAccentTheme,
  useThemedStyles,
  type AccentTheme,
} from '../../src/hooks/useAccentTheme';
import { useFavoriteToggle } from '../../src/hooks/useFavoriteToggle';
import { useItemDetail } from '../../src/hooks/useItemDetail';
import type { ItemDetail, ItemOptionGroup } from '../../src/types/restaurant';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const HERO_HEIGHT = Math.round(SCREEN_WIDTH * 0.9);

const formatPrice = (n: number) => '₹' + Math.round(n).toLocaleString('en-IN');

// ─── Small shared pieces ─────────────────────────────────────────────────

/** The standard veg / non-veg mark — green square+dot for veg, maroon otherwise. */
function FoodTypeDot({ foodType }: { foodType: ItemDetail['foodType'] }) {
  const isVeg = foodType === 'veg';
  return (
    <View style={[styles.foodDotSquare, { borderColor: isVeg ? Colors.foodVegGreen : Colors.foodNonVegRed }]}>
      <View style={[styles.foodDot, { backgroundColor: isVeg ? Colors.foodVegGreen : Colors.foodNonVegRed }]} />
    </View>
  );
}

/** A remote image that falls back to a centred icon on a missing / dead URL. */
function HeroImage({ uri }: { uri?: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [uri]);

  if (!uri || failed) {
    return (
      <View style={[styles.hero, styles.heroFallback]}>
        <Ionicons name="fast-food-outline" size={64} color={Colors.foodTextMuted} />
      </View>
    );
  }
  return (
    <Image
      source={{ uri }}
      style={styles.hero}
      resizeMode="cover"
      onError={() => setFailed(true)}
    />
  );
}

/** −  n  + control, used for the order quantity and for multi-qty add-ons. */
function QtyStepper({
  value,
  min = 1,
  max = 99,
  onChange,
  compact = false,
}: {
  value: number;
  min?: number;
  max?: number;
  onChange: (next: number) => void;
  compact?: boolean;
}) {
  const styles = useThemedStyles(makeStyles);
  const { accent } = useAccentTheme();
  const canDec = value > min;
  const canInc = value < max;
  const size = compact ? 26 : 34;
  return (
    <View style={[styles.stepper, compact && styles.stepperCompact]}>
      <Pressable
        onPress={() => canDec && onChange(value - 1)}
        disabled={!canDec}
        hitSlop={6}
        style={[styles.stepBtn, { width: size, height: size }, !canDec && styles.stepBtnOff]}
      >
        <Ionicons name="remove" size={compact ? 14 : 18} color={canDec ? accent : Colors.foodTextMuted} />
      </Pressable>
      <Text style={[styles.stepValue, compact && styles.stepValueCompact]}>{value}</Text>
      <Pressable
        onPress={() => canInc && onChange(value + 1)}
        disabled={!canInc}
        hitSlop={6}
        style={[styles.stepBtn, { width: size, height: size }, !canInc && styles.stepBtnOff]}
      >
        <Ionicons name="add" size={compact ? 14 : 18} color={canInc ? accent : Colors.foodTextMuted} />
      </Pressable>
    </View>
  );
}

// ─── Option group ────────────────────────────────────────────────────────

function OptionGroupCard({
  group,
  selections,
  onChange,
}: {
  group: ItemOptionGroup;
  selections: Selections;
  onChange: (next: Selections) => void;
}) {
  const styles = useThemedStyles(makeStyles);
  const picked = selections[group._id] ?? {};
  const isSingle = group.type === 'single_choice';
  const required = group.required || group.minSelect > 0;

  const hint = isSingle
    ? null
    : group.maxSelect != null
      ? `Choose up to ${group.maxSelect}`
      : group.minSelect > 0
        ? `Choose at least ${group.minSelect}`
        : null;

  return (
    <View style={styles.groupCard}>
      <View style={styles.groupHeader}>
        <View style={styles.flexShrink}>
          <Text style={styles.groupTitle}>{group.title}</Text>
          {!!hint && <Text style={styles.groupHint}>{hint}</Text>}
        </View>
        <View style={[styles.reqPill, required ? styles.reqPillOn : styles.reqPillOff]}>
          <Text style={[styles.reqPillText, required ? styles.reqPillTextOn : styles.reqPillTextOff]}>
            {required ? 'Required' : 'Optional'}
          </Text>
        </View>
      </View>

      {group.options.map((option) => {
        const qty = picked[option._id] ?? 0;
        const selected = qty > 0;
        const showStepper = !isSingle && selected && option.maxQty > 1;

        const toggle = () => {
          if (isSingle) onChange(selectSingle(selections, group._id, option._id));
          else onChange(toggleAddon(selections, group._id, option._id));
        };

        return (
          <Pressable
            key={option._id}
            onPress={toggle}
            style={[styles.optionRow, selected && styles.optionRowOn]}
            accessibilityRole={isSingle ? 'radio' : 'checkbox'}
            accessibilityState={{ checked: selected }}
          >
            {isSingle ? (
              <View style={[styles.radio, selected && styles.radioOn]}>
                {selected && <View style={styles.radioDot} />}
              </View>
            ) : (
              <View style={[styles.checkbox, selected && styles.checkboxOn]}>
                {selected && <Ionicons name="checkmark" size={14} color={Colors.white} />}
              </View>
            )}

            <View style={styles.optionBody}>
              <Text style={styles.optionName}>{option.name}</Text>
              {!!option.description && (
                <Text style={styles.optionDesc}>{option.description}</Text>
              )}
            </View>

            {showStepper ? (
              <QtyStepper
                value={qty}
                min={1}
                max={option.maxQty}
                compact
                onChange={(next) => onChange(setAddonQty(selections, group._id, option._id, next))}
              />
            ) : option.priceDelta > 0 ? (
              <Text style={styles.optionDelta}>+ {formatPrice(option.priceDelta)}</Text>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

// ─── States around the content ──────────────────────────────────────────

function LoadingState() {
  const pulse = useRef(new Animated.Value(0.35)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.35, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  return (
    <View style={styles.flex}>
      <Animated.View style={[styles.hero, styles.skelBlock, { opacity: pulse }]} />
      <View style={styles.skelBody}>
        <Animated.View style={[styles.skelLine, { width: '55%', height: 26, opacity: pulse }]} />
        <Animated.View style={[styles.skelLine, { width: '38%', opacity: pulse }]} />
        <Animated.View style={[styles.skelLine, { width: '90%', marginTop: Spacing.md, opacity: pulse }]} />
        <Animated.View style={[styles.skelLine, { width: '80%', opacity: pulse }]} />
        <Animated.View style={[styles.skelCard, { opacity: pulse }]} />
        <Animated.View style={[styles.skelCard, { opacity: pulse }]} />
      </View>
    </View>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.centre}>
      <Ionicons name="fast-food-outline" size={64} color={Colors.foodBorder} />
      <Text style={styles.errTitle}>Can&apos;t show this dish</Text>
      <Text style={styles.errMsg}>{message}</Text>
      <Pressable style={styles.errBtn} onPress={onRetry}>
        <Text style={styles.errBtnText}>Try again</Text>
      </Pressable>
      <Pressable onPress={() => router.back()} hitSlop={8}>
        <Text style={styles.errBack}>Go back</Text>
      </Pressable>
    </View>
  );
}

// ─── Screen ─────────────────────────────────────────────────────────────

export default function ItemDetailScreen() {
  const styles = useThemedStyles(makeStyles);
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { item, isLoading, error, refresh } = useItemDetail(id);
  const localCart = useCart();

  // Default selection is derived from the item itself, so it's correct on the
  // very first render the item is present — no seeding flash. `overrides` holds
  // the customer's own taps and wins once they start choosing.
  const seededSelections = useMemo<Selections>(
    () => (item ? seedSelections(item.optionGroups) : {}),
    [item],
  );
  const [overrides, setOverrides] = useState<Selections | null>(null);
  const selections = overrides ?? seededSelections;

  const [qty, setQty] = useState(1);
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  // Favorite state / persistence is shared with every other heart in the app —
  // the hook re-seeds itself from `item.isFavorited` when a fresh dish lands.
  const { favorited: favorite, toggle: toggleFavorite } = useFavoriteToggle(
    'item',
    item?._id,
    item?.isFavorited,
  );

  // Reset everything that's specific to one dish when a fresh item lands
  // (first load, a retry after an error, or the route id changing).
  useEffect(() => {
    setOverrides(null);
    setQty(1);
    setAddError(null);
  }, [item]);

  const validationErrors = useMemo(
    () => (item ? validateSelections(item.optionGroups, selections) : []),
    [item, selections],
  );
  const unit = item ? unitPrice(item, selections) : 0;
  const total = unit * qty;

  const subtitle = item
    ? [item.category?.name, item.restaurant?.name].filter(Boolean).join('  •  ')
    : '';

  const runAdd = async (freshCart: boolean = false) => {
    if (!item || adding || validationErrors.length > 0) return;
    setAdding(true);
    setAddError(null);
    try {
      if (freshCart) await clearCart();
      await addItemToCart({
        menuItemId: item._id,
        qty,
        selectedOptions: toSelectedOptions(item.optionGroups, selections),
      });
      // Backend cart is the system of record; also mirror into the device-local
      // CartContext so the tab badge / cart screen reflect the add right away.
      // The local store keys lines by item id only, so it can't distinguish two
      // customizations of the same dish — that's fine for the badge; the real
      // cart reads GET /api/cart.
      localCart.addItem(
        { id: item.restaurantId, name: item.restaurant?.name ?? 'Restaurant' },
        { id: item._id, name: item.name, price: unit },
        qty,
      );
      router.replace('/cart');
    } catch (err) {
      if (err instanceof ApiError && err.code === 'CART_RESTAURANT_CONFLICT') {
        const name = (err.details as { currentRestaurantName?: string } | null)?.currentRestaurantName ?? null;
        confirmCartConflict(name, () => runAdd(true));
      } else if (err instanceof ApiError && err.status >= 400 && err.status < 500) {
        logger.warn('item', `Add to cart rejected — ${err.status} ${err.code}`, {
          status: err.status,
          code: err.code,
        });
        setAddError(
          err.status === 401
            ? 'Please sign in again to add items to your cart.'
            : err.message || 'Could not add this to your cart.',
        );
      } else {
        reportError('item', 'Add to cart failed', err, { id: item._id });
        setAddError('Something went wrong. Please try again.');
      }
    } finally {
      setAdding(false);
    }
  };

  const onAdd = () => runAdd(false);

  const headerBtnTop = insets.top + Spacing.sm;

  return (
    <View style={styles.screen}>
      <StatusBar style={item ? 'light' : 'dark'} />

      {/* Back control — present in every state (skeleton, error, loaded). */}
      <Pressable
        onPress={() => router.back()}
        style={[styles.circleBtn, { top: headerBtnTop, left: Spacing.base }]}
        hitSlop={8}
      >
        <Ionicons name="arrow-back" size={22} color={item ? Colors.white : Colors.foodText} />
      </Pressable>

      {isLoading ? (
        <LoadingState />
      ) : error || !item ? (
        <ErrorState message={error ?? 'This dish could not be found.'} onRetry={refresh} />
      ) : (
        <>
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 150 }}
          >
            <HeroImage uri={item.image} />

            <View style={styles.sheet}>
              {item.badges.length > 0 && (
                <View style={styles.badgeRow}>
                  {item.badges.map((b) => (
                    <View key={b} style={styles.badge}>
                      <View style={styles.badgeDot} />
                      <Text style={styles.badgeText}>{formatBadge(b)}</Text>
                    </View>
                  ))}
                </View>
              )}

              <View style={styles.titleRow}>
                <FoodTypeDot foodType={item.foodType} />
                <Text style={styles.name}>{item.name}</Text>
              </View>

              {!!subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}

              {!!item.description && (
                <Text style={styles.description}>{item.description}</Text>
              )}

              {item.prepTime != null && (
                <View style={styles.prepChip}>
                  <Ionicons name="time-outline" size={13} color={Colors.foodTextSecondary} />
                  <Text style={styles.prepText}>{item.prepTime} min to prepare</Text>
                </View>
              )}

              <View style={styles.priceCard}>
                <Text style={styles.priceLabel}>Base price</Text>
                <View style={styles.priceRight}>
                  {item.discountedPrice != null && item.discountedPrice < item.sellingPrice && (
                    <Text style={styles.priceStrike}>{formatPrice(item.sellingPrice)}</Text>
                  )}
                  <Text style={styles.priceValue}>{formatPrice(item.effectivePrice)}</Text>
                </View>
              </View>
            </View>

            {item.optionGroups.map((group) => (
              <OptionGroupCard
                key={group._id}
                group={group}
                selections={selections}
                onChange={setOverrides}
              />
            ))}

            {item.ingredients.length > 0 && (
              <View style={styles.groupCard}>
                <Text style={styles.groupTitle}>What&apos;s inside</Text>
                <Text style={styles.ingredients}>{item.ingredients.join(', ')}</Text>
              </View>
            )}
          </ScrollView>

          {/* Save / favorite — only meaningful once the dish is loaded. */}
          <Pressable
            onPress={toggleFavorite}
            style={[styles.savePill, { top: headerBtnTop, right: Spacing.base }]}
            hitSlop={8}
          >
            <Ionicons
              name={favorite ? 'heart' : 'heart-outline'}
              size={18}
              color={favorite ? Colors.foodHeartRed : Colors.foodText}
            />
            <Text style={styles.saveText}>{favorite ? 'Saved' : 'Save'}</Text>
          </Pressable>

          {/* Sticky action bar */}
          <View style={[styles.footer, { paddingBottom: insets.bottom + Spacing.md }]}>
            {validationErrors.length > 0 ? (
              <Text style={styles.footerHint}>{validationErrors[0]}</Text>
            ) : addError ? (
              <Text style={styles.footerError}>{addError}</Text>
            ) : null}

            <View style={styles.footerRow}>
              <QtyStepper value={qty} min={1} max={20} onChange={setQty} />

              <Pressable
                onPress={onAdd}
                disabled={adding || validationErrors.length > 0}
                style={[
                  styles.cta,
                  (adding || validationErrors.length > 0) && styles.ctaOff,
                ]}
              >
                {adding ? (
                  <ActivityIndicator color={Colors.white} />
                ) : (
                  <>
                    <Text style={styles.ctaText}>Add to cart</Text>
                    <Text style={styles.ctaPrice}>{formatPrice(total)}</Text>
                    <Ionicons name="arrow-forward" size={18} color={Colors.white} />
                  </>
                )}
              </Pressable>
            </View>
          </View>
        </>
      )}
    </View>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────

const makeStyles = (t: AccentTheme) =>
  StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.foodBg },
  flex: { flex: 1 },
  flexShrink: { flexShrink: 1 },

  // Hero
  hero: { width: SCREEN_WIDTH, height: HERO_HEIGHT, backgroundColor: Colors.foodBgSecondary },
  heroFallback: { alignItems: 'center', justifyContent: 'center' },

  // Floating controls
  circleBtn: {
    position: 'absolute',
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: t.accent,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 5,
  },
  savePill: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.white,
    paddingHorizontal: 14,
    height: 40,
    borderRadius: BorderRadius.full,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 5,
  },
  saveText: { fontSize: 13, fontWeight: '800', color: Colors.foodText },

  // Info sheet
  sheet: {
    backgroundColor: Colors.foodBg,
    marginTop: -22,
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    paddingHorizontal: Spacing.base,
    paddingTop: Spacing.lg,
  },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: Spacing.sm },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: t.accentLight,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: BorderRadius.full,
  },
  badgeDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: t.accent },
  badgeText: { fontSize: 11.5, fontWeight: '800', color: t.accentDark },

  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  name: { flexShrink: 1, fontSize: 25, fontWeight: '800', color: Colors.foodText },
  subtitle: { fontSize: 13.5, color: Colors.foodTextSecondary, marginTop: 6, fontWeight: '600' },
  description: {
    fontSize: 14,
    color: Colors.foodTextSecondary,
    lineHeight: 21,
    marginTop: Spacing.md,
  },
  prepChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'flex-start',
    marginTop: Spacing.md,
  },
  prepText: { fontSize: 12.5, color: Colors.foodTextSecondary, fontWeight: '600' },

  priceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.foodBgSecondary,
    borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.base,
    marginTop: Spacing.lg,
  },
  priceLabel: { fontSize: 14, color: Colors.foodTextSecondary, fontWeight: '600' },
  priceRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  priceStrike: {
    fontSize: 14,
    color: Colors.foodTextMuted,
    textDecorationLine: 'line-through',
    fontWeight: '600',
  },
  priceValue: { fontSize: 24, fontWeight: '800', color: Colors.foodText },

  // Option groups
  groupCard: {
    backgroundColor: Colors.foodCardBg,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.foodBorder,
    marginHorizontal: Spacing.base,
    marginTop: Spacing.base,
    padding: Spacing.base,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
  },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  groupTitle: { fontSize: 17, fontWeight: '800', color: Colors.foodText },
  groupHint: { fontSize: 12, color: Colors.foodTextMuted, marginTop: 3, fontWeight: '600' },
  reqPill: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: BorderRadius.full },
  reqPillOn: { backgroundColor: t.accentLight },
  reqPillOff: { backgroundColor: Colors.foodBgSecondary },
  reqPillText: { fontSize: 10.5, fontWeight: '800', letterSpacing: 0.3 },
  reqPillTextOn: { color: t.accentDark },
  reqPillTextOff: { color: Colors.foodTextMuted },

  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 11,
    paddingHorizontal: 10,
    borderRadius: BorderRadius.md,
    marginHorizontal: -4,
  },
  optionRowOn: { backgroundColor: t.accentLight },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: Colors.foodBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOn: { borderColor: t.accent },
  radioDot: { width: 11, height: 11, borderRadius: 6, backgroundColor: t.accent },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: Colors.foodBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxOn: { borderColor: t.accent, backgroundColor: t.accent },
  optionBody: { flex: 1 },
  optionName: { fontSize: 14.5, fontWeight: '700', color: Colors.foodText },
  optionDesc: { fontSize: 12.5, color: Colors.foodTextMuted, marginTop: 2, lineHeight: 17 },
  optionDelta: { fontSize: 13.5, fontWeight: '800', color: Colors.foodTextSecondary },

  ingredients: { fontSize: 13.5, color: Colors.foodTextSecondary, lineHeight: 20, marginTop: 4 },

  // Quantity stepper
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: Colors.foodBorder,
    borderRadius: BorderRadius.full,
    paddingHorizontal: 4,
  },
  stepperCompact: { borderColor: t.accent },
  stepBtn: { alignItems: 'center', justifyContent: 'center' },
  stepBtnOff: { opacity: 0.5 },
  stepValue: {
    minWidth: 26,
    textAlign: 'center',
    fontSize: 15,
    fontWeight: '800',
    color: Colors.foodText,
  },
  stepValueCompact: { minWidth: 20, fontSize: 13 },

  // Footer
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: Colors.foodSurface,
    borderTopWidth: 1,
    borderTopColor: Colors.foodBorder,
    paddingHorizontal: Spacing.base,
    paddingTop: Spacing.md,
  },
  footerHint: { fontSize: 12.5, color: t.accentDark, fontWeight: '700', marginBottom: Spacing.sm },
  footerError: { fontSize: 12.5, color: Colors.authDanger, fontWeight: '700', marginBottom: Spacing.sm },
  footerRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  cta: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 54,
    borderRadius: BorderRadius.full,
    backgroundColor: t.accent,
    shadowColor: t.accent,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 4,
  },
  ctaOff: { backgroundColor: Colors.foodBorder, shadowOpacity: 0, elevation: 0 },
  ctaText: { fontSize: 15.5, fontWeight: '800', color: Colors.white },
  ctaPrice: { fontSize: 15.5, fontWeight: '800', color: Colors.white, opacity: 0.95 },

  // Veg / non-veg mark
  foodDotSquare: {
    width: 16,
    height: 16,
    borderRadius: 3,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  foodDot: { width: 7, height: 7, borderRadius: 4 },

  // Loading / error
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, padding: Spacing.xl },
  errTitle: { fontSize: 18, fontWeight: '800', color: Colors.foodText, marginTop: 8 },
  errMsg: { fontSize: 14, color: Colors.foodTextMuted, textAlign: 'center' },
  errBtn: {
    marginTop: Spacing.md,
    backgroundColor: t.accent,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.full,
  },
  errBtnText: { fontSize: 14, fontWeight: '800', color: Colors.white },
  errBack: { marginTop: Spacing.md, fontSize: 13, fontWeight: '700', color: Colors.foodTextSecondary },

  skelBlock: { backgroundColor: Colors.foodSearchBg },
  skelBody: { paddingHorizontal: Spacing.base, paddingTop: Spacing.xl, gap: 10 },
  skelLine: { height: 14, borderRadius: 6, backgroundColor: Colors.foodSearchBg },
  skelCard: { height: 120, borderRadius: BorderRadius.lg, backgroundColor: Colors.foodSearchBg, marginTop: Spacing.md },
  });

const styles = makeStyles(ORANGE_ACCENT);
