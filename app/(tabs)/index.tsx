import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  FlatList,
  Image,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import CartBar from '../../src/components/CartBar';
import { RemoteImage } from '../../src/components/RemoteImage';
import { Colors } from '../../src/constants/Colors';
import { BorderRadius, Spacing } from '../../src/constants/Theme';
import { useCart } from '../../src/context/CartContext';
import { useDeliveryLocation } from '../../src/context/DeliveryLocationContext';
import { useVegMode, type VegScope } from '../../src/context/VegModeContext';
import {
  ORANGE_ACCENT,
  useAccentTheme,
  useThemedStyles,
  type AccentTheme,
} from '../../src/hooks/useAccentTheme';
import { useFavoriteToggle } from '../../src/hooks/useFavoriteToggle';
import { useHomeData } from '../../src/hooks/useHomeData';

import type {
  CuisineCard,
  HomeBanner,
  MenuItem,
  RecommendedItem,
  Restaurant,
} from '../../src/types/restaurant';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// ─── Helpers ───────────────────────────────────────────────────────────────

function formatPrice(price: number): string {
  return '₹' + price.toLocaleString('en-IN');
}

/** Rider speed through city traffic, plus the kitchen's head start. */
const AVG_SPEED_KMPH = 20;
const PREP_MINUTES = 15;

/**
 * Delivery estimate derived from the real distance to the restaurant.
 *
 * This used to be `Math.random()`, which re-rolled on every render — tapping the
 * heart on a card changed that card's ETA and distance. Returns null when we
 * don't know where the restaurant is, so the caller can drop the line rather
 * than print a made-up number.
 */
function formatDeliveryTime(distanceKm: number | undefined): string | null {
  if (distanceKm == null || !Number.isFinite(distanceKm)) return null;
  const raw = PREP_MINUTES + (distanceKm / AVG_SPEED_KMPH) * 60;
  const mins = Math.max(10, Math.round(raw / 5) * 5);
  return `${mins}-${mins + 5} min`;
}

function formatDistance(distanceKm: number | undefined): string | null {
  if (distanceKm == null || !Number.isFinite(distanceKm)) return null;
  return distanceKm < 1
    ? `${Math.round(distanceKm * 1000)} m`
    : `${distanceKm.toFixed(1)} km`;
}

// ─── Sub-components ────────────────────────────────────────────────────────

/** Delivery address header */
function LocationHeader() {
  const styles = useThemedStyles(makeStyles);
  const { activeLocation } = useDeliveryLocation();

  const label = activeLocation
    ? activeLocation.customLabel ||
      activeLocation.label[0].toUpperCase() + activeLocation.label.slice(1)
    : 'Set delivery location';
  const addressText = activeLocation?.line ?? 'Tap to choose where to deliver';

  return (
    <Pressable style={styles.locationHeader} onPress={() => router.push('/location')}>
      <Image
        source={require('../../assets/Images/Icons/Location.png')}
        style={styles.locationIcon}
        resizeMode="contain"
      />
      <View style={styles.locationTextWrap}>
        <View style={styles.locationRow}>
          <Text style={styles.locationLabel}>{label}</Text>
          <Ionicons name="chevron-down" size={16} color={Colors.foodText} />
        </View>
        <Text style={styles.locationAddress} numberOfLines={1}>
          {addressText}
        </Text>
      </View>
    </Pressable>
  );
}

/** Search bar */
function SearchBar() {
  return (
    <View style={styles.searchBar}>
      <Ionicons name="search-outline" size={20} color={Colors.foodTextMuted} />
      <Pressable
        style={{ flex: 1, height: '100%', justifyContent: 'center' }}
        onPress={() => router.push('/search')}
      >
        <TextInput
          style={styles.searchInput}
          placeholder="Search restaurants, cuisines..."
          placeholderTextColor={Colors.foodTextMuted}
          editable={false}
          pointerEvents="none"
        />
      </Pressable>
      <VegToggle />
    </View>
  );
}

/**
 * The "VEG Only" switch. `useVegMode` is app-wide state (useHomeData reads the
 * same context), so flipping this here is what actually filters/colors every
 * section below — this component just owns the switch's own visuals and the
 * scope sheet's open/closed state.
 *
 * Turning it ON opens the "See veg dishes from" sheet immediately, mirroring
 * the design: the switch and the sheet appear together. Turning it OFF needs no
 * prompt — there's nothing left to scope.
 */
