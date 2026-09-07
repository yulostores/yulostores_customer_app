/**
 * app/restaurant/[id].tsx — the restaurant storefront / menu screen.
 *
 * Everything on it comes from the backend (src/hooks/useRestaurantDetail):
 *   • header       ← GET /api/restaurants/:id
 *   • section list ← GET /api/restaurants/:id/menu/categories   (names + counts only)
 *   • dishes       ← GET /api/restaurants/:id/menu-items        (one page per expanded
 *                                                                section, on demand)
 *   • search       ← GET /api/restaurants/:id/menu/search
 *
 * The menu never downloads whole: a fresh screen shows the header and collapsed
 * sections instantly, then fills a section in a page at a time as it is expanded or
 * scrolled to. The ADD button posts to POST /api/cart/items and mirrors the fresh
 * server snapshot into CartContext (the tab-badge cache); a dish with customization
 * groups (optionGroupCount > 0) hands off to the full dish screen instead — the
 * same as tapping the row.
 */

import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  SectionList,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RemoteImage } from '../../src/components/RemoteImage';
import { Colors } from '../../src/constants/Colors';
import { BorderRadius, Spacing } from '../../src/constants/Theme';
import { useCart } from '../../src/context/CartContext';
import { confirmCartConflict } from '../../src/lib/cartConflict';
import { useVegMode } from '../../src/context/VegModeContext';
import {
  ORANGE_ACCENT,
  useAccentTheme,
  useThemedStyles,
  type AccentTheme,
} from '../../src/hooks/useAccentTheme';
import { useFavoriteToggle } from '../../src/hooks/useFavoriteToggle';
import {
  useRestaurantDetail,
  type MenuDietFilter,
  type MenuSection,
} from '../../src/hooks/useRestaurantDetail';
import { useRestaurantReviews } from '../../src/hooks/useRestaurantReviews';
import { ApiError } from '../../src/services/api';
import {
  addItemToCart,
  clearCart,
  toCartCachePayload,
  updateCartLine,
  type CartSnapshot,
} from '../../src/services/cart';
import { formatBadge } from '../../src/services/items';
import { fetchMenuSearch, type RestaurantReview } from '../../src/services/restaurants';
import { logger, reportError } from '../../src/lib/logger';
import type { MenuItem, Restaurant } from '../../src/types/restaurant';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const HERO_HEIGHT = 240;

const formatPrice = (n: number) => '₹' + Math.round(n).toLocaleString('en-IN');

/** Back out of the screen — falls back to the tabs when opened from a share link. */
function goBack() {
  if (router.canGoBack()) router.back();
  else router.navigate('/(tabs)');
}

/** Rider speed through city traffic, plus the kitchen's head start — matches Home. */
const AVG_SPEED_KMPH = 20;
const PREP_MINUTES = 15;

/**
 * Delivery estimate. Prefers the restaurant's own declared estimate, falls back to
 * one derived from the real distance, and returns null when neither is known so the
 * caller drops the line rather than printing a guess.
 */
function formatEta(restaurant: Restaurant): string | null {
  if (restaurant.deliveryMinutes && Number.isFinite(restaurant.deliveryMinutes)) {
    const m = Math.max(10, Math.round(restaurant.deliveryMinutes / 5) * 5);
    return `${m}–${m + 5} min`;
  }
  const km = restaurant.distanceKm;
  if (km == null || !Number.isFinite(km)) return null;
  const raw = PREP_MINUTES + (km / AVG_SPEED_KMPH) * 60;
  const m = Math.max(10, Math.round(raw / 5) * 5);
  return `${m}–${m + 5} min`;
}

function localityOf(restaurant: Restaurant): string | null {
  return (
    restaurant.address?.street ||
    restaurant.address?.city ||
    restaurant.address?.state ||
    null
  );
}

// ─── Small shared pieces ─────────────────────────────────────────────────

/** The standard veg / non-veg mark — green square+dot for veg, maroon otherwise. */
function FoodTypeDot({ foodType }: { foodType: MenuItem['foodType'] }) {
  const isVeg = foodType === 'veg';
  const color = isVeg ? Colors.foodVegGreen : Colors.foodNonVegRed;
  return (
    <View style={[styles.dietSquare, { borderColor: color }]}>
      <View style={[styles.dietDot, { backgroundColor: color }]} />
    </View>
  );
}

// ─── Add control (server cart, badge-cache mirror) ───────────────────────

