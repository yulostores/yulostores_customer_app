import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
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
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import CartBar from '../../src/components/CartBar';
import { useTabBarInset } from '../../src/components/TabBar';
import { FoodTypeMark } from '../../src/components/FoodTypeMark';
import { RemoteImage } from '../../src/components/RemoteImage';
import { Colors } from '../../src/constants/Colors';
import { BorderRadius, Elevation, Spacing } from '../../src/constants/Theme';
import { useAuth } from '../../src/context/AuthContext';
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

/**
 * The home app bar: where we're delivering, who's signed in, which storefront
 * you're shopping, and the search field — all on one warm wash that runs from
 * the status bar down into the page canvas.
 */
function HomeHeader() {
  const styles = useThemedStyles(makeStyles);
  const t = useAccentTheme();

  return (
    <LinearGradient
      colors={t.accentWash}
      locations={[0, 0.55, 1]}
      start={{ x: 0.15, y: 0 }}
      end={{ x: 0.85, y: 1 }}
      style={styles.topBar}
    >
      <LocationHeader />
      <StorefrontTabs />
      <SearchRow />
    </LinearGradient>
  );
}

/** Delivery address, and the shortcut to the account. */
function LocationHeader() {
  const styles = useThemedStyles(makeStyles);
  const { activeLocation } = useDeliveryLocation();

  const addressText = activeLocation?.line ?? 'Tap to choose where to deliver';

  return (
    <View style={styles.locationBar}>
      <Pressable
        style={styles.locationHeader}
        onPress={() => router.push('/location')}
        accessibilityRole="button"
        accessibilityLabel={`Delivering to ${addressText}. Change delivery location`}
      >
        <Image
          source={require('../../assets/Images/Icons/Location.png')}
          style={styles.locationIcon}
          resizeMode="contain"
        />
        <View style={styles.locationTextWrap}>
          <Text style={styles.locationLabel}>Delivering to</Text>
          <View style={styles.locationRow}>
            <Text style={styles.locationAddress} numberOfLines={1}>
              {addressText}
            </Text>
            <Ionicons name="chevron-down" size={15} color={Colors.foodTextSecondary} />
          </View>
        </View>
      </Pressable>

      <Pressable
        style={styles.profileBtn}
        onPress={() => router.navigate('/(tabs)/profile')}
        hitSlop={6}
        accessibilityRole="button"
        accessibilityLabel="Your account"
      >
        <Ionicons name="person-outline" size={20} color={Colors.foodText} />
      </Pressable>
    </View>
  );
}

/**
 * The storefronts Yulo sells through. Food is the only one live today — the
 * other two are on the roadmap, so they render as designed and answer a tap
 * with a hint rather than a dead press or a route that doesn't exist.
 */
const STOREFRONTS: readonly {
  key: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  tint: string;
  live: boolean;
}[] = [
  { key: 'food', label: 'Food', icon: 'restaurant', tint: Colors.white, live: true },
  {
    key: 'gifts',
    label: 'Gifts & Toys',
    icon: 'gift',
    tint: Colors.foodVerticalGift,
    live: false,
  },
  {
    key: 'bags',
    label: 'Bags',
    icon: 'bag-handle',
    tint: Colors.foodVerticalBag,
    live: false,
  },
];

