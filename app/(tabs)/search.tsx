import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
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
import CartBar from '../../src/components/CartBar';
import { FoodTypeMark } from '../../src/components/FoodTypeMark';
import { RemoteImage } from '../../src/components/RemoteImage';
import { Colors } from '../../src/constants/Colors';
import { BorderRadius, Elevation, Spacing } from '../../src/constants/Theme';
import { useVegMode } from '../../src/context/VegModeContext';
import {
  ORANGE_ACCENT,
  useAccentTheme,
  useThemedStyles,
  type AccentTheme,
} from '../../src/hooks/useAccentTheme';
import { useSearchDiscovery } from '../../src/hooks/useSearchDiscovery';
import { useTypeahead } from '../../src/hooks/useTypeahead';
import { logger, reportError } from '../../src/lib/logger';
import { ApiError } from '../../src/services/api';
import { fetchRestaurants } from '../../src/services/restaurants';
import { recordSearch } from '../../src/services/search';
import type { PopularSearch, RecentSearch, TypeaheadResult } from '../../src/types/search';
import type { Restaurant } from '../../src/types/restaurant';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const GRID_GAP = 12;
const GRID_COLUMNS = 3;
/** Square tile: screen minus the row's own horizontal padding and the inter-tile gaps. */
const TILE_SIZE =
  (SCREEN_WIDTH - Spacing.base * 2 - GRID_GAP * (GRID_COLUMNS - 1)) / GRID_COLUMNS;

// ─── Discovery sub-views ───────────────────────────────────────────────────

/** A recent-search row: clock, the term, and an "x" to forget it. */
function RecentRow({
  item,
  onPress,
  onRemove,
}: {
  item: RecentSearch;
  onPress: () => void;
  onRemove: () => void;
}) {
  return (
    <Pressable style={styles.recentRow} onPress={onPress}>
      <Ionicons name="time-outline" size={22} color={Colors.foodTextMuted} />
      <Text style={styles.recentText} numberOfLines={1}>
        {item.query}
      </Text>
      <Pressable onPress={onRemove} hitSlop={10} accessibilityLabel={`Remove ${item.query}`}>
        <Ionicons name="close" size={18} color={Colors.foodTextMuted} />
      </Pressable>
    </Pressable>
  );
}

/** One "Popular right now" tile — a circular photo (or a graceful placeholder) + label. */
function PopularTile({ item, onPress }: { item: PopularSearch; onPress: () => void }) {
  return (
    <Pressable style={styles.tile} onPress={onPress}>
      <RemoteImage
        uri={item.imageUrl}
        style={styles.tileImage}
        imageStyle={styles.tileImageCircle}
        icon="fast-food-outline"
        iconSize={30}
        showCaption
      />
      <Text style={styles.tileLabel} numberOfLines={2}>
        {item.query}
      </Text>
    </Pressable>
  );
}

/** The "Pure veg mode is on — …" confirmation pill, server-worded, shown app-wide while veg mode is on. */
function VegBanner({ text }: { text: string }) {
  return (
    <View style={styles.vegBanner}>
      <Ionicons name="radio-button-on" size={16} color={Colors.foodVegGreen} />
      <Text style={styles.vegBannerText}>{text}</Text>
    </View>
  );
}

/** Splits `name` around the first case-insensitive match of `term`, for a bolded highlight. */
function splitMatch(name: string, term: string): [string, string, string] {
  const trimmed = term.trim();
  if (!trimmed) return [name, '', ''];
  const idx = name.toLowerCase().indexOf(trimmed.toLowerCase());
  if (idx === -1) return [name, '', ''];
  return [name.slice(0, idx), name.slice(idx, idx + trimmed.length), name.slice(idx + trimmed.length)];
}