function AddControl({
  item,
  restaurant,
}: {
  item: MenuItem;
  restaurant: Restaurant;
}) {
  const styles = useThemedStyles(makeStyles);
  const { accent } = useAccentTheme();
  const { cart, syncFromServer } = useCart();
  const customizable = (item.optionGroupCount ?? 0) > 0;

  // Display quantity comes from the mirrored badge cache (keyed by dish id).
  const qty =
    cart && cart.restaurantId === restaurant._id
      ? cart.lines.find((l) => l.itemId === item._id)?.qty ?? 0
      : 0;

  const [busy, setBusy] = useState(false);

  // The server appends a NEW line per POST and needs that line's id to change
  // its quantity (PATCH /api/cart/items/:id). We remember the line this control
  // last touched; a quantity we only know from the cache (dish added on the
  // detail screen, then back here) has no id, so its stepper defers to the cart.
  const lineIdRef = useRef<string | null>(null);

  const openCustomizer = () => router.push(`/item/${item._id}`);

  const mirror = (snap: CartSnapshot) => {
    syncFromServer(toCartCachePayload(snap));
    lineIdRef.current =
      [...snap.cart.lines].reverse().find((l) => l.menuItemId === item._id)?.id ?? null;
  };

  const handleError = (err: unknown, fallbackName?: string | null) => {
    if (err instanceof ApiError && err.status === 401) {
      Alert.alert('Sign in required', 'Please sign in again to add items to your cart.');
    } else if (err instanceof ApiError && err.code === 'CART_RESTAURANT_CONFLICT') {
      const name =
        (err.details as { currentRestaurantName?: string } | null)?.currentRestaurantName ??
        fallbackName ??
        null;
      confirmCartConflict(name, () => runAdd(true));
    } else if (err instanceof ApiError && err.status === 400) {
      // A required customization is missing — send them to choose it.
      openCustomizer();
    } else if (err instanceof ApiError && err.status >= 400 && err.status < 500) {
      logger.warn('restaurant', `Add to cart rejected — ${err.status} ${err.code}`, {
        status: err.status,
        code: err.code,
      });
      Alert.alert('Couldn’t add item', err.message || 'Please try again.');
    } else {
      reportError('restaurant', 'Add to cart failed', err, { itemId: item._id });
      Alert.alert('Something went wrong', 'Please try again.');
    }
  };

  const runAdd = async (freshCart: boolean) => {
    setBusy(true);
    try {
      if (freshCart) await clearCart();
      mirror(await addItemToCart({ menuItemId: item._id, qty: 1, selectedOptions: [] }));
    } catch (err) {
      handleError(err, cart?.restaurantName ?? null);
    } finally {
      setBusy(false);
    }
  };

  const onAdd = () => {
    if (busy) return;
    if (customizable) {
      openCustomizer();
      return;
    }
    // Fast pre-check against the cache so the switch prompt needs no round-trip
    // (the server enforces it too — 409 CART_RESTAURANT_CONFLICT, handled above).
    if (cart && cart.lines.length > 0 && cart.restaurantId !== restaurant._id) {
      confirmCartConflict(cart.restaurantName, () => runAdd(true));
      return;
    }
    runAdd(false);
  };

  const changeQty = async (next: number) => {
    if (busy) return;
    if (!lineIdRef.current || customizable) {
      // Multiple customizations, or a line this control didn't create — the cart
      // screen (or the dish screen, to add another) is where those are managed.
      if (customizable && next > qty) openCustomizer();
      else router.push('/cart');
      return;
    }
    setBusy(true);
    try {
      mirror(await updateCartLine(lineIdRef.current, next));
    } catch (err) {
      handleError(err);
    } finally {
      setBusy(false);
    }
  };

  if (qty === 0) {
    return (
      <Pressable
        style={styles.addBtn}
        onPress={onAdd}
        disabled={busy}
        accessibilityRole="button"
        accessibilityLabel={customizable ? `Customise and add ${item.name}` : `Add ${item.name}`}
      >
        {busy ? (
          <ActivityIndicator size="small" color={accent} />
        ) : (
          <>
            <Text style={styles.addBtnText}>ADD</Text>
            <Ionicons
              name={customizable ? 'options-outline' : 'add'}
              size={14}
              color={accent}
            />
          </>
        )}
      </Pressable>
    );
  }

  return (
    <View style={styles.stepper}>
      <Pressable
        style={styles.stepBtn}
        hitSlop={6}
        disabled={busy}
        onPress={() => changeQty(qty - 1)}
        accessibilityLabel={`Reduce ${item.name}`}
      >
        <Ionicons name="remove" size={16} color={accent} />
      </Pressable>
      {busy ? (
        <ActivityIndicator size="small" color={accent} style={{ minWidth: 22 }} />
      ) : (
        <Text style={styles.stepValue}>{qty}</Text>
      )}
      <Pressable
        style={styles.stepBtn}
        hitSlop={6}
        disabled={busy}
        onPress={() => changeQty(qty + 1)}
        accessibilityLabel={`Add another ${item.name}`}
      >
        <Ionicons name="add" size={16} color={accent} />
      </Pressable>
    </View>
  );
}

// ─── Menu item row ──────────────────────────────────────────────────────

function MenuItemRow({
  item,
  restaurant,
  onOpen,
}: {
  item: MenuItem;
  restaurant: Restaurant;
  onOpen: () => void;
}) {
  const styles = useThemedStyles(makeStyles);
  const discounted =
    item.discountedPrice != null && item.discountedPrice < item.sellingPrice;
  const saving = discounted ? item.sellingPrice - (item.discountedPrice ?? 0) : 0;
  const badges = (item.badges ?? []).slice(0, 2);

  return (
    <Pressable style={styles.row} onPress={onOpen}>
      <View style={styles.rowText}>
        <FoodTypeDot foodType={item.foodType} />

        {badges.length > 0 && (
          <View style={styles.badgeRow}>
            {badges.map((b) => (
              <Text
                key={b}
                style={[
                  styles.badge,
                  b.toLowerCase().includes('best') && styles.badgeStrong,
                ]}
              >
                {formatBadge(b)}
              </Text>
            ))}
          </View>
        )}

        <Text style={styles.rowName} numberOfLines={2}>
          {item.name}
        </Text>

        <View style={styles.priceRow}>
          <Text style={styles.price}>{formatPrice(item.effectivePrice)}</Text>
          {discounted && (
            <Text style={styles.priceStrike}>{formatPrice(item.sellingPrice)}</Text>
          )}
        </View>

        {!!item.description && (
          <Text style={styles.rowDesc} numberOfLines={2}>
            {item.description}
          </Text>
        )}
      </View>

      <View style={styles.rowMedia}>
        <RemoteImage
          uri={item.image}
          style={styles.rowImage}
          icon="fast-food-outline"
          iconSize={30}
        />
        {discounted && saving > 0 && (
          <View style={styles.saveRibbon}>
            <Text style={styles.saveRibbonText}>Save {formatPrice(saving)}</Text>
          </View>
        )}
        <View style={styles.addSlot}>
          <AddControl item={item} restaurant={restaurant} />
        </View>
      </View>
    </Pressable>
  );
}

// ─── Section header / footer ────────────────────────────────────────────