function VegToggle() {
  const { enabled, scope, setEnabled, setScope } = useVegMode();
  const [sheetOpen, setSheetOpen] = useState(false);

  const handleToggle = () => {
    const next = !enabled;
    setEnabled(next);
    setSheetOpen(next);
  };

  return (
    <>
      <Pressable
        style={[styles.vegToggle, enabled && styles.vegToggleOn]}
        onPress={handleToggle}
        hitSlop={6}
        accessibilityRole="switch"
        accessibilityState={{ checked: enabled }}
        accessibilityLabel="Veg only"
      >
        <Text style={[styles.vegToggleLabel, enabled && styles.vegToggleLabelOn]}>
          VEG{enabled ? ' ONLY' : ''}
        </Text>
        <View style={[styles.vegToggleTrack, enabled && styles.vegToggleTrackOn]}>
          <View style={[styles.vegToggleThumb, enabled && styles.vegToggleThumbOn]} />
        </View>
      </Pressable>

      <VegScopeSheet
        visible={sheetOpen}
        scope={scope}
        onApply={(nextScope) => {
          setScope(nextScope);
          setSheetOpen(false);
        }}
        onClose={() => setSheetOpen(false)}
      />
    </>
  );
}

/** One radio row in the veg-scope sheet. */
function ScopeOption({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable style={styles.scopeRow} onPress={onPress}>
      <View style={[styles.radioOuter, selected && styles.radioOuterSelected]}>
        {selected && <View style={styles.radioInner} />}
      </View>
      <Text style={styles.scopeLabel}>{label}</Text>
    </Pressable>
  );
}

/**
 * "See veg dishes from" — the popup that appears the moment VEG Only switches
 * on, letting the customer choose whether restaurants that aren't 100%
 * vegetarian stay in the list (showing just their veg dishes) or drop out
 * entirely. Backs directly onto the server's own `vegModeScope` preference
 * (`all_restaurants` | `pure_veg_only`) — see src/services/preferences.ts.
 */
function VegScopeSheet({
  visible,
  scope,
  onApply,
  onClose,
}: {
  visible: boolean;
  scope: VegScope;
  onApply: (scope: VegScope) => void;
  onClose: () => void;
}) {
  const [selected, setSelected] = useState<VegScope>(scope);

  // Re-seed the radio from the committed scope every time the sheet opens, so
  // dismissing without Apply next time starts from what's actually active.
  useEffect(() => {
    if (visible) setSelected(scope);
  }, [visible, scope]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.sheetBackdrop} onPress={onClose}>
        <Pressable style={styles.sheetCard} onPress={(e) => e.stopPropagation()}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>See veg dishes from</Text>

          <ScopeOption
            label="All restaurants"
            selected={selected === 'all_restaurants'}
            onPress={() => setSelected('all_restaurants')}
          />
          <ScopeOption
            label="Pure veg restaurants only"
            selected={selected === 'pure_veg_only'}
            onPress={() => setSelected('pure_veg_only')}
          />

          <Pressable style={styles.sheetApplyBtn} onPress={() => onApply(selected)}>
            <Text style={styles.sheetApplyText}>Apply</Text>
          </Pressable>

          <Pressable onPress={onClose} hitSlop={8}>
            <Text style={styles.sheetMoreLink}>More settings</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/**
 * The standard veg/non-veg mark — a small square outline with a centred dot:
 * green for veg, maroon for anything that isn't. `egg` reads as "not
 * vegetarian" here same as `non_veg` — VEG Only already drops/substitutes true
 * non-veg rows server-side, so a card only ever shows this mark for what
 * remains.
 */
function FoodTypeDot({ foodType }: { foodType: MenuItem['foodType'] }) {
  const isVeg = foodType === 'veg';
  return (
    <View
      style={[
        styles.foodTypeSquare,
        isVeg ? styles.foodTypeSquareVeg : styles.foodTypeSquareNonVeg,
      ]}
    >
      <View
        style={[
          styles.foodTypeDot,
          isVeg ? styles.foodTypeDotVeg : styles.foodTypeDotNonVeg,
        ]}
      />
    </View>
  );
}

/**
 * Promotional banner — the live featured offer from the feed when one is
 * running, falling back to the bundled artwork when nothing is featured or the
 * offer has no image of its own.
 */
function PromoBanner({ banner }: { banner: HomeBanner | null }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [banner?.image]);

  const remote = banner?.image && !failed ? banner.image : null;

  return (
    <Pressable 
      style={styles.bannerWrap}
      onPress={() => {
        if (banner?.restaurantId) {
          router.push(`/restaurant/${banner.restaurantId}`);
        }
      }}
    >
      {remote ? (
        <Image
          source={{ uri: remote }}
          style={styles.bannerImage}
          resizeMode="cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <Image
          source={require('../../assets/Images/Banner.png')}
          style={styles.bannerImage}
          resizeMode="cover"
        />
      )}

      {banner && (
        <View style={styles.bannerOverlay}>
          <Text style={styles.bannerOffer} numberOfLines={1}>
            {banner.offerName}
          </Text>
          {!!banner.code && (
            <Text style={styles.bannerCode}>Use code {banner.code}</Text>
          )}
        </View>
      )}
    </Pressable>
  );
}

