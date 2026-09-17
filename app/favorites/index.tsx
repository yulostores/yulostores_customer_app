/**
 * app/favorites/index.tsx — the customer's favorited restaurants.
 *
 * Reached from the Profile tab. Data, paging, auth handling and optimistic
 * un-favoriting all come from useFavoriteRestaurants()
 * (src/hooks/useFavoriteRestaurants.ts): GET /api/users/me/favorites/restaurants,
 * with a mounted / stale-response guard and a 401 → "sign in" branch. This
 * screen is pure presentation over it — every card is a real restaurant
 * document, tapped through to the same storefront screen as the home feed.
 */

import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RemoteImage } from '../../src/components/RemoteImage';
import { Colors } from '../../src/constants/Colors';
import { BorderRadius, Shadows, Spacing } from '../../src/constants/Theme';
import { useAuth } from '../../src/context/AuthContext';
import {
  ORANGE_ACCENT,
  useAccentTheme,
  useThemedStyles,
  type AccentTheme,
} from '../../src/hooks/useAccentTheme';
import { useFavoriteRestaurants } from '../../src/hooks/useFavoriteRestaurants';
import type { Restaurant } from '../../src/types/restaurant';

function goBack() {
  if (router.canGoBack()) router.back();
  else router.navigate('/(tabs)/profile');
}

// ─── Restaurant card ─────────────────────────────────────────────────────────