/** One typeahead row — thumbnail, name (matched term bolded), and a "Dish"/"Restaurant" caption. */
function SuggestionRow({
  item,
  query,
  onPress,
}: {
  item: TypeaheadResult;
  query: string;
  onPress: () => void;
}) {
  const [before, match, after] = splitMatch(item.name, query);
  return (
    <Pressable style={styles.suggestionRow} onPress={onPress}>
      <RemoteImage
        uri={item.thumbnailUrl}
        style={styles.suggestionThumb}
        icon={item.type === 'restaurant' ? 'restaurant' : 'fast-food-outline'}
        iconSize={18}
      />
      <View style={styles.suggestionBody}>
        <View style={styles.suggestionNameRow}>
          <Text style={styles.suggestionName} numberOfLines={1}>
            {match ? (
              <>
                {before}
                <Text style={styles.suggestionNameMatch}>{match}</Text>
                {after}
              </>
            ) : (
              item.name
            )}
          </Text>
          {item.type === 'dish' && item.foodType && <FoodTypeMark foodType={item.foodType} />}
        </View>
        <Text style={styles.suggestionType}>
          {item.type === 'restaurant' ? 'Restaurant' : 'Dish'}
        </Text>
      </View>
    </Pressable>
  );
}

/** Full-bleed status block for a failed load or an empty discovery view. */
function StatusBlock({
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
    <View style={styles.centerBox}>
      <Ionicons name={icon} size={56} color={Colors.foodBorder} />
      <Text style={styles.emptyText}>{title}</Text>
      <Text style={styles.emptySubtext}>{message}</Text>
      {actionLabel && onAction && (
        <Pressable style={styles.retryBtn} onPress={onAction}>
          <Text style={styles.retryBtnText}>{actionLabel}</Text>
        </Pressable>
      )}
    </View>
  );
}

/** Placeholder shown while the discovery data is in flight. */
function DiscoverySkeleton() {
  return (
    <View style={styles.skeletonWrap}>
      <View style={[styles.skeletonBlock, { width: 160, height: 22 }]} />
      {[0, 1, 2].map((i) => (
        <View key={i} style={[styles.skeletonBlock, styles.skeletonRow]} />
      ))}
      <View style={[styles.skeletonBlock, { width: 180, height: 22, marginTop: Spacing.lg }]} />
      <View style={styles.skeletonGrid}>
        {Array.from({ length: 6 }).map((_, i) => (
          <View key={i} style={[styles.skeletonBlock, styles.skeletonTile]} />
        ))}
      </View>
    </View>
  );
}

// ─── Screen ────────────────────────────────────────────────────────────────