/** Section header with "See all" */
function SectionHeader({
  title,
  onSeeAll,
}: {
  title: string;
  onSeeAll?: () => void;
}) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {onSeeAll && (
        <Pressable onPress={onSeeAll}>
          <Text style={styles.seeAll}>See all →</Text>
        </Pressable>
      )}
    </View>
  );
}

/** "What's on your mind?" card — a curated quick-filter chip from the feed. */
function CuisineCardItem({ item }: { item: CuisineCard }) {
  return (
    <Pressable
      style={styles.cuisineCard}
      onPress={() => router.push({ pathname: '/search', params: { query: item.queryParam } })}
    >
      <View style={styles.cuisineImageWrap}>
        <RemoteImage
          uri={item.image}
          style={styles.cuisineImage}
          icon="restaurant-outline"
          iconSize={28}
        />
      </View>
      <Text style={styles.cuisineName} numberOfLines={1}>
        {item.name}
      </Text>
    </Pressable>
  );
}

/** "Recommended for you" item card */
function RecommendedItemCard({ item }: { item: RecommendedItem }) {
  const styles = useThemedStyles(makeStyles);
  const { menuItem, restaurant } = item;
  const eta = formatDeliveryTime(restaurant?.distanceKm);
  const { favorited, toggle } = useFavoriteToggle(
    'item',
    menuItem._id,
    menuItem.isFavorited,
  );

  return (
    <Pressable
      style={styles.recItemCard}
      onPress={() => router.push(`/item/${menuItem._id}`)}
      accessibilityRole="button"
      accessibilityLabel={`View ${menuItem.name}`}
    >
      {/* Food image */}
      <View style={styles.recItemImageWrap}>
        <RemoteImage
          uri={menuItem.image}
          style={styles.recItemImage}
          icon="fast-food-outline"
          iconSize={32}
        />
        <Pressable
          style={styles.cardHeartBtn}
          onPress={toggle}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={
            favorited
              ? `Remove ${menuItem.name} from favorites`
              : `Save ${menuItem.name}`
          }
        >
          <Ionicons
            name={favorited ? 'heart' : 'heart-outline'}
            size={15}
            color={favorited ? Colors.foodHeartRed : Colors.white}
          />
        </Pressable>
      </View>

      {/* Info */}
      <View style={styles.recItemInfo}>
        <View style={styles.recItemNameRow}>
          <FoodTypeDot foodType={menuItem.foodType} />
          <Text style={styles.recItemName} numberOfLines={1}>
            {menuItem.name}
          </Text>
        </View>
        {!!restaurant && (
          <Text style={styles.recItemRestaurant} numberOfLines={1}>
            {restaurant.name}
          </Text>
        )}
        {!!eta && (
          <View style={styles.recItemMeta}>
            <Ionicons
              name="bicycle-outline"
              size={12}
              color={Colors.foodTextMuted}
            />
            <Text style={styles.recItemDelivery}>Delivery • {eta}</Text>
          </View>
        )}
        <View style={styles.recItemBottom}>
          {/* A brand-new restaurant has avgRating 0 and no ratings at all —
              a "0.0" badge reads as a bad score rather than an absent one. */}
          {!!restaurant && restaurant.totalRatings > 0 ? (
            <View style={styles.ratingBadge}>
              <Ionicons name="star" size={10} color="#FFF" />
              <Text style={styles.ratingBadgeText}>
                {restaurant.avgRating.toFixed(1)}
              </Text>
            </View>
          ) : (
            <Text style={styles.newBadgeText}>New</Text>
          )}
          <Text style={styles.recItemPrice}>
            {formatPrice(menuItem.effectivePrice)}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

/** Horizontal restaurant card (for "Recommended restaurants") */
function RestaurantHCard({ restaurant }: { restaurant: Restaurant }) {
  const eta = formatDeliveryTime(restaurant.distanceKm);
  const { favorited, toggle } = useFavoriteToggle(
    'restaurant',
    restaurant._id,
    restaurant.isFavorited,
  );

  return (
    <Pressable
      style={styles.restHCard}
      onPress={() => router.push(`/restaurant/${restaurant._id}`)}
    >
      <View style={styles.restHImageWrap}>
        <RemoteImage
          uri={restaurant.coverImage || restaurant.logo}
          style={styles.restHImage}
          icon="restaurant-outline"
          iconSize={32}
        />
        <Pressable
          style={styles.cardHeartBtn}
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
            size={15}
            color={favorited ? Colors.foodHeartRed : Colors.white}
          />
        </Pressable>
      </View>
      <View style={styles.restHInfo}>
        <Text style={styles.restHName} numberOfLines={1}>
          {restaurant.name}
        </Text>
        {!!eta && (
          <View style={styles.restHMeta}>
            <Ionicons
              name="bicycle-outline"
              size={12}
              color={Colors.foodTextMuted}
            />
            <Text style={styles.restHDelivery}>Delivery • {eta}</Text>
          </View>
        )}
        <View style={styles.restHBottom}>
          {restaurant.totalRatings > 0 ? (
            <View style={styles.ratingBadge}>
              <Ionicons name="star" size={10} color="#FFF" />
              <Text style={styles.ratingBadgeText}>
                {restaurant.avgRating.toFixed(1)}
              </Text>
            </View>
          ) : (
            <Text style={styles.newBadgeText}>New</Text>
          )}
        </View>
      </View>
    </Pressable>
  );
}

/** Vertical restaurant card (for "Restaurants near you") */
function RestaurantNearbyCard({ restaurant }: { restaurant: Restaurant }) {
  const { favorited: liked, toggle: toggleFavorite } = useFavoriteToggle(
    'restaurant',
    restaurant._id,
    restaurant.isFavorited,
  );

  const eta = formatDeliveryTime(restaurant.distanceKm);
  const distance = formatDistance(restaurant.distanceKm);
  const cuisines = restaurant.cuisineType.join(' • ');

  // Only the facts we actually have, joined by dots — an unknown distance or a
  // restaurant with nothing priced yet drops out instead of showing a filler.
  const metaParts = [
    eta,
    distance,
    restaurant.startingPrice != null
      ? `Items from ${formatPrice(restaurant.startingPrice)}`
      : null,
  ].filter((part): part is string => !!part);

  return (
    <Pressable
      style={styles.nearbyCard}
      onPress={() => router.push(`/restaurant/${restaurant._id}`)}
    >
      {/* Cover image */}
      <View style={styles.nearbyCoverWrap}>
        <RemoteImage
          uri={restaurant.coverImage || restaurant.logo}
          style={styles.nearbyCover}
          icon="restaurant-outline"
          iconSize={48}
        />

        {/* Rating badge on cover */}
        {restaurant.totalRatings > 0 && (
          <View style={styles.nearbyRatingBadge}>
            <Ionicons name="star" size={11} color="#FFF" />
            <Text style={styles.nearbyRatingText}>
              {restaurant.avgRating.toFixed(1)}
            </Text>
          </View>
        )}

        {/* Pure-veg badge — every dish here is vegetarian, not just what VEG
            Only happens to be filtering to right now. */}
        {restaurant.isPureVeg && (
          <View style={styles.pureVegBadge}>
            <FoodTypeDot foodType="veg" />
            <Text style={styles.pureVegBadgeText}>Pure Veg</Text>
          </View>
        )}

        {/* Heart icon */}
        <Pressable
          style={styles.heartBtn}
          onPress={toggleFavorite}
        >
          <Ionicons
            name={liked ? 'heart' : 'heart-outline'}
            size={22}
            color={liked ? Colors.foodHeartRed : Colors.white}
          />
        </Pressable>
      </View>

      {/* Info section */}
      <View style={styles.nearbyInfo}>
        <Text style={styles.nearbyName}>{restaurant.name}</Text>
        {!!cuisines && (
          <Text style={styles.nearbyCuisine} numberOfLines={1}>
            {cuisines}
          </Text>
        )}
        {metaParts.length > 0 && (
          <View style={styles.nearbyMetaRow}>
            <Ionicons
              name="time-outline"
              size={14}
              color={Colors.foodTextMuted}
            />
            {metaParts.map((part, i) => (
              <React.Fragment key={part}>
                {i > 0 && <Text style={styles.nearbyDot}>·</Text>}
                <Text style={styles.nearbyMetaText}>{part}</Text>
              </React.Fragment>
            ))}
          </View>
        )}
        <View
          style={[
            styles.statusBadge,
            restaurant.isOpen ? styles.statusOpen : styles.statusClosed,
          ]}
        >
          <View
            style={[
              styles.vegDot,
              !restaurant.isOpen && styles.statusDotClosed,
            ]}
          />
          <Text
            style={[
              styles.statusText,
              restaurant.isOpen ? styles.statusTextOpen : styles.statusTextClosed,
            ]}
          >
            {restaurant.isOpen ? 'Open now' : 'Closed'}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

/** Loading skeleton placeholder */
function LoadingSkeleton() {
  const pulse = useRef(new Animated.Value(0.3)).current;

  React.useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0.3,
          duration: 800,
          useNativeDriver: true,
        }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [pulse]);

  const skeletonStyle = { opacity: pulse };

  return (
    <View style={styles.skeletonContainer}>
      {/* Banner skeleton */}
      <Animated.View style={[styles.skeletonBanner, skeletonStyle]} />

      {/* Section header skeleton */}
      <Animated.View style={[styles.skeletonSectionTitle, skeletonStyle]} />

      {/* Cuisine circles */}
      <View style={styles.skeletonCuisineRow}>
        {[1, 2, 3, 4, 5].map((i) => (
          <View key={i} style={styles.skeletonCuisineItem}>
            <Animated.View
              style={[styles.skeletonCuisineCircle, skeletonStyle]}
            />
            <Animated.View
              style={[styles.skeletonCuisineLabel, skeletonStyle]}
            />
          </View>
        ))}
      </View>

      {/* Section header skeleton */}
      <Animated.View style={[styles.skeletonSectionTitle, skeletonStyle]} />

      {/* Cards row */}
      <View style={styles.skeletonCardRow}>
        {[1, 2, 3].map((i) => (
          <Animated.View key={i} style={[styles.skeletonCard, skeletonStyle]} />
        ))}
      </View>
    </View>
  );
}

/**
 * The one placeholder for "there is nothing to show" — a failed load, no
 * delivery location yet, or a location nothing delivers to. Each case gets its
 * own wording and its own action; none of them may render a blank screen.
 */
function StatusView({
  icon,
  title,
  message,
  actionLabel,
  onAction,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  message: string;
  actionLabel: string;
  onAction: () => void;
}) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.errorContainer}>
      <Ionicons name={icon} size={64} color={Colors.foodBorder} />
      <Text style={styles.errorTitle}>{title}</Text>
      <Text style={styles.errorMessage}>{message}</Text>
      <Pressable style={styles.retryBtn} onPress={onAction}>
        <Text style={styles.retryBtnText}>{actionLabel}</Text>
      </Pressable>
    </View>
  );
}