function FavoriteCard({
  restaurant,
  onRemove,
}: {
  restaurant: Restaurant;
  onRemove: (id: string) => void;
}) {
  const cuisines = restaurant.cuisineType.join(' • ');

  const confirmRemove = () => {
    Alert.alert('Remove favorite?', `${restaurant.name} will be removed from your favorites.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => onRemove(restaurant._id) },
    ]);
  };

  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      onPress={() => router.push(`/restaurant/${restaurant._id}`)}
      accessibilityRole="button"
      accessibilityLabel={restaurant.name}
    >
      <RemoteImage
        uri={restaurant.coverImage || restaurant.logo}
        style={styles.thumb}
        icon="restaurant-outline"
        iconSize={32}
      />

      <View style={styles.cardInfo}>
        <Text style={styles.cardName} numberOfLines={1}>{restaurant.name}</Text>
        {!!cuisines && (
          <Text style={styles.cardCuisine} numberOfLines={1}>{cuisines}</Text>
        )}
        <View style={styles.cardMetaRow}>
          {restaurant.totalRatings > 0 && (
            <View style={styles.ratingChip}>
              <Ionicons name="star" size={11} color={Colors.white} />
              <Text style={styles.ratingText}>{restaurant.avgRating.toFixed(1)}</Text>
            </View>
          )}
          <View style={styles.statusRow}>
            <View
              style={[styles.statusDot, restaurant.isOpen ? styles.dotOpen : styles.dotClosed]}
            />
            <Text style={styles.statusText}>{restaurant.isOpen ? 'Open now' : 'Closed'}</Text>
          </View>
        </View>
      </View>

      <Pressable
        style={styles.heartBtn}
        onPress={confirmRemove}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={`Remove ${restaurant.name} from favorites`}
      >
        <Ionicons name="heart" size={22} color={Colors.foodHeartRed} />
      </Pressable>
    </Pressable>
  );
}

// ─── Notices ─────────────────────────────────────────────────────────────────

function CenteredNotice({
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
    <View style={styles.centered}>
      <Ionicons name={icon} size={48} color={Colors.foodBorder} />
      <Text style={styles.noticeTitle}>{title}</Text>
      <Text style={styles.noticeText}>{message}</Text>
      {actionLabel && onAction && (
        <Pressable style={styles.actionBtn} onPress={onAction}>
          <Text style={styles.actionBtnText}>{actionLabel}</Text>
        </Pressable>
      )}
    </View>
  );
}

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function FavoritesScreen() {
  const styles = useThemedStyles(makeStyles);
  const { accent } = useAccentTheme();
  const { signOut } = useAuth();
  const {
    restaurants,
    total,
    isLoading,
    isRefreshing,
    isPaging,
    error,
    notSignedIn,
    refresh,
    loadMore,
    remove,
  } = useFavoriteRestaurants();

  const header = (
    <View style={styles.header}>
      <Pressable onPress={goBack} hitSlop={10} style={styles.backBtn}>
        <Ionicons name="arrow-back" size={22} color={Colors.foodText} />
      </Pressable>
      <Text style={styles.headerTitle}>Favorites</Text>
      <View style={styles.backBtn} />
    </View>
  );

  if (isLoading) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <StatusBar style="dark" />
        {header}
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={accent} />
        </View>
      </SafeAreaView>
    );
  }

  if (notSignedIn) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <StatusBar style="dark" />
        {header}
        <CenteredNotice
          icon="lock-closed-outline"
          title="Sign in to see your favorites"
          message="Favorites are saved to your account. Sign in again to pick up where you left off."
          actionLabel="Sign in"
          onAction={signOut}
        />
      </SafeAreaView>
    );
  }

  if (error && restaurants.length === 0) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <StatusBar style="dark" />
        {header}
        <CenteredNotice
          icon="alert-circle-outline"
          title="Couldn’t load your favorites"
          message={error}
          actionLabel="Retry"
          onAction={refresh}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <StatusBar style="dark" />
      {header}
      <FlatList
        data={restaurants}
        keyExtractor={(r) => r._id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => <FavoriteCard restaurant={item} onRemove={remove} />}
        ListHeaderComponent={
          restaurants.length > 0 ? (
            <Text style={styles.count}>
              {total} favorite{total !== 1 ? 's' : ''}
            </Text>
          ) : null
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="heart-outline" size={64} color={Colors.foodBorder} />
            <Text style={styles.emptyTitle}>No favorites yet</Text>
            <Text style={styles.emptySubtitle}>
              Tap the heart on a restaurant to save it here.
            </Text>
            <Pressable style={styles.actionBtn} onPress={() => router.navigate('/(tabs)')}>
              <Text style={styles.actionBtnText}>Browse restaurants</Text>
            </Pressable>
          </View>
        }
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={refresh}
            tintColor={accent}
            colors={[accent]}
          />
        }
        onEndReached={loadMore}
        onEndReachedThreshold={0.4}
        ListFooterComponent={
          isPaging ? (
            <ActivityIndicator style={{ marginVertical: 16 }} color={accent} />
          ) : null
        }
      />
    </SafeAreaView>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const makeStyles = (t: AccentTheme) =>
  StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.foodBg },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.sm + 2,
    borderBottomWidth: 1,
    borderBottomColor: Colors.foodBorder,
    backgroundColor: Colors.foodSurface,
  },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '800', color: Colors.foodText, letterSpacing: -0.3 },

  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.md, padding: Spacing.xl },
  noticeTitle: { fontSize: 18, fontWeight: '800', color: Colors.foodText, marginTop: 4 },
  noticeText: { fontSize: 14, color: Colors.foodTextSecondary, textAlign: 'center' },
  actionBtn: {
    backgroundColor: t.accent,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.full,
    marginTop: Spacing.sm,
  },
  actionBtnText: { fontSize: 14, fontWeight: '700', color: Colors.white },

  list: { paddingHorizontal: Spacing.base, paddingTop: Spacing.md, paddingBottom: 24, gap: Spacing.md },
  count: { fontSize: 13, color: Colors.foodTextMuted, marginBottom: Spacing.sm },

  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: Colors.foodSurface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.sm + 2,
    borderWidth: 1,
    borderColor: Colors.foodBorder,
    ...Shadows.sm,
  },
  cardPressed: { opacity: 0.9, backgroundColor: Colors.foodBgSecondary },
  thumb: { width: 76, height: 76, borderRadius: BorderRadius.md },
  cardInfo: { flex: 1, gap: 3 },
  cardName: { fontSize: 15, fontWeight: '800', color: Colors.foodText },
  cardCuisine: { fontSize: 12, color: Colors.foodTextMuted },
  cardMetaRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginTop: 2 },
  ratingChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: Colors.foodRatingBg,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
  },
  ratingText: { fontSize: 11, fontWeight: '700', color: Colors.white },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  dotOpen: { backgroundColor: Colors.foodDeliveryBadge },
  dotClosed: { backgroundColor: Colors.foodTextMuted },
  statusText: { fontSize: 12, color: Colors.foodTextSecondary },
  heartBtn: { padding: Spacing.xs, alignItems: 'center', justifyContent: 'center' },

  empty: { alignItems: 'center', justifyContent: 'center', paddingTop: 72, paddingHorizontal: Spacing.xl, gap: Spacing.md },
  emptyTitle: { fontSize: 20, fontWeight: '800', color: Colors.foodText },
  emptySubtitle: { fontSize: 14, color: Colors.foodTextSecondary, textAlign: 'center' },
  });

const styles = makeStyles(ORANGE_ACCENT);