export default function SearchScreen() {
  const styles = useThemedStyles(makeStyles);
  const t = useAccentTheme();
  const { enabled: vegEnabled, scope: vegScope } = useVegMode();
  // Pure-veg mode filters the restaurant list itself (backend `vegOnly=true` →
  // `isPureVeg`); "all restaurants" scope leaves the list alone, same as Home.
  const vegOnly = vegEnabled && vegScope === 'pure_veg_only';

  // A cuisine chip (Home, or Browse by cuisine) links here with `?query=`.
  const { query: initialQuery } = useLocalSearchParams<{ query?: string }>();

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Restaurant[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const {
    popular,
    recent,
    vegBannerText,
    isLoading: discoveryLoading,
    error: discoveryError,
    refresh: refreshDiscovery,
    refreshRecent,
    removeRecent,
  } = useSearchDiscovery();

  // Live while the customer is mid-type and hasn't submitted yet — the same
  // condition that swaps the discovery view for the suggestions dropdown below.
  const isTyping = !hasSearched && query.trim().length > 0;
  const { results: suggestions, isLoading: suggestLoading } = useTypeahead(query, isTyping);

  const runSearch = useCallback(
    async (raw: string) => {
      const term = raw.trim();
      if (!term) return;

      setQuery(term);
      setHasSearched(true);
      setIsSearching(true);
      setSearchError(null);

      // Best-effort history write; pull the Recent list once it lands so the term
      // the customer just ran shows up without a full-screen reload.
      recordSearch(term)
        .then(() => refreshRecent())
        .catch(() => {});

      try {
        // `q` — not `cuisine`: the list endpoint has no cuisine filter, and any
        // request without `q` is treated as a geo-browse and 400s without lat/lng.
        // `q` matches restaurant names, cuisine names, and the names of available
        // dishes a restaurant serves — so a search for a dish returns the places
        // that sell it.
        // `vegOnly` mirrors the app-wide "Pure veg restaurants only" scope so the
        // results are filtered server-side, never in the client.
        const { restaurants } = await fetchRestaurants({
          q: term,
          vegOnly: vegOnly || undefined,
        });
        setResults(restaurants);
      } catch (err) {
        // Per the app-wide split: an expected 4xx is a warn, a 5xx / unreachable
        // is a reported error. api.ts has already logged the transport failure;
        // this adds the screen's context (the query).
        if (err instanceof ApiError && err.status >= 400 && err.status < 500) {
          logger.warn('search', `Search failed — ${err.status} ${err.code}`, {
            query: term,
            status: err.status,
            code: err.code,
          });
        } else {
          reportError('search', 'Restaurant search failed', err, { query: term });
        }
        setResults([]);
        setSearchError(
          err instanceof Error && err.message
            ? err.message
            : "Couldn't run that search. Check your connection and try again.",
        );
      } finally {
        setIsSearching(false);
      }
    },
    [refreshRecent, vegOnly],
  );

  // Run an incoming `?query=` exactly once per distinct value — a fresh tap on
  // a cuisine chip re-triggers this even while already on the Search tab.
  const appliedInitialQueryRef = useRef<string | null>(null);
  useEffect(() => {
    const q = initialQuery?.trim();
    if (!q || appliedInitialQueryRef.current === q) return;
    appliedInitialQueryRef.current = q;
    runSearch(q);
  }, [initialQuery, runSearch]);

  const clearSearch = useCallback(() => {
    setQuery('');
    setResults([]);
    setHasSearched(false);
    setSearchError(null);
    // Reflect anything just searched when returning to the discovery view.
    refreshRecent();
  }, [refreshRecent]);

  const handleBack = useCallback(() => {
    // While a search is showing, "back" clears it to the discovery view; from the
    // discovery view it leaves the tab.
    if (hasSearched || query.length > 0) {
      clearSearch();
      return;
    }
    if (router.canGoBack()) router.back();
    else router.navigate('/(tabs)');
  }, [hasSearched, query, clearSearch]);

  // A restaurant suggestion is a specific storefront — go straight there rather
  // than re-running it as a text search. A dish suggestion has no single detail
  // page, so it runs the same restaurant search a Popular/Recent tap would.
  const handleSelectSuggestion = useCallback(
    (item: TypeaheadResult) => {
      if (item.type === 'restaurant') {
        recordSearch(item.name)
          .then(() => refreshRecent())
          .catch(() => {});
        clearSearch();
        router.push(`/restaurant/${item.id}`);
        return;
      }
      runSearch(item.name);
    },
    [clearSearch, refreshRecent, runSearch],
  );

  const renderResults = () => {
    if (isSearching) {
      return (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color={t.accent} />
        </View>
      );
    }
    if (searchError) {
      return (
        <StatusBlock
          icon="cloud-offline-outline"
          title="Search didn't work"
          message={searchError}
          actionLabel="Try again"
          onAction={() => runSearch(query)}
        />
      );
    }
    if (results.length === 0) {
      return (
        <StatusBlock
          icon="search-outline"
          title="No restaurants found"
          message={`Nothing matched "${query.trim()}". Try a different term.`}
        />
      );
    }
    return (
      <FlatList
        data={results}
        keyExtractor={(r) => r._id}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => (
          <Pressable
            style={styles.card}
            onPress={() => router.push(`/restaurant/${item._id}`)}
          >
            <RemoteImage
              uri={item.logo}
              style={styles.cardImage}
              icon="restaurant"
              iconSize={24}
            />
            <View style={styles.cardBody}>
              <Text style={styles.cardName} numberOfLines={1}>
                {item.name}
              </Text>
              {item.cuisineType.length > 0 && (
                <Text style={styles.cardCuisine} numberOfLines={1}>
                  {item.cuisineType.join(' • ')}
                </Text>
              )}
              <View style={styles.ratingRow}>
                <View style={styles.ratingBadge}>
                  <Ionicons name="star" size={10} color="#FFF" />
                  <Text style={styles.ratingText}>
                    {item.totalRatings > 0 ? item.avgRating.toFixed(1) : 'New'}
                  </Text>
                </View>
                <Text style={styles.cardMeta}>{item.totalRatings} ratings</Text>
              </View>
            </View>
          </Pressable>
        )}
      />
    );
  };

  const renderTypeahead = () => {
    if (suggestLoading && suggestions.length === 0) {
      return (
        <View style={styles.centerBox}>
          <ActivityIndicator size="small" color={t.accent} />
        </View>
      );
    }
    if (suggestions.length === 0) return null;
    return (
      <ScrollView
        style={styles.discoveryScroll}
        contentContainerStyle={styles.suggestionsContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.suggestionsCard}>
          {suggestions.map((item) => (
            <SuggestionRow
              key={`${item.type}-${item.id}`}
              item={item}
              query={query}
              onPress={() => handleSelectSuggestion(item)}
            />
          ))}
        </View>
      </ScrollView>
    );
  };

  const renderDiscovery = () => {
    if (discoveryLoading) return <DiscoverySkeleton />;
    if (discoveryError) {
      return (
        <StatusBlock
          icon="cloud-offline-outline"
          title="Couldn't load this"
          message={discoveryError}
          actionLabel="Try again"
          onAction={refreshDiscovery}
        />
      );
    }
    if (recent.length === 0 && popular.length === 0) {
      return (
        <StatusBlock
          icon="search-outline"
          title="Search YuloStores"
          message="Find restaurants and dishes near you by name or cuisine."
        />
      );
    }
    return (
      <ScrollView
        style={styles.discoveryScroll}
        contentContainerStyle={styles.discoveryContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {recent.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Recent searches</Text>
            {recent.map((item) => (
              <RecentRow
                key={item.id}
                item={item}
                onPress={() => runSearch(item.query)}
                onRemove={() => removeRecent(item.id)}
              />
            ))}
          </>
        )}

        {popular.length > 0 && (
          <>
            <Text style={[styles.sectionTitle, recent.length > 0 && styles.sectionTitleSpaced]}>
              Popular right now
            </Text>
            <View style={styles.grid}>
              {popular.map((item) => (
                <PopularTile
                  key={item.query}
                  item={item}
                  onPress={() => runSearch(item.query)}
                />
              ))}
            </View>
          </>
        )}
      </ScrollView>
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.container}>
        {/* Header — back + search field */}
        <View style={styles.header}>
          <Pressable onPress={handleBack} hitSlop={8} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color={Colors.foodText} />
          </Pressable>
          <View style={styles.searchBar}>
            <Ionicons name="search" size={20} color={t.accent} />
            <TextInput
              style={styles.input}
              placeholder="Search for restaurants and dishes"
              placeholderTextColor={Colors.foodTextMuted}
              value={query}
              onChangeText={setQuery}
              onSubmitEditing={() => runSearch(query)}
              returnKeyType="search"
              autoCapitalize="none"
              autoCorrect={false}
              autoFocus={!hasSearched}
            />
            <View style={styles.searchDivider} />
            {query.length > 0 ? (
              <Pressable onPress={clearSearch} hitSlop={8}>
                <Ionicons name="close-circle" size={20} color={Colors.foodTextMuted} />
              </Pressable>
            ) : (
              <Image
                source={require('../../assets/Images/Icons/Button - Voice search.png')}
                style={styles.voiceIcon}
                resizeMode="contain"
              />
            )}
          </View>
        </View>

        {!!vegBannerText && <VegBanner text={vegBannerText} />}

        {hasSearched ? renderResults() : isTyping ? renderTypeahead() : renderDiscovery()}

        <View style={styles.cartBarSlot} pointerEvents="box-none">
          <CartBar />
        </View>
      </View>
    </SafeAreaView>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────

const makeStyles = (t: AccentTheme) =>
  StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.foodSurface },
  container: { flex: 1, backgroundColor: Colors.foodBg },

  // ── Header ──
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.base,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.md,
    backgroundColor: Colors.foodSurface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.foodBorder,
  },
  backBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
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
    height: 48,
    gap: Spacing.sm,
    ...Elevation.card,
  },
  input: {
    flex: 1,
    fontSize: 15,
    color: Colors.foodText,
    paddingVertical: 0,
  },
  searchDivider: {
    width: 1,
    height: 22,
    backgroundColor: Colors.foodBorderStrong,
  },
  voiceIcon: {
    width: 22,
    height: 22,
    tintColor: t.accent,
  },

  // ── Veg-mode confirmation pill ──
  vegBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginHorizontal: Spacing.base,
    marginTop: Spacing.md,
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.sm + 2,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: Colors.foodVegGreen,
    backgroundColor: Colors.foodPureVegBg,
  },
  vegBannerText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    color: Colors.foodVegGreen,
  },

  // ── Discovery ──
  discoveryScroll: { flex: 1 },
  discoveryContent: {
    paddingHorizontal: Spacing.base,
    paddingTop: Spacing.sm,
    paddingBottom: 120,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: Colors.foodText,
    letterSpacing: -0.4,
    marginBottom: Spacing.md,
  },
  sectionTitleSpaced: {
    marginTop: Spacing.xl,
  },

  // Recent searches — a plain row (no card), per the Figma spec: just the icon,
  // the term, and the "x", with generous vertical rhythm doing the separation.
  recentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.md,
  },
  recentText: {
    flex: 1,
    fontSize: 16,
    fontWeight: '500',
    color: Colors.foodText,
  },

  // Popular grid
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: GRID_GAP,
  },
  tile: {
    width: TILE_SIZE,
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  // Placeholder shape (RemoteImage's `style`) — a dashed rounded square, only seen
  // when the backend had no representative photo for the term.
  tileImage: {
    width: TILE_SIZE,
    height: TILE_SIZE,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.foodBorder,
  },
  // Loaded-photo shape (RemoteImage's `imageStyle`) — masked to a circle, no border.
  tileImageCircle: {
    width: TILE_SIZE,
    height: TILE_SIZE,
    borderRadius: TILE_SIZE / 2,
  },
  tileLabel: {
    marginTop: Spacing.sm,
    fontSize: 14,
    fontWeight: '700',
    color: Colors.foodText,
    textAlign: 'center',
  },

  // ── Typeahead suggestions ──
  suggestionsContent: {
    paddingBottom: 120,
  },
  suggestionsCard: {
    backgroundColor: Colors.foodSurface,
    borderRadius: BorderRadius.lg,
    marginHorizontal: Spacing.base,
    marginTop: Spacing.md,
    paddingVertical: Spacing.xs,
    ...Elevation.raised,
  },
  suggestionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
  },
  suggestionThumb: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.foodBgSecondary,
  },
  suggestionBody: { flex: 1, minWidth: 0, gap: 2 },
  suggestionNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  suggestionName: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    color: Colors.foodText,
  },
  suggestionNameMatch: {
    fontWeight: '800',
  },
  suggestionType: {
    fontSize: 12,
    color: Colors.foodTextMuted,
  },

  // ── Shared status / skeleton ──
  centerBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: Spacing.xl,
    paddingBottom: 100,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.foodText,
    marginTop: 8,
  },
  emptySubtext: {
    fontSize: 14,
    color: Colors.foodTextMuted,
    textAlign: 'center',
  },
  retryBtn: {
    marginTop: Spacing.md,
    backgroundColor: t.accent,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
  },
  retryBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.white,
  },
  skeletonWrap: {
    flex: 1,
    paddingHorizontal: Spacing.base,
    paddingTop: Spacing.sm,
  },
  skeletonBlock: {
    backgroundColor: Colors.foodSkeleton,
    borderRadius: BorderRadius.md,
  },
  skeletonRow: {
    height: 28,
    marginBottom: Spacing.md,
  },
  skeletonGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: GRID_GAP,
    marginTop: Spacing.md,
  },
  skeletonTile: {
    width: TILE_SIZE,
    height: TILE_SIZE + 20,
  },

  // ── Results list ──
  list: {
    paddingHorizontal: Spacing.base,
    gap: Spacing.md,
    paddingTop: Spacing.sm,
    paddingBottom: 120,
  },
  card: {
    flexDirection: 'row',
    backgroundColor: Colors.foodSurface,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.foodBorder,
    padding: Spacing.md,
    gap: Spacing.md,
    alignItems: 'center',
    ...Elevation.card,
  },
  cardImage: {
    width: 60,
    height: 60,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.foodBgSecondary,
  },
  cardBody: { flex: 1, gap: 3 },
  cardName: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.foodText,
  },
  cardCuisine: {
    fontSize: 12,
    color: Colors.foodTextSecondary,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  ratingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: Colors.foodRatingBg,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
  },
  ratingText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFF',
  },
  cardMeta: {
    fontSize: 11,
    color: Colors.foodTextMuted,
  },

  // ── Cart bar ──
  cartBarSlot: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: Spacing.md,
  },
  });

const styles = makeStyles(ORANGE_ACCENT);