/** Food / Gifts & Toys / Bags — the live one fills with the accent. */
function StorefrontTabs() {
  const styles = useThemedStyles(makeStyles);
  const t = useAccentTheme();
  const [hint, setHint] = useState<string | null>(null);

  // The hint behaves like a toast: it clears itself rather than waiting for a
  // dismiss control the design has nowhere to put.
  useEffect(() => {
    if (!hint) return;
    const timer = setTimeout(() => setHint(null), 2600);
    return () => clearTimeout(timer);
  }, [hint]);

  return (
    <>
      <View style={styles.storefrontRow}>
        {STOREFRONTS.map((store) => (
          <Pressable
            key={store.key}
            style={[styles.storefrontCard, !store.live && styles.storefrontCardIdle]}
            onPress={() => {
              if (!store.live) setHint(`${store.label} is coming soon`);
            }}
            accessibilityRole="button"
            accessibilityState={{ selected: store.live }}
            accessibilityLabel={
              store.live ? `${store.label}, selected` : `${store.label}, coming soon`
            }
          >
            {store.live && (
              <LinearGradient
                colors={[t.accent, t.accentDark]}
                locations={[0.15, 1]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.storefrontFill}
              />
            )}
            <Ionicons name={store.icon} size={22} color={store.tint} />
            <Text
              style={[styles.storefrontLabel, store.live && styles.storefrontLabelActive]}
              numberOfLines={1}
            >
              {store.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {!!hint && (
        <View style={styles.storefrontHint}>
          <Ionicons name="time-outline" size={13} color={Colors.foodTextSecondary} />
          <Text style={styles.storefrontHintText}>{hint}</Text>
        </View>
      )}
    </>
  );
}

/** Search pill, with the VEG Only switch parked alongside it. */
function SearchRow() {
  const styles = useThemedStyles(makeStyles);
  const t = useAccentTheme();

  return (
    <View style={styles.searchRow}>
      {/* One target for the whole pill, mic included: voice capture isn't wired
          up yet, so the mic opens the search screen like the rest of the bar
          rather than pretending to listen. */}
      <Pressable
        style={styles.searchBar}
        onPress={() => router.push('/search')}
        accessibilityRole="search"
        accessibilityLabel="Search restaurants and cuisines"
      >
        <Ionicons name="search" size={20} color={t.accent} />
        <Text style={styles.searchPlaceholder} numberOfLines={1}>
          Search restaurants, cuisines...
        </Text>
        <Image
          source={require('../../assets/Images/Icons/Button - Voice search.png')}
          style={styles.voiceIcon}
          resizeMode="contain"
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
          VEG
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
 * "Browsing as guest" strip — the one on-Home nudge to sign in, for a customer
 * using the app via "Continue as guest" (app/sign-in.tsx). Not a hard gate: it
 * just links to sign-in, same screen the cart's checkout button routes a guest
 * to when they actually try to buy something.
 */
function GuestBanner() {
  const styles = useThemedStyles(makeStyles);
  const t = useAccentTheme();
  return (
    <Pressable
      style={styles.guestBanner}
      onPress={() => router.push('/sign-in')}
      accessibilityRole="button"
      accessibilityLabel="Browsing as guest. Sign in for a faster checkout."
    >
      <Ionicons name="person-circle-outline" size={18} color={t.accentDark} />
      <Text style={styles.guestBannerText}>Browsing as guest</Text>
      <Text style={[styles.guestBannerLink, { color: t.accentDark }]}>Sign in →</Text>
    </Pressable>
  );
}

/**
 * Promotional banner — only renders when the super admin has an active
 * featured offer in the feed. No hardcoded fallback artwork.
 */
function PromoBanner({ banner }: { banner: HomeBanner | null }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [banner?.image]);

  if (!banner?.image || failed) return null;

  return (
    <Pressable
      style={styles.bannerWrap}
      onPress={() => {
        if (banner?.restaurantId) {
          router.push(`/restaurant/${banner.restaurantId}`);
        }
      }}
    >
      <Image
        source={{ uri: banner.image }}
        style={styles.bannerImage}
        resizeMode="cover"
        onError={() => setFailed(true)}
      />

      <View style={styles.bannerOverlay}>
        <Text style={styles.bannerOffer} numberOfLines={1}>
          {banner.offerName}
        </Text>
        {!!banner.code && (
          <Text style={styles.bannerCode}>Use code {banner.code}</Text>
        )}
      </View>
    </Pressable>
  );
}

/** Section header — an accent tick, the title, and an optional "See all". */
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
      <View style={styles.sectionTitleWrap}>
        <View style={styles.sectionEyebrow} />
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      {onSeeAll && (
        <Pressable onPress={onSeeAll}>
          <Text style={styles.seeAll}>See all →</Text>
        </Pressable>
      )}
    </View>
  );
}

/**
 * One home-feed shelf. A `tinted` shelf sits on a faint band (`t.sectionBand`)
 * with a hairline top and bottom; a plain one sits straight on the page canvas.
 * The two alternate down the feed so neighbouring sections stay distinct on the
 * long scroll instead of running together on one flat colour.
 */
function Section({
  tinted,
  children,
}: {
  tinted?: boolean;
  children: React.ReactNode;
}) {
  const styles = useThemedStyles(makeStyles);
  return <View style={tinted ? styles.sectionTinted : undefined}>{children}</View>;
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
          <FoodTypeMark foodType={menuItem.foodType} />
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
            <FoodTypeMark foodType="veg" />
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

        {/* Listed, but out of this restaurant's own delivery reach. Explicitly `=== false`:
            undefined means the endpoint didn't answer the question (no pin), which is not
            the same as a no. Saying so beats the alternative it replaced — the restaurant
            silently not appearing at all, which is how a whole city's worth of newly-added
            stores went missing. */}
        {restaurant.deliversToPin === false && (
          <View style={styles.tooFarNote}>
            <Ionicons name="bicycle-outline" size={13} color={Colors.foodTextMuted} />
            <Text style={styles.tooFarText}>
              Too far to deliver here — browse the menu or pick a closer address
            </Text>
          </View>
        )}
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

/**
 * Room the sticky cart needs above the tab bar — its 80dp pill plus the gap it
 * leaves under itself. Mirrors `BAR_HEIGHT` in `CartBar`.
 */
const CART_BAR_ALLOWANCE = 92;

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
  const tabBarInset = useTabBarInset();
  const { isGuest } = useAuth();
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

    // Which shelves will actually render, in order. Alternate ones get the tinted
    // band — always starting with one — so the feed reads as a stack of distinct
    // sections however many happen to be present.
    const sectionKeys = [
      cuisines.length > 0 && 'cuisines',
      recommendedItems.length > 0 && 'recItems',
      recommendedRestaurants.length > 0 && 'recRestaurants',
      nearbyRestaurants.length > 0 && 'nearby',
    ].filter(Boolean) as string[];
    const isTinted = (key: string) => sectionKeys.indexOf(key) % 2 === 0;

    return (
      <>
        {/* ── What's on your mind? ── */}
        {cuisines.length > 0 && (
          <Section tinted={isTinted('cuisines')}>
            <SectionHeader title="What's on your mind?" onSeeAll={() => router.push('/cuisines')} />
            <FlatList
              data={cuisines}
              horizontal
              showsHorizontalScrollIndicator={false}
              keyExtractor={(item) => item.name}
              contentContainerStyle={styles.cuisineList}
              renderItem={({ item }) => <CuisineCardItem item={item} />}
            />
          </Section>
        )}

        {/* ── Recommended for you ── */}
        {recommendedItems.length > 0 && (
          <Section tinted={isTinted('recItems')}>
            <SectionHeader title="Recommended for you" />
            <FlatList
              data={recommendedItems}
              horizontal
              showsHorizontalScrollIndicator={false}
              keyExtractor={(item, idx) => `${item.menuItem._id}-${idx}`}
              contentContainerStyle={styles.recItemList}
              renderItem={({ item }) => <RecommendedItemCard item={item} />}
            />
          </Section>
        )}

        {/* ── Recommended restaurants ── */}
        {recommendedRestaurants.length > 0 && (
          <Section tinted={isTinted('recRestaurants')}>
            <SectionHeader title="Recommended restaurants" />
            <FlatList
              data={recommendedRestaurants}
              horizontal
              showsHorizontalScrollIndicator={false}
              keyExtractor={(item) => item._id}
              contentContainerStyle={styles.restHList}
              renderItem={({ item }) => <RestaurantHCard restaurant={item} />}
            />
          </Section>
        )}

        {/* ── Restaurants near you ── */}
        {nearbyRestaurants.length > 0 && (
          <Section tinted={isTinted('nearby')}>
            <SectionHeader 
              title="Restaurants near you" 
              onSeeAll={() => router.push('/search')}
            />
            {nearbyRestaurants.map((r) => (
              <RestaurantNearbyCard key={r._id} restaurant={r} />
            ))}
          </Section>
        )}

        {/* Bottom spacer for tab bar */}
        <View style={{ height: 24 }} />
      </>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <StatusBar style="dark" />
      <View style={styles.bg}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[
            styles.scrollContent,
            // The tab bar floats over the page, so the feed has to end above it
            // — and above the sticky cart too when that is showing.
            { paddingBottom: tabBarInset + (itemCount > 0 ? CART_BAR_ALLOWANCE : 0) },
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
          {/* ── The app bar: address, storefronts and search on one warm
                 wash. It's the first thing the eye lands on, so it reads as a
                 single block rather than three floating rows. ── */}
          <HomeHeader />

          {/* ── Guest nudge ── */}
          {isGuest && <GuestBanner />}

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
        <View style={[styles.cartDock, { bottom: tabBarInset }]} pointerEvents="box-none">
          <CartBar />
        </View>
      </View>
    </SafeAreaView>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────

const HORIZONTAL_CARD_WIDTH = SCREEN_WIDTH * 0.42;
// The promo banner runs edge to edge, so its height follows the screen width
// instead of being a fixed number of points.
const BANNER_HEIGHT = Math.round(SCREEN_WIDTH / 2.2);
const RESTAURANT_H_CARD_WIDTH = SCREEN_WIDTH * 0.42;

const makeStyles = (t: AccentTheme) =>
  StyleSheet.create({
  // The status-bar inset sits above the app bar, so it takes the first stop of
  // the app bar's wash; the canvas starts below it, where the content does.
  safeArea: {
    flex: 1,
    backgroundColor: t.accentWash[0],
  },
  bg: {
    flex: 1,
    backgroundColor: Colors.foodBg,
  },
  // No border along the bottom: the wash's last stop lands next to foodBg, so
  // the app bar fades into the canvas rather than ending on a hard line.
  topBar: {
    paddingBottom: Spacing.md,
  },
  scrollContent: {
    // paddingBottom is applied at render time — it depends on the floating tab
    // bar's height and on whether the sticky cart is up.
  },
  cartDock: {
    position: 'absolute',
    left: 0,
    right: 0,
  },

  // ── Location header ──
  locationBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.base,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.base,
    gap: Spacing.md,
  },
  locationHeader: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
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
    fontSize: 15,
    color: Colors.foodText,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  // The chevron trails the address rather than the label, so it points at the
  // line that actually changes when you tap.
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 1,
  },
  locationAddress: {
    flexShrink: 1,
    fontSize: 12.5,
    fontWeight: '600',
    color: Colors.foodTextSecondary,
  },
  // A white disc on the wash — the only round shape up here, so it reads as
  // "you" without needing a label.
  profileBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.foodSurface,
    borderWidth: 1,
    borderColor: Colors.foodBorder,
    ...Elevation.card,
  },

  // ── Storefront tabs ──
  storefrontRow: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.base,
    gap: 10,
    marginBottom: Spacing.base,
  },
  storefrontCard: {
    flex: 1,
    height: 68,
    borderRadius: BorderRadius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    ...Elevation.card,
  },
  storefrontCardIdle: {
    backgroundColor: Colors.foodSurface,
    borderWidth: 1,
    borderColor: Colors.foodBorder,
  },
  // The accent fill is a sibling behind the icon and label rather than a
  // clipping parent: `overflow: 'hidden'` would take the card's elevation with
  // it on Android, so the gradient carries the radius itself.
  storefrontFill: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: BorderRadius.lg,
  },
  storefrontLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.foodText,
  },
  storefrontLabelActive: {
    color: Colors.white,
  },
  // Sits in the gap the storefront row already leaves, so appearing and clearing
  // shifts the search bar by the hint's own height and nothing more.
  storefrontHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'center',
    backgroundColor: Colors.foodSurface,
    borderWidth: 1,
    borderColor: Colors.foodBorder,
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
    marginTop: -Spacing.sm,
    marginBottom: Spacing.sm,
    ...Elevation.card,
  },
  storefrontHintText: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.foodTextSecondary,
  },

  // ── Search bar ──
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.base,
    gap: 10,
  },
  searchBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.foodSearchBg,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: Colors.foodBorderStrong,
    paddingHorizontal: Spacing.base,
    height: 52,
    gap: 10,
    ...Elevation.card,
  },
  // Not a TextInput: tapping anywhere here opens the search screen, so a
  // disabled field would only be a placeholder wearing an input's costume.
  searchPlaceholder: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
    color: Colors.foodTextMuted,
  },
  voiceIcon: {
    width: 22,
    height: 22,
    tintColor: t.accent,
  },
  // ── VEG Only switch ──
  // Its own square button beside the pill, sized to match the pill's height so
  // the two read as one row of controls.
  // Green at rest as well as on: this is the veg control whether or not it's
  // switched, and beside an orange search pill the green outline is what makes
  // it findable. The track underneath — grey vs green — is what carries state.
  vegToggle: {
    width: 56,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: Colors.foodSurface,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.foodVegRing,
    ...Elevation.card,
  },
  vegToggleOn: {
    backgroundColor: Colors.foodPureVegBg,
    borderColor: Colors.foodVegGreen,
  },
  vegToggleLabel: {
    fontSize: 9.5,
    fontWeight: '800',
    color: Colors.foodVegGreen,
    letterSpacing: 0.4,
  },
  vegToggleLabelOn: {
    color: Colors.foodVegGreenDark,
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
    backgroundColor: Colors.foodSurface,
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
    ...Elevation.sheet,
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
    borderColor: Colors.foodBorderStrong,
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

  // ── Guest nudge strip ──
  guestBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: t.accentLight,
    marginHorizontal: Spacing.base,
    marginTop: Spacing.sm,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 8,
  },
  guestBannerText: {
    flex: 1,
    fontSize: 12.5,
    fontWeight: '700',
    color: Colors.foodTextSecondary,
  },
  guestBannerLink: {
    fontSize: 12.5,
    fontWeight: '800',
  },

  // ── Veg-mode confirmation strip ──
  vegBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.foodPureVegBg,
    marginHorizontal: Spacing.base,
    marginTop: Spacing.sm,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 8,
    marginBottom: 0,
  },
  vegBannerText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '700',
    color: Colors.foodVegGreen,
  },

  // ── Pure-veg restaurant badge ──
  pureVegBadge: {
    position: 'absolute',
    top: 12,
    left: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.foodSurface,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: BorderRadius.sm,
    ...Elevation.raised,
  },
  pureVegBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: Colors.foodVegGreen,
  },

  // ── Banner ──
  bannerWrap: {
    marginTop: Spacing.md,
    marginBottom: Spacing.sm,
    overflow: 'hidden',
  },
  bannerImage: {
    width: '100%',
    height: BANNER_HEIGHT,
  },
  bannerOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.sm + 2,
    backgroundColor: 'rgba(20,22,26,0.5)',
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

  // ── Section shelf ──
  // Alternate feed sections sit on this faint tinted band, hairlined top and
  // bottom, so two neighbours read as separate shelves rather than one flat
  // scroll. The tint follows the accent theme (warm by default, green in
  // pure-veg mode); plain shelves just let the page canvas show through.
  sectionTinted: {
    backgroundColor: t.sectionBand,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.foodBorder,
    paddingBottom: Spacing.sm,
  },

  // ── Section header ──
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.base,
    marginBottom: Spacing.md,
    marginTop: Spacing.lg,
  },
  // The accent tick bleeds into the gutter (negative margin ≈ tick + gap) so the
  // title text itself still lands on the 16px grid, lined up with the card rail
  // beneath it.
  sectionTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    marginLeft: -13,
  },
  sectionEyebrow: {
    width: 4,
    height: 18,
    borderRadius: 2,
    backgroundColor: t.accent,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.foodText,
    letterSpacing: -0.3,
  },
  seeAll: {
    fontSize: 12.5,
    color: t.accentDark,
    fontWeight: '800',
    backgroundColor: t.accentLight,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: BorderRadius.full,
    overflow: 'hidden',
  },

  // ── Cuisine cards ──
  cuisineList: {
    paddingHorizontal: Spacing.base,
    gap: 16,
    paddingBottom: Spacing.md,
  },
  cuisineCard: {
    alignItems: 'center',
    width: 76,
  },
  cuisineImageWrap: {
    width: 68,
    height: 68,
    borderRadius: 34,
    overflow: 'hidden',
    marginBottom: 7,
    backgroundColor: t.accentLight,
    borderWidth: 2,
    borderColor: t.accentRing,
    ...Elevation.card,
  },
  cuisineImage: {
    width: 64,
    height: 64,
    borderRadius: 32,
  },
  cuisineName: {
    fontSize: 11.5,
    fontWeight: '700',
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
    backgroundColor: Colors.foodSurface,
    borderRadius: BorderRadius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.foodBorder,
    ...Elevation.card,
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
    padding: 11,
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
    fontSize: 13,
    fontWeight: '800',
    color: Colors.foodText,
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
    backgroundColor: Colors.foodSurface,
    borderRadius: BorderRadius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.foodBorder,
    ...Elevation.card,
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
    padding: 11,
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
    backgroundColor: Colors.foodSurface,
    borderRadius: BorderRadius.lg,
    marginHorizontal: Spacing.base,
    marginBottom: Spacing.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.foodBorder,
    ...Elevation.card,
  },
  tooFarNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginTop: Spacing.xs,
  },
  tooFarText: {
    flex: 1,
    fontSize: 11.5,
    color: Colors.foodTextMuted,
    lineHeight: 15,
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
    ...Elevation.raised,
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
    backgroundColor: 'rgba(20,22,26,0.38)',
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
    backgroundColor: 'rgba(20,22,26,0.38)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  nearbyInfo: {
    padding: Spacing.base,
    gap: 4,
  },
  nearbyName: {
    fontSize: 17,
    fontWeight: '800',
    color: Colors.foodText,
    letterSpacing: -0.3,
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
  skeletonSectionTitle: {
    height: 20,
    width: 180,
    borderRadius: 6,
    backgroundColor: Colors.foodSkeleton,
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
    backgroundColor: Colors.foodSkeleton,
  },
  skeletonCuisineLabel: {
    width: 48,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.foodSkeleton,
  },
  skeletonCardRow: {
    flexDirection: 'row',
    gap: 12,
  },
  skeletonCard: {
    width: HORIZONTAL_CARD_WIDTH,
    height: 170,
    borderRadius: BorderRadius.lg,
    backgroundColor: Colors.foodSkeleton,
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