function SectionHeaderRow({
  section,
  onToggle,
}: {
  section: MenuSection;
  onToggle: () => void;
}) {
  const empty = section.itemCount === 0;
  return (
    <Pressable
      style={styles.sectionHeader}
      onPress={empty ? undefined : onToggle}
      disabled={empty}
    >
      <Text style={styles.sectionTitle}>{section.name}</Text>
      <View style={styles.sectionRight}>
        <Text style={styles.sectionCount}>
          {section.itemCount} {section.itemCount === 1 ? 'item' : 'items'}
        </Text>
        {!empty && (
          <Ionicons
            name={section.expanded ? 'chevron-up' : 'chevron-down'}
            size={18}
            color={Colors.foodTextSecondary}
          />
        )}
      </View>
    </Pressable>
  );
}

function SectionFooter({
  section,
  onRetry,
}: {
  section: MenuSection;
  onRetry: () => void;
}) {
  const styles = useThemedStyles(makeStyles);
  const { accent } = useAccentTheme();
  if (!section.expanded) return null;

  if (section.status === 'error') {
    return (
      <Pressable style={styles.sectionFooter} onPress={onRetry}>
        <Ionicons name="refresh" size={15} color={accent} />
        <Text style={styles.sectionFooterAction}>
          {section.error ? 'Couldn’t load more — Retry' : 'Retry'}
        </Text>
      </Pressable>
    );
  }

  if (section.status === 'loading') {
    // Covers the first page (nothing shown yet) and paging for more.
    return (
      <View style={styles.sectionFooter}>
        <ActivityIndicator size="small" color={accent} />
      </View>
    );
  }

  if (
    section.status === 'ready' &&
    section.items.length > 0 &&
    section.items.length < section.itemCount
  ) {
    return (
      <Text style={styles.sectionFooterHint}>
        Showing {section.items.length} of {section.itemCount}
      </Text>
    );
  }

  if (section.status === 'ready' && section.items.length === 0) {
    return <Text style={styles.sectionFooterHint}>Nothing here for this filter.</Text>;
  }

  return null;
}

// ─── Diet tabs ─────────────────────────────────────────────────────────

const DIET_TABS: { key: MenuDietFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'veg', label: 'Veg' },
  { key: 'non_veg', label: 'Non-veg' },
];