// ─── Main Screen ───────────────────────────────────────────────────────────

export default function HomeScreen() {
  const styles = useThemedStyles(makeStyles);
  const t = useAccentTheme();
  const {
    cuisines,
    banner,
    recommendedItems,
    recommendedRestaurants,
    nearbyRestaurants,
    vegBannerText,
    isLoading,
    error,
    hasLocation,
    refresh,
  } = useHomeData();

  const { itemCount } = useCart();
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  };

  // Nothing in the feed came back. Distinguished from an error: the request
  // either was never made (no delivery location) or succeeded with an empty
  // result (nothing delivers here) — previously both rendered an empty page
  // below the banner with no explanation and nothing to tap.
  const isEmpty =
    nearbyRestaurants.length === 0 &&
    recommendedRestaurants.length === 0 &&
    recommendedItems.length === 0;

  const renderBody = () => {
    if (isLoading && !refreshing) return <LoadingSkeleton />;

    if (error && !refreshing) {
      return (
        <StatusView
          icon="cloud-offline-outline"
          title="Couldn't load restaurants"
          message={error}
          actionLabel="Try Again"
          onAction={refresh}
        />
      );
    }

    if (!hasLocation) {
      return (
        <StatusView
          icon="location-outline"
          title="Where should we deliver?"
          message="Set your delivery location to see restaurants and dishes around you."
          actionLabel="Set location"
          onAction={() => router.push('/location')}
        />
      );
    }

    if (isEmpty) {
      return (
        <StatusView
          icon="storefront-outline"
          title="No restaurants nearby"
          message="Nothing delivers to this address yet. Try a different delivery location."
          actionLabel="Change location"
          onAction={() => router.push('/location')}
        />
      );
    }

    return (
      <>
        {/* ── What's on your mind? ── */}
        {cuisines.length > 0 && (
          <>
            <SectionHeader title="What's on your mind?" onSeeAll={() => router.push('/cuisines')} />
            <FlatList
              data={cuisines}
              horizontal
              showsHorizontalScrollIndicator={false}
              keyExtractor={(item) => item.name}
              contentContainerStyle={styles.cuisineList}
              renderItem={({ item }) => <CuisineCardItem item={item} />}
            />
          </>
        )}

        {/* ── Recommended for you ── */}
        {recommendedItems.length > 0 && (
          <>
            <SectionHeader title="Recommended for you" />
            <FlatList
              data={recommendedItems}
              horizontal
              showsHorizontalScrollIndicator={false}
              keyExtractor={(item, idx) => `${item.menuItem._id}-${idx}`}
              contentContainerStyle={styles.recItemList}
              renderItem={({ item }) => <RecommendedItemCard item={item} />}
            />
          </>
        )}

        {/* ── Recommended restaurants ── */}
        {recommendedRestaurants.length > 0 && (
          <>
            <SectionHeader title="Recommended restaurants" />
            <FlatList
              data={recommendedRestaurants}
              horizontal
              showsHorizontalScrollIndicator={false}
              keyExtractor={(item) => item._id}
              contentContainerStyle={styles.restHList}
              renderItem={({ item }) => <RestaurantHCard restaurant={item} />}
            />
          </>
        )}

        {/* ── Restaurants near you ── */}
        {nearbyRestaurants.length > 0 && (
          <>
            <SectionHeader 
              title="Restaurants near you" 
              onSeeAll={() => router.push('/search')}
            />
            {nearbyRestaurants.map((r) => (
              <RestaurantNearbyCard key={r._id} restaurant={r} />
            ))}
          </>
        )}

        {/* Bottom spacer for tab bar */}
        <View style={{ height: 24 }} />
      </>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <View style={styles.bg}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[
            styles.scrollContent,
            itemCount > 0 && styles.scrollContentWithCart,
          ]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={t.accent}
              colors={[t.accent]}
            />
          }
        >
          {/* ── Header ── */}
          <LocationHeader />

          {/* ── Search bar ── */}
          <SearchBar />

          {/* ── Veg-mode confirmation strip ── */}
          {!!vegBannerText && (
            <View style={styles.vegBanner}>
              <Ionicons name="leaf" size={14} color={Colors.foodVegGreen} />
              <Text style={styles.vegBannerText}>{vegBannerText}</Text>
            </View>
          )}

          {/* ── Promo banner ── */}
          <PromoBanner banner={banner} />

          {/* ── Content sections ── */}
          {renderBody()}
        </ScrollView>

        {/* Floating sticky cart — sits above the tab bar, renders itself only
            once the cart has something in it. */}
        <View style={styles.cartDock} pointerEvents="box-none">
          <CartBar />
        </View>
      </View>
    </SafeAreaView>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────

const HORIZONTAL_CARD_WIDTH = SCREEN_WIDTH * 0.42;
const RESTAURANT_H_CARD_WIDTH = SCREEN_WIDTH * 0.42;

const makeStyles = (t: AccentTheme) =>
  StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.foodBg,
  },
  bg: {
    flex: 1,
    backgroundColor: Colors.foodBg,
  },
  scrollContent: {
    paddingBottom: 16,
  },
  // Extra room so the last card clears the floating CartBar when it's showing.
  scrollContentWithCart: {
    paddingBottom: 108,
  },
  cartDock: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 12,
  },

  // ── Location header ──
  locationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.base,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.md,
    gap: 10,
  },
  locationIcon: {
    width: 24,
    height: 24,
  },
  locationTextWrap: {
    flex: 1,
  },
  locationLabel: {
    fontSize: 12,
    color: t.accent,
    fontWeight: '600',
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  locationAddress: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.foodText,
    flex: 1,
  },

  // ── Search bar ──
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.foodSearchBg,
    borderRadius: BorderRadius.lg,
    marginHorizontal: Spacing.base,
    paddingHorizontal: Spacing.md,
    height: 48,
    marginBottom: Spacing.md,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    color: Colors.foodText,
  },
  voiceIcon: {
    width: 22,
    height: 22,
    tintColor: t.accent,
  },
  // ── VEG Only switch ──
  vegToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.foodBg,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: Colors.foodBorder,
  },
  vegToggleOn: {
    backgroundColor: Colors.foodPureVegBg,
    borderColor: Colors.foodVegGreen,
  },
  vegToggleLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: Colors.foodTextMuted,
    letterSpacing: 0.3,
  },
  vegToggleLabelOn: {
    color: Colors.foodVegGreen,
  },
  vegToggleTrack: {
    width: 28,
    height: 16,
    borderRadius: 8,
    backgroundColor: Colors.toggleTrackOff,
    padding: 2,
    justifyContent: 'center',
  },
  vegToggleTrackOn: {
    backgroundColor: Colors.foodVegGreen,
  },
  vegToggleThumb: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: Colors.toggleThumb,
    alignSelf: 'flex-start',
  },
  vegToggleThumbOn: {
    alignSelf: 'flex-end',
  },

  // ── Veg-scope sheet ("See veg dishes from") ──
  sheetBackdrop: {
    flex: 1,
    backgroundColor: Colors.locScrim,
    paddingTop: 170,
    paddingHorizontal: Spacing.base,
  },
  sheetCard: {
    backgroundColor: Colors.foodCardBg,
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.foodBorder,
    marginBottom: Spacing.md,
  },
  sheetTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: Colors.foodText,
    marginBottom: Spacing.sm,
  },
  scopeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
  },
  radioOuter: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: Colors.foodBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOuterSelected: {
    borderColor: Colors.foodVegGreen,
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.foodVegGreen,
  },
  scopeLabel: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: Colors.foodText,
  },
  sheetApplyBtn: {
    backgroundColor: Colors.foodVegGreen,
    borderRadius: BorderRadius.full,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: Spacing.md,
    marginBottom: Spacing.sm,
  },
  sheetApplyText: {
    fontSize: 15,
    fontWeight: '800',
    color: Colors.white,
  },
  sheetMoreLink: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.foodVegGreen,
    textAlign: 'center',
  },

  // ── Veg-mode confirmation strip ──
  vegBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.foodPureVegBg,
    marginHorizontal: Spacing.base,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 8,
    marginBottom: Spacing.md,
  },
  vegBannerText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '700',
    color: Colors.foodVegGreen,
  },

  // ── Veg / non-veg dish mark ──
  foodTypeSquare: {
    width: 12,
    height: 12,
    borderRadius: 2,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  foodTypeSquareVeg: {
    borderColor: Colors.foodVegGreen,
  },
  foodTypeSquareNonVeg: {
    borderColor: Colors.foodNonVegRed,
  },
  foodTypeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  foodTypeDotVeg: {
    backgroundColor: Colors.foodVegGreen,
  },
  foodTypeDotNonVeg: {
    backgroundColor: Colors.foodNonVegRed,
  },

  // ── Pure-veg restaurant badge ──
  pureVegBadge: {
    position: 'absolute',
    top: 12,
    left: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.95)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: BorderRadius.sm,
  },
  pureVegBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: Colors.foodVegGreen,
  },

  // ── Banner ──
  bannerWrap: {
    marginHorizontal: Spacing.base,
    borderRadius: BorderRadius.lg,
    overflow: 'hidden',
    marginBottom: Spacing.lg,
  },
  bannerImage: {
    width: '100%',
    height: 160,
    borderRadius: BorderRadius.lg,
  },
  bannerOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  bannerOffer: {
    fontSize: 15,
    fontWeight: '800',
    color: '#FFF',
  },
  bannerCode: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFF',
    opacity: 0.9,
    marginTop: 2,
  },

  // ── Section header ──
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.base,
    marginBottom: Spacing.md,
    marginTop: Spacing.sm,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.foodText,
  },
  seeAll: {
    fontSize: 13,
    color: t.accent,
    fontWeight: '600',
  },

  // ── Cuisine cards ──
  cuisineList: {
    paddingHorizontal: Spacing.base,
    gap: 16,
    paddingBottom: Spacing.md,
  },
  cuisineCard: {
    alignItems: 'center',
    width: 72,
  },
  cuisineImageWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    overflow: 'hidden',
    marginBottom: 6,
    backgroundColor: Colors.foodBgSecondary,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
  },
  cuisineImage: {
    width: 64,
    height: 64,
    borderRadius: 32,
  },
  cuisineName: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.foodText,
    textAlign: 'center',
  },

  // ── Recommended items ──
  recItemList: {
    paddingHorizontal: Spacing.base,
    gap: 12,
    paddingBottom: Spacing.md,
  },
  recItemCard: {
    width: HORIZONTAL_CARD_WIDTH,
    backgroundColor: Colors.foodCardBg,
    borderRadius: BorderRadius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.foodBorder,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
  },
  recItemImageWrap: {
    width: '100%',
    height: 120,
    backgroundColor: Colors.foodBgSecondary,
  },
  recItemImage: {
    width: '100%',
    height: 120,
  },
  recItemInfo: {
    padding: 10,
    gap: 4,
  },
  recItemNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  recItemName: {
    flexShrink: 1,
    fontSize: 13,
    fontWeight: '700',
    color: Colors.foodText,
  },
  recItemRestaurant: {
    fontSize: 11,
    color: Colors.foodTextSecondary,
  },
  recItemMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  recItemDelivery: {
    fontSize: 11,
    color: Colors.foodTextMuted,
  },
  recItemBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  recItemPrice: {
    fontSize: 12,
    fontWeight: '700',
    color: t.accent,
  },

  // ── Rating badge (shared) ──
  ratingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: Colors.foodRatingBg,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
  },
  ratingBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFF',
  },
  newBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.foodTextMuted,
  },

  // ── Recommended restaurants (horizontal) ──
  restHList: {
    paddingHorizontal: Spacing.base,
    gap: 12,
    paddingBottom: Spacing.md,
  },
  restHCard: {
    width: RESTAURANT_H_CARD_WIDTH,
    backgroundColor: Colors.foodCardBg,
    borderRadius: BorderRadius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.foodBorder,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
  },
  restHImageWrap: {
    width: '100%',
    height: 110,
    backgroundColor: Colors.foodBgSecondary,
  },
  restHImage: {
    width: '100%',
    height: 110,
  },
  restHInfo: {
    padding: 10,
    gap: 4,
  },
  restHName: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.foodText,
  },
  restHMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  restHDelivery: {
    fontSize: 11,
    color: Colors.foodTextMuted,
  },
  restHBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },

  // ── Restaurants near you (vertical) ──
  nearbyCard: {
    backgroundColor: Colors.foodCardBg,
    borderRadius: BorderRadius.xl,
    marginHorizontal: Spacing.base,
    marginBottom: Spacing.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.foodBorder,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
  },
  nearbyCoverWrap: {
    position: 'relative',
  },
  nearbyCover: {
    width: '100%',
    height: 180,
  },
  nearbyRatingBadge: {
    position: 'absolute',
    bottom: 12,
    right: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: Colors.foodRatingBg,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: BorderRadius.sm,
  },
  nearbyRatingText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FFF',
  },
  heartBtn: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Compact heart for the small scroller cards (recommended items / restaurants).
  cardHeartBtn: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  nearbyInfo: {
    padding: Spacing.md,
    gap: 4,
  },
  nearbyName: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.foodText,
  },
  nearbyCuisine: {
    fontSize: 13,
    color: Colors.foodTextSecondary,
  },
  nearbyMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  nearbyMetaText: {
    fontSize: 12,
    color: Colors.foodTextMuted,
  },
  nearbyDot: {
    fontSize: 12,
    color: Colors.foodTextMuted,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
    marginTop: 4,
  },
  statusOpen: {
    backgroundColor: Colors.foodPureVegBg,
  },
  statusClosed: {
    backgroundColor: Colors.foodBgSecondary,
  },
  vegDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.foodVegGreen,
  },
  statusDotClosed: {
    backgroundColor: Colors.foodTextMuted,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '700',
  },
  statusTextOpen: {
    color: Colors.foodVegGreen,
  },
  statusTextClosed: {
    color: Colors.foodTextMuted,
  },

  // ── Loading skeleton ──
  skeletonContainer: {
    paddingHorizontal: Spacing.base,
    paddingTop: Spacing.md,
  },
  skeletonBanner: {
    height: 160,
    borderRadius: BorderRadius.lg,
    backgroundColor: Colors.foodSearchBg,
    marginBottom: Spacing.lg,
  },
  skeletonSectionTitle: {
    height: 20,
    width: 180,
    borderRadius: 6,
    backgroundColor: Colors.foodSearchBg,
    marginBottom: Spacing.md,
  },
  skeletonCuisineRow: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: Spacing.lg,
  },
  skeletonCuisineItem: {
    alignItems: 'center',
    gap: 6,
  },
  skeletonCuisineCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: Colors.foodSearchBg,
  },
  skeletonCuisineLabel: {
    width: 48,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.foodSearchBg,
  },
  skeletonCardRow: {
    flexDirection: 'row',
    gap: 12,
  },
  skeletonCard: {
    width: HORIZONTAL_CARD_WIDTH,
    height: 170,
    borderRadius: BorderRadius.lg,
    backgroundColor: Colors.foodSearchBg,
  },

  // ── Error view ──
  errorContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    gap: 8,
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.foodText,
    marginTop: 8,
  },
  errorMessage: {
    fontSize: 14,
    color: Colors.foodTextMuted,
    textAlign: 'center',
    paddingHorizontal: 32,
  },
  retryBtn: {
    backgroundColor: t.accent,
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: BorderRadius.full,
    marginTop: 12,
  },
  retryBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFF',
  },
  });

const styles = makeStyles(ORANGE_ACCENT);