function DietTabs({
  value,
  locked,
  onChange,
}: {
  value: MenuDietFilter;
  locked: boolean;
  onChange: (next: MenuDietFilter) => void;
}) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.dietWrap}>
      <View style={styles.dietTabs}>
        {DIET_TABS.map((tab) => {
          const active = value === tab.key;
          const disabled = locked && tab.key !== 'veg';
          return (
            <Pressable
              key={tab.key}
              style={[
                styles.dietTab,
                active && styles.dietTabOn,
                disabled && styles.dietTabOff,
              ]}
              disabled={disabled}
              onPress={() => onChange(tab.key)}
            >
              <Text style={[styles.dietTabText, active && styles.dietTabTextOn]}>
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {locked && (
        <Text style={styles.dietLockHint}>
          Veg Mode is on — turn it off in Search to see every dish.
        </Text>
      )}
    </View>
  );
}

// ─── Header (hero + info card) ─────────────────────────────────────────

function Hero({
  restaurant,
  onShare,
  onSearch,
}: {
  restaurant: Restaurant;
  onShare: () => void;
  onSearch: () => void;
}) {
  const { favorited, toggle } = useFavoriteToggle(
    'restaurant',
    restaurant._id,
    restaurant.isFavorited,
  );

  return (
    <View style={styles.hero}>
      <RemoteImage
        uri={restaurant.coverImage || restaurant.logo}
        style={styles.heroImage}
        icon="restaurant-outline"
        iconSize={56}
      />
      <LinearGradient
        colors={['rgba(0,0,0,0.55)', 'rgba(0,0,0,0)', 'rgba(0,0,0,0.35)']}
        locations={[0, 0.45, 1]}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.heroBar}>
        <Pressable style={styles.heroBtn} onPress={goBack} hitSlop={8}>
          <Ionicons name="arrow-back" size={22} color={Colors.white} />
        </Pressable>
        <Pressable style={styles.heroSearch} onPress={onSearch}>
          <Ionicons name="search" size={18} color={Colors.foodTextSecondary} />
          <Text style={styles.heroSearchText} numberOfLines={1}>
            Search in menu
          </Text>
        </Pressable>
        <Pressable
          style={styles.heroBtn}
          onPress={toggle}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={
            favorited
              ? `Remove ${restaurant.name} from favorites`
              : `Add ${restaurant.name} to favorites`
          }
        >
          <Ionicons
            name={favorited ? 'heart' : 'heart-outline'}
            size={20}
            color={favorited ? Colors.foodHeartRed : Colors.white}
          />
        </Pressable>
        <Pressable style={styles.heroBtn} onPress={onShare} hitSlop={8}>
          <Ionicons name="share-social-outline" size={20} color={Colors.white} />
        </Pressable>
      </View>
    </View>
  );
}

function InfoCard({ restaurant }: { restaurant: Restaurant }) {
  const eta = formatEta(restaurant);
  const locality = localityOf(restaurant);
  const cuisines = restaurant.cuisineType.join(', ');
  const rated = restaurant.totalRatings > 0;

  return (
    <View style={styles.infoCard}>
      <View style={styles.logoWrap}>
        <RemoteImage
          uri={restaurant.logo || restaurant.coverImage}
          style={styles.logo}
          icon="restaurant"
          iconSize={26}
        />
      </View>

      <Text style={styles.name}>{restaurant.name}</Text>
      {!!restaurant.description && (
        <Text style={styles.tagline} numberOfLines={2}>
          {restaurant.description}
        </Text>
      )}

      <View style={styles.metaRow}>
        {rated ? (
          <View style={styles.ratingBadge}>
            <Ionicons name="star" size={11} color={Colors.white} />
            <Text style={styles.ratingText}>{restaurant.avgRating.toFixed(1)}</Text>
          </View>
        ) : (
          <Text style={styles.newText}>New</Text>
        )}
        {rated && (
          <Text style={styles.metaMuted}>
            {restaurant.totalRatings.toLocaleString('en-IN')} ratings
          </Text>
        )}
        {!!cuisines && <Text style={styles.metaDot}>·</Text>}
        {!!cuisines && (
          <Text style={styles.metaMuted} numberOfLines={1}>
            {cuisines}
          </Text>
        )}
      </View>

      {(eta || locality) && (
        <View style={styles.subMetaRow}>
          {!!eta && (
            <View style={styles.pill}>
              <Ionicons name="bicycle-outline" size={13} color={Colors.foodText} />
              <Text style={styles.pillText}>Delivery in {eta}</Text>
            </View>
          )}
          {!!locality && (
            <View style={styles.pill}>
              <Ionicons name="location-outline" size={13} color={Colors.foodText} />
              <Text style={styles.pillText} numberOfLines={1}>
                {locality}
              </Text>
            </View>
          )}
        </View>
      )}

      <View style={styles.flagRow}>
        {restaurant.isPureVeg && (
          <View style={[styles.flag, styles.flagVeg]}>
            <FoodTypeDot foodType="veg" />
            <Text style={styles.flagVegText}>Pure Veg</Text>
          </View>
        )}
        <View
          style={[styles.flag, restaurant.isOpen ? styles.flagOpen : styles.flagClosed]}
        >
          <View
            style={[
              styles.statusDot,
              { backgroundColor: restaurant.isOpen ? Colors.foodVegGreen : Colors.foodTextMuted },
            ]}
          />
          <Text
            style={[
              styles.flagStatusText,
              { color: restaurant.isOpen ? Colors.foodVegGreen : Colors.foodTextMuted },
            ]}
          >
            {restaurant.isOpen ? 'Open now' : 'Currently closed'}
          </Text>
        </View>
      </View>
    </View>
  );
}

// ─── Ratings & reviews ────────────────────────────────────────────────

function formatReviewDate(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function ReviewRow({ review }: { review: RestaurantReview }) {
  const styles = useThemedStyles(makeStyles);
  const initials = review.userName
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');

  return (
    <View style={styles.reviewRow}>
      <View style={styles.reviewHeaderRow}>
        {review.userAvatar ? (
          <RemoteImage uri={review.userAvatar} style={styles.reviewAvatar} icon="person" iconSize={14} />
        ) : (
          <View style={[styles.reviewAvatar, styles.reviewAvatarFallback]}>
            <Text style={styles.reviewAvatarText}>{initials || '?'}</Text>
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Text style={styles.reviewUserName} numberOfLines={1}>{review.userName}</Text>
          <View style={styles.reviewStarsRow}>
            {[1, 2, 3, 4, 5].map((n) => (
              <Ionicons
                key={n}
                name={n <= review.rating ? 'star' : 'star-outline'}
                size={11}
                color={Colors.foodRating}
              />
            ))}
            {review.createdAt ? (
              <Text style={styles.reviewDate}>· {formatReviewDate(review.createdAt)}</Text>
            ) : null}
          </View>
        </View>
      </View>
      {review.comment ? <Text style={styles.reviewComment}>{review.comment}</Text> : null}
    </View>
  );
}

function ReviewsSection({ restaurant }: { restaurant: Restaurant }) {
  const styles = useThemedStyles(makeStyles);
  const { accent } = useAccentTheme();
  const { reviews, loading, loadingMore, hasMore, loadMore } = useRestaurantReviews(restaurant._id);

  return (
    <View style={styles.reviewsSection}>
      <Text style={styles.reviewsSectionTitle}>Ratings & Reviews</Text>

      {restaurant.totalRatings === 0 ? (
        <Text style={styles.reviewsEmptyText}>No reviews yet — be the first to rate this restaurant.</Text>
      ) : loading ? (
        <ActivityIndicator size="small" color={accent} style={{ marginVertical: Spacing.md }} />
      ) : (
        <>
          {reviews.map((r) => (
            <ReviewRow key={r.id} review={r} />
          ))}
          {hasMore ? (
            <Pressable style={styles.reviewsLoadMore} onPress={loadMore} disabled={loadingMore}>
              {loadingMore ? (
                <ActivityIndicator size="small" color={accent} />
              ) : (
                <Text style={styles.reviewsLoadMoreText}>Load more reviews</Text>
              )}
            </Pressable>
          ) : null}
        </>
      )}
    </View>
  );
}

// ─── Skeleton / status ────────────────────────────────────────────────

function MenuSkeleton() {
  return (
    <View style={styles.flex}>
      <View style={[styles.heroImage, styles.skel]} />
      <View style={styles.skelInfo}>
        <View style={[styles.skel, { width: '55%', height: 22, borderRadius: 6 }]} />
        <View style={[styles.skel, { width: '80%', height: 13, borderRadius: 6, marginTop: 10 }]} />
        <View style={[styles.skel, { width: '40%', height: 13, borderRadius: 6, marginTop: 8 }]} />
      </View>
      {[0, 1, 2, 3].map((i) => (
        <View key={i} style={styles.skelHeader}>
          <View style={[styles.skel, { width: '45%', height: 16, borderRadius: 6 }]} />
        </View>
      ))}
    </View>
  );
}

function StatusScreen({
  icon,
  title,
  message,
  actionLabel,
  onAction,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.statusScreen}>
      <Ionicons name={icon} size={60} color={Colors.foodBorder} />
      <Text style={styles.statusTitle}>{title}</Text>
      <Text style={styles.statusMessage}>{message}</Text>
      {actionLabel && onAction && (
        <Pressable style={styles.statusBtn} onPress={onAction}>
          <Text style={styles.statusBtnText}>{actionLabel}</Text>
        </Pressable>
      )}
      <Pressable onPress={goBack} hitSlop={8}>
        <Text style={styles.statusBack}>Go back</Text>
      </Pressable>
    </View>
  );
}

// ─── In-menu search overlay ──────────────────────────────────────────

function SearchOverlay({
  restaurantId,
  restaurant,
  diet,
  topInset,
  onClose,
}: {
  restaurantId: string;
  restaurant: Restaurant;
  /** Diet filter the storefront is on — Veg Mode forces 'veg'; sent to the server. */
  diet: MenuDietFilter;
  topInset: number;
  onClose: () => void;
}) {
  const styles = useThemedStyles(makeStyles);
  const { accent } = useAccentTheme();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<MenuItem[]>([]);
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const reqRef = useRef(0);

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setResults([]);
      setStatus('idle');
      return;
    }
    const reqId = ++reqRef.current;
    setStatus('loading');
    const timer = setTimeout(async () => {
      try {
        const items = await fetchMenuSearch(restaurantId, q, diet);
        if (reqRef.current !== reqId) return;
        setResults(items);
        setStatus('done');
      } catch (err) {
        if (reqRef.current !== reqId) return;
        if (err instanceof ApiError && err.status >= 400 && err.status < 500) {
          logger.warn('restaurant', `Menu search failed — ${err.status} ${err.code}`, {
            restaurantId,
          });
        } else {
          reportError('restaurant', 'Menu search failed', err, { restaurantId });
        }
        setResults([]);
        setStatus('error');
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [query, restaurantId, diet]);

  return (
    <View style={[styles.overlay, { paddingTop: topInset }]}>
      <View style={styles.overlayHeader}>
        <Pressable onPress={onClose} hitSlop={8} style={styles.overlayBack}>
          <Ionicons name="arrow-back" size={22} color={Colors.foodText} />
        </Pressable>
        <View style={styles.overlaySearch}>
          <Ionicons name="search" size={18} color={accent} />
          <TextInput
            style={styles.overlayInput}
            placeholder={`Search ${restaurant.name}'s menu`}
            placeholderTextColor={Colors.foodTextMuted}
            value={query}
            onChangeText={setQuery}
            autoFocus
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
          />
          {query.length > 0 && (
            <Pressable onPress={() => setQuery('')} hitSlop={8}>
              <Ionicons name="close-circle" size={18} color={Colors.foodTextMuted} />
            </Pressable>
          )}
        </View>
      </View>

      {status === 'loading' && (
        <View style={styles.overlayCentre}>
          <ActivityIndicator color={accent} />
        </View>
      )}
      {status === 'error' && (
        <View style={styles.overlayCentre}>
          <Ionicons name="cloud-offline-outline" size={48} color={Colors.foodBorder} />
          <Text style={styles.overlayMsg}>Search didn&apos;t work. Try again.</Text>
        </View>
      )}
      {status === 'idle' && (
        <View style={styles.overlayCentre}>
          <Ionicons name="restaurant-outline" size={48} color={Colors.foodBorder} />
          <Text style={styles.overlayMsg}>Find a dish by name or ingredient.</Text>
        </View>
      )}
      {status === 'done' && results.length === 0 && (
        <View style={styles.overlayCentre}>
          <Ionicons name="search-outline" size={48} color={Colors.foodBorder} />
          <Text style={styles.overlayMsg}>
            Nothing on the menu matched “{query.trim()}”.
          </Text>
        </View>
      )}
      {status === 'done' && results.length > 0 && (
        <FlatList
          data={results}
          keyExtractor={(i) => i._id}
          contentContainerStyle={styles.overlayList}
          keyboardShouldPersistTaps="handled"
          ItemSeparatorComponent={() => <View style={styles.divider} />}
          renderItem={({ item }) => (
            <MenuItemRow
              item={item}
              restaurant={restaurant}
              onOpen={() => {
                onClose();
                router.push(`/item/${item._id}`);
              }}
            />
          )}
        />
      )}
    </View>
  );
}

// ─── Category jump sheet ────────────────────────────────────────────

function CategorySheet({
  visible,
  sections,
  onPick,
  onClose,
}: {
  visible: boolean;
  sections: MenuSection[];
  onPick: (id: string) => void;
  onClose: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.sheetBackdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>Menu</Text>
          <FlatList
            data={sections.filter((s) => s.itemCount > 0)}
            keyExtractor={(s) => s.id}
            style={styles.sheetList}
            renderItem={({ item }) => (
              <Pressable style={styles.sheetRow} onPress={() => onPick(item.id)}>
                <Text style={styles.sheetRowName}>{item.name}</Text>
                <Text style={styles.sheetRowCount}>{item.itemCount}</Text>
              </Pressable>
            )}
          />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ─── Cart footer ──────────────────────────────────────────────────

function CartFooterBar({ bottomInset }: { bottomInset: number }) {
  const styles = useThemedStyles(makeStyles);
  const { cart, itemCount, subtotal } = useCart();
  if (!cart || itemCount === 0) return null;
  return (
    <View style={[styles.cartBar, { paddingBottom: bottomInset + Spacing.sm }]}>
      <View>
        <Text style={styles.cartBarCount}>
          {itemCount} {itemCount === 1 ? 'item' : 'items'}
        </Text>
        <Text style={styles.cartBarTotal}>{formatPrice(subtotal)}</Text>
      </View>
      <Pressable style={styles.cartBarBtn} onPress={() => router.push('/cart')}>
        <Text style={styles.cartBarBtnText}>View Cart</Text>
        <Ionicons name="arrow-forward" size={16} color={Colors.white} />
      </Pressable>
    </View>
  );
}

// ─── Screen ─────────────────────────────────────────────────────────

export default function RestaurantDetailScreen() {
  const styles = useThemedStyles(makeStyles);
  const { accent } = useAccentTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { enabled: vegMode } = useVegMode();
  const { itemCount } = useCart();

  const [dietFilter, setDietFilter] = useState<MenuDietFilter>('all');
  useEffect(() => {
    if (vegMode) setDietFilter('veg');
  }, [vegMode]);
  const effectiveDiet: MenuDietFilter = vegMode ? 'veg' : dietFilter;

  const {
    restaurant,
    sections,
    isLoading,
    error,
    notFound,
    refresh,
    toggleSection,
    loadMore,
    retrySection,
  } = useRestaurantDetail(id, effectiveDiet);

  const [refreshing, setRefreshing] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const listRef = useRef<SectionList<MenuItem, { key: string; meta: MenuSection }>>(null);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }, [refresh]);

  const onShare = useCallback(async () => {
    if (!restaurant) return;
    try {
      await Share.share({
        message: `Check out ${restaurant.name} on Yulo Stores`,
      });
    } catch (err) {
      logger.warn('restaurant', 'Share sheet dismissed or failed', {
        reason: err instanceof Error ? err.message : String(err),
      });
    }
  }, [restaurant]);

  const listData = useMemo(
    () =>
      sections.map((s) => ({
        key: s.id,
        meta: s,
        data: s.expanded ? s.items : [],
      })),
    [sections],
  );

  const onEndReached = useCallback(() => {
    for (let i = sections.length - 1; i >= 0; i--) {
      const s = sections[i];
      if (
        s.expanded &&
        s.status === 'ready' &&
        s.page > 0 &&
        s.page < s.pages
      ) {
        loadMore(s.id);
        return;
      }
    }
  }, [sections, loadMore]);

  // A jump to a collapsed section can't scroll until that section's first page
  // has loaded — park the target and let the effect below fire the scroll once
  // its items (or an error) are in.
  const pendingJump = useRef<string | null>(null);

  const scrollToSection = useCallback(
    (index: number) => {
      try {
        listRef.current?.scrollToLocation({
          sectionIndex: index,
          itemIndex: 0,
          viewOffset: insets.top + 48,
          animated: true,
        });
      } catch {
        /* not measured yet — onScrollToIndexFailed / the effect will retry */
      }
    },
    [insets.top],
  );

  const jumpToSection = useCallback(
    (sectionId: string) => {
      setSheetOpen(false);
      const index = sections.findIndex((s) => s.id === sectionId);
      if (index < 0) return;
      const target = sections[index];
      if (target.expanded && target.status === 'ready') {
        setTimeout(() => scrollToSection(index), 60);
        return;
      }
      pendingJump.current = sectionId;
      if (!target.expanded) toggleSection(sectionId);
    },
    [sections, toggleSection, scrollToSection],
  );

  useEffect(() => {
    const targetId = pendingJump.current;
    if (!targetId) return;
    const index = sections.findIndex((s) => s.id === targetId);
    const target = sections[index];
    if (target?.expanded && (target.status === 'ready' || target.status === 'error')) {
      pendingJump.current = null;
      setTimeout(() => scrollToSection(index), 60);
    }
  }, [sections, scrollToSection]);

  // ── Body ──
  let body: ReactNode;
  if (isLoading) {
    body = <MenuSkeleton />;
  } else if (notFound) {
    body = (
      <StatusScreen
        icon="storefront-outline"
        title="Restaurant unavailable"
        message="This restaurant isn’t taking orders right now."
      />
    );
  } else if (error && !restaurant) {
    body = (
      <StatusScreen
        icon="cloud-offline-outline"
        title="Couldn’t load this restaurant"
        message={error}
        actionLabel="Try again"
        onAction={refresh}
      />
    );
  } else if (restaurant) {
    body = (
      <SectionList
        ref={listRef}
        sections={listData}
        keyExtractor={(item) => item._id}
        stickySectionHeadersEnabled
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        onEndReached={onEndReached}
        onEndReachedThreshold={0.5}
        initialNumToRender={6}
        maxToRenderPerBatch={8}
        windowSize={7}
        removeClippedSubviews
        onScrollToIndexFailed={() => {}}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={accent}
            colors={[accent]}
          />
        }
        ListHeaderComponent={
          <>
            <Hero
              restaurant={restaurant}
              onShare={onShare}
              onSearch={() => setSearchOpen(true)}
            />
            <InfoCard restaurant={restaurant} />
            <ReviewsSection restaurant={restaurant} />
            <DietTabs
              value={effectiveDiet}
              locked={vegMode}
              onChange={setDietFilter}
            />
          </>
        }
        ListEmptyComponent={
          <View style={styles.emptyMenu}>
            <Ionicons name="fast-food-outline" size={48} color={Colors.foodBorder} />
            <Text style={styles.emptyMenuText}>Menu coming soon</Text>
          </View>
        }
        renderSectionHeader={({ section }) => (
          <SectionHeaderRow
            section={section.meta}
            onToggle={() => toggleSection(section.meta.id)}
          />
        )}
        renderSectionFooter={({ section }) => (
          <SectionFooter
            section={section.meta}
            onRetry={() => retrySection(section.meta.id)}
          />
        )}
        ItemSeparatorComponent={() => <View style={styles.divider} />}
        renderItem={({ item }) => (
          <MenuItemRow
            item={item}
            restaurant={restaurant}
            onOpen={() => router.push(`/item/${item._id}`)}
          />
        )}
      />
    );
  }

  const showMenuFab = !isLoading && !notFound && !!restaurant && sections.length > 0;

  return (
    <View style={styles.screen}>
      <StatusBar style="dark" />

      {/* Solid status-bar strip so the hero and the sticky section headers both
          start below the notch. */}
      <View style={{ height: insets.top, backgroundColor: Colors.foodBg }} />

      {body}

      {showMenuFab && (
        <Pressable
          style={[
            styles.menuFab,
            { bottom: insets.bottom + (itemCount > 0 ? 92 : Spacing.lg) },
          ]}
          onPress={() => setSheetOpen(true)}
        >
          <Ionicons name="reorder-three" size={20} color={Colors.white} />
          <Text style={styles.menuFabText}>Menu</Text>
        </Pressable>
      )}

      <CartFooterBar bottomInset={insets.bottom} />

      <CategorySheet
        visible={sheetOpen}
        sections={sections}
        onPick={jumpToSection}
        onClose={() => setSheetOpen(false)}
      />

      {searchOpen && restaurant && id && (
        <SearchOverlay
          restaurantId={id}
          restaurant={restaurant}
          diet={effectiveDiet}
          topInset={insets.top}
          onClose={() => setSearchOpen(false)}
        />
      )}
    </View>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────

const makeStyles = (t: AccentTheme) =>
  StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.foodBg },
  flex: { flex: 1 },
  listContent: { paddingBottom: 140 },
  divider: { height: 1, backgroundColor: Colors.foodBorder, marginHorizontal: Spacing.base },

  // ── Hero ──
  hero: { width: SCREEN_WIDTH, height: HERO_HEIGHT, backgroundColor: Colors.foodBgSecondary },
  heroImage: { width: SCREEN_WIDTH, height: HERO_HEIGHT },
  heroBar: {
    position: 'absolute',
    top: Spacing.sm,
    left: Spacing.base,
    right: Spacing.base,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  heroBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroSearch: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 38,
    borderRadius: 19,
    paddingHorizontal: Spacing.md,
    backgroundColor: Colors.white,
  },
  heroSearchText: { flex: 1, fontSize: 13, color: Colors.foodTextSecondary },

  // ── Info card ──
  infoCard: {
    backgroundColor: Colors.foodCardBg,
    marginTop: -Spacing.lg,
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    paddingHorizontal: Spacing.base,
    paddingTop: 46,
    paddingBottom: Spacing.base,
    alignItems: 'center',
  },
  logoWrap: {
    position: 'absolute',
    alignSelf: 'center',
    top: -32,
    width: 72,
    height: 72,
    borderRadius: BorderRadius.lg,
    backgroundColor: Colors.foodCardBg,
    padding: 4,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
  },
  logo: { width: 64, height: 64, borderRadius: BorderRadius.md },
  name: { fontSize: 22, fontWeight: '800', color: Colors.foodText, textAlign: 'center' },
  tagline: {
    fontSize: 13,
    color: Colors.foodTextSecondary,
    textAlign: 'center',
    marginTop: 4,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 6,
    marginTop: Spacing.md,
  },
  ratingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: Colors.foodRatingBg,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
  },
  ratingText: { fontSize: 12, fontWeight: '800', color: Colors.white },
  newText: { fontSize: 12, fontWeight: '800', color: Colors.foodTextMuted },
  metaMuted: { fontSize: 12.5, color: Colors.foodTextSecondary, maxWidth: SCREEN_WIDTH * 0.5 },
  metaDot: { fontSize: 12, color: Colors.foodTextMuted },

  subMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: Colors.foodBgSecondary,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: BorderRadius.full,
    maxWidth: SCREEN_WIDTH * 0.6,
  },
  pillText: { fontSize: 12, fontWeight: '600', color: Colors.foodText },

  flagRow: { flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.md },
  flag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: BorderRadius.full,
  },
  flagVeg: { backgroundColor: Colors.foodPureVegBg },
  flagVegText: { fontSize: 11.5, fontWeight: '800', color: Colors.foodVegGreen },
  flagOpen: { backgroundColor: Colors.foodPureVegBg },
  flagClosed: { backgroundColor: Colors.foodBgSecondary },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  flagStatusText: { fontSize: 11.5, fontWeight: '800' },

  // ── Ratings & reviews ──
  reviewsSection: {
    backgroundColor: Colors.foodBg,
    paddingHorizontal: Spacing.base,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.sm,
  },
  reviewsSectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.foodText,
    marginBottom: Spacing.md,
  },
  reviewsEmptyText: { fontSize: 13, color: Colors.foodTextMuted },
  reviewRow: {
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.foodBorder,
  },
  reviewHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  reviewAvatar: { width: 32, height: 32, borderRadius: 16 },
  reviewAvatarFallback: { backgroundColor: t.accent, alignItems: 'center', justifyContent: 'center' },
  reviewAvatarText: { fontSize: 12, fontWeight: '800', color: Colors.white },
  reviewUserName: { fontSize: 13.5, fontWeight: '700', color: Colors.foodText },
  reviewStarsRow: { flexDirection: 'row', alignItems: 'center', gap: 2, marginTop: 2 },
  reviewDate: { fontSize: 11, color: Colors.foodTextMuted, marginLeft: 4 },
  reviewComment: { fontSize: 13, color: Colors.foodTextSecondary, lineHeight: 18, marginTop: 6 },
  reviewsLoadMore: { alignItems: 'center', paddingVertical: Spacing.md },
  reviewsLoadMoreText: { fontSize: 13, fontWeight: '700', color: t.accent },

  // ── Diet tabs ──
  dietWrap: {
    backgroundColor: Colors.foodBg,
    paddingHorizontal: Spacing.base,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.sm,
  },
  dietTabs: {
    flexDirection: 'row',
    backgroundColor: Colors.foodBgSecondary,
    borderRadius: BorderRadius.full,
    padding: 4,
    gap: 4,
  },
  dietTab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    borderRadius: BorderRadius.full,
  },
  dietTabOn: { backgroundColor: t.accent },
  dietTabOff: { opacity: 0.4 },
  dietTabText: { fontSize: 13, fontWeight: '700', color: Colors.foodTextSecondary },
  dietTabTextOn: { color: Colors.white },
  dietLockHint: { fontSize: 11, color: Colors.foodTextMuted, marginTop: 6 },

  // ── Section header / footer ──
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.foodBg,
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.foodBorder,
  },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: Colors.foodText, flexShrink: 1 },
  sectionRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  sectionCount: { fontSize: 12, fontWeight: '600', color: Colors.foodTextMuted },
  sectionFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: Spacing.md,
  },
  sectionFooterAction: { fontSize: 13, fontWeight: '700', color: t.accent },
  sectionFooterHint: {
    fontSize: 11.5,
    color: Colors.foodTextMuted,
    textAlign: 'center',
    paddingVertical: Spacing.md,
  },

  // ── Menu item row ──
  row: {
    flexDirection: 'row',
    gap: Spacing.md,
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.base,
  },
  rowText: { flex: 1, gap: 4 },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 2 },
  badge: {
    fontSize: 10,
    fontWeight: '800',
    color: Colors.foodTextSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  badgeStrong: { color: t.accentDark },
  rowName: { fontSize: 15, fontWeight: '700', color: Colors.foodText },
  priceRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  price: { fontSize: 14, fontWeight: '700', color: Colors.foodText },
  priceStrike: {
    fontSize: 12.5,
    color: Colors.foodTextMuted,
    textDecorationLine: 'line-through',
  },
  rowDesc: { fontSize: 12, color: Colors.foodTextMuted, lineHeight: 17, marginTop: 2 },

  rowMedia: { width: 116, alignItems: 'center' },
  rowImage: {
    width: 116,
    height: 116,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.foodBgSecondary,
  },
  saveRibbon: {
    position: 'absolute',
    top: 8,
    left: 8,
    backgroundColor: Colors.foodVegGreen,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
  },
  saveRibbonText: { fontSize: 9.5, fontWeight: '800', color: Colors.white },
  addSlot: { position: 'absolute', bottom: -14, alignSelf: 'center' },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.foodBorder,
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: BorderRadius.md,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.12,
    shadowRadius: 3,
  },
  addBtnText: { fontSize: 13, fontWeight: '800', color: t.accent, letterSpacing: 0.5 },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.foodBorder,
    borderRadius: BorderRadius.md,
    paddingHorizontal: 4,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.12,
    shadowRadius: 3,
  },
  stepBtn: { width: 30, height: 34, alignItems: 'center', justifyContent: 'center' },
  stepValue: {
    minWidth: 22,
    textAlign: 'center',
    fontSize: 14,
    fontWeight: '800',
    color: t.accent,
  },

  // ── Diet mark ──
  dietSquare: {
    width: 14,
    height: 14,
    borderRadius: 3,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dietDot: { width: 6, height: 6, borderRadius: 3 },

  // ── Skeleton ──
  skel: { backgroundColor: Colors.foodSearchBg },
  skelInfo: { padding: Spacing.base, paddingTop: Spacing.lg },
  skelHeader: {
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.base,
    borderBottomWidth: 1,
    borderBottomColor: Colors.foodBorder,
  },

  // ── Status screen ──
  statusScreen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: Spacing.xl,
  },
  statusTitle: { fontSize: 18, fontWeight: '800', color: Colors.foodText, marginTop: 8 },
  statusMessage: { fontSize: 14, color: Colors.foodTextMuted, textAlign: 'center' },
  statusBtn: {
    marginTop: Spacing.md,
    backgroundColor: t.accent,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.full,
  },
  statusBtnText: { fontSize: 14, fontWeight: '800', color: Colors.white },
  statusBack: { marginTop: Spacing.md, fontSize: 13, fontWeight: '700', color: Colors.foodTextSecondary },

  emptyMenu: { alignItems: 'center', gap: 8, paddingVertical: 60 },
  emptyMenuText: { fontSize: 15, fontWeight: '700', color: Colors.foodTextSecondary },

  // ── Search overlay ──
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: Colors.foodBg,
    zIndex: 20,
  },
  overlayHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.sm,
  },
  overlayBack: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  overlaySearch: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    height: 44,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: Colors.foodBorder,
    backgroundColor: Colors.foodCardBg,
    paddingHorizontal: Spacing.md,
  },
  overlayInput: { flex: 1, fontSize: 15, color: Colors.foodText, paddingVertical: 0 },
  overlayCentre: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: Spacing.xl },
  overlayMsg: { fontSize: 14, color: Colors.foodTextMuted, textAlign: 'center' },
  overlayList: { paddingBottom: 40 },

  // ── Category sheet ──
  sheetBackdrop: { flex: 1, backgroundColor: Colors.locScrim, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: Colors.foodCardBg,
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.xl,
    maxHeight: '70%',
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.foodBorder,
    marginBottom: Spacing.md,
  },
  sheetTitle: { fontSize: 17, fontWeight: '800', color: Colors.foodText, marginBottom: Spacing.sm },
  sheetList: { flexGrow: 0 },
  sheetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.foodBorder,
  },
  sheetRowName: { fontSize: 15, fontWeight: '600', color: Colors.foodText },
  sheetRowCount: { fontSize: 13, color: Colors.foodTextMuted },

  // ── Menu FAB ──
  menuFab: {
    position: 'absolute',
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.foodText,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: BorderRadius.full,
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    zIndex: 6,
  },
  menuFabText: { fontSize: 13, fontWeight: '800', color: Colors.white },

  // ── Cart bar ──
  cartBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: t.accent,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    zIndex: 10,
  },
  cartBarCount: { fontSize: 11, fontWeight: '700', color: 'rgba(255,255,255,0.85)' },
  cartBarTotal: { fontSize: 16, fontWeight: '800', color: Colors.white },
  cartBarBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  cartBarBtnText: { fontSize: 15, fontWeight: '800', color: Colors.white },
  });

const styles = makeStyles(ORANGE_ACCENT);
