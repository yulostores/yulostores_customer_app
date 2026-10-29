import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  Image,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  type TextInputInstance,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import CartBar from '../../src/components/CartBar';
import { FoodTypeMark } from '../../src/components/FoodTypeMark';
import { RemoteImage } from '../../src/components/RemoteImage';
import { Colors } from '../../src/constants/Colors';
import { BorderRadius, Elevation, Spacing } from '../../src/constants/Theme';
import { useDeliveryLocation } from '../../src/context/DeliveryLocationContext';
import { useVegMode } from '../../src/context/VegModeContext';
import {
  ORANGE_ACCENT,
  useAccentTheme,
  useThemedStyles,
  type AccentTheme,
} from '../../src/hooks/useAccentTheme';
import { useSearchDiscovery } from '../../src/hooks/useSearchDiscovery';
import { useTypeahead } from '../../src/hooks/useTypeahead';
import { confirmAction, confirmCopy, confirmThen } from '../../src/lib/confirm';
import { logger, reportError } from '../../src/lib/logger';
import { isVoiceSearchAvailable, startVoiceSearch, type VoiceSearchSession } from '../../src/lib/voiceSearch';
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
      <Ionicons name="time-outline" size={19} color={Colors.foodTextMuted} />
      <Text style={styles.recentText} numberOfLines={1}>
        {item.query}
      </Text>
      <Pressable onPress={onRemove} hitSlop={10} accessibilityLabel={`Remove ${item.query}`}>
        <Ionicons name="close" size={16} color={Colors.foodTextMuted} />
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
        iconSize={22}
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
      <Ionicons name="radio-button-on" size={13} color={Colors.foodVegGreen} />
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
        iconSize={15}
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
  const insets = useSafeAreaInsets();
  const styles = useThemedStyles(makeStyles);
  const t = useAccentTheme();
  const { enabled: vegEnabled, scope: vegScope } = useVegMode();
  // Pure-veg mode filters the restaurant list itself (backend `vegOnly=true` →
  // `isPureVeg`); "all restaurants" scope leaves the list alone, same as Home.
  const vegOnly = vegEnabled && vegScope === 'pure_veg_only';

  // Search is scoped to the customer's delivery location, like Home: only restaurants that
  // deliver there are returned, so a result is always something they can order from. With no
  // saved location yet the backend falls back to an unscoped search. An `unlocated` address
  // carries a placeholder coordinate (not a real one), so it's treated as no location — same
  // as useHomeData — rather than scoping results to the placeholder city.
  const { activeLocation } = useDeliveryLocation();
  const located = activeLocation != null && !activeLocation.unlocated;
  const lat = located ? activeLocation.coordinates.latitude : undefined;
  const lng = located ? activeLocation.coordinates.longitude : undefined;

  // A cuisine chip (Home, or Browse by cuisine) links here with `?query=`.
  const { query: initialQuery } = useLocalSearchParams<{ query?: string }>();

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Restaurant[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  // Pagination for the current result set. `searchRef` pins the params the
  // first page ran with so "load more" fetches the same search's next page.
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const loadingMoreRef = useRef(false);
  const searchRef = useRef<{ q: string; lat?: number; lng?: number; vegOnly?: boolean } | null>(
    null,
  );
  // Request-sequence guard (as in useTypeahead): every new search or clear bumps
  // it, so a slower, older response can't overwrite newer results or land after
  // the customer has cleared the search.
  const searchSeqRef = useRef(0);
  const inputRef = useRef<TextInputInstance>(null);

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

      const seq = ++searchSeqRef.current;
      setQuery(term);
      setHasSearched(true);
      setIsSearching(true);
      setSearchError(null);
      setPage(1);
      setHasMore(false);
      setIsLoadingMore(false);
      loadingMoreRef.current = false;

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
        // results are filtered server-side, never in the client. `lat`/`lng` scope the
        // results to restaurants that deliver to the customer (see above).
        const params = { q: term, lat, lng, vegOnly: vegOnly || undefined };
        searchRef.current = params;
        const { restaurants, pagination } = await fetchRestaurants(params);
        if (searchSeqRef.current !== seq) return;
        setResults(restaurants);
        setPage(pagination.page);
        setHasMore(pagination.pages > pagination.page);
      } catch (err) {
        if (searchSeqRef.current !== seq) return;
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
        if (searchSeqRef.current === seq) setIsSearching(false);
      }
    },
    [refreshRecent, vegOnly, lat, lng],
  );

  // Next page of the current search (FlatList onEndReached). The ref guard stops
  // the duplicate end-reached events a fast fling fires; rows are de-duped by id
  // in case the server's ordering shifted between pages.
  const loadMore = useCallback(async () => {
    const params = searchRef.current;
    if (!params || !hasMore || isSearching || loadingMoreRef.current) return;
    const seq = searchSeqRef.current;
    const nextPage = page + 1;
    loadingMoreRef.current = true;
    setIsLoadingMore(true);
    try {
      const { restaurants, pagination } = await fetchRestaurants({ ...params, page: nextPage });
      if (searchSeqRef.current !== seq) return;
      setResults((prev) => {
        const seen = new Set(prev.map((r) => r._id));
        return [...prev, ...restaurants.filter((r) => !seen.has(r._id))];
      });
      setPage(pagination.page);
      setHasMore(pagination.pages > pagination.page);
    } catch (err) {
      if (searchSeqRef.current !== seq) return;
      // Keep what's already showing; the next end-reached retries this page.
      if (err instanceof ApiError && err.status >= 400 && err.status < 500) {
        logger.warn('search', `Search page ${nextPage} failed — ${err.status} ${err.code}`, {
          query: params.q,
          status: err.status,
          code: err.code,
        });
      } else {
        reportError('search', 'Restaurant search page failed', err, {
          query: params.q,
          page: nextPage,
        });
      }
    } finally {
      if (searchSeqRef.current === seq) {
        loadingMoreRef.current = false;
        setIsLoadingMore(false);
      }
    }
  }, [hasMore, isSearching, page]);

  // Run an incoming `?query=` exactly once per distinct value — a fresh tap on
  // a cuisine chip re-triggers this even while already on the Search tab.
  const appliedInitialQueryRef = useRef<string | null>(null);
  useEffect(() => {
    const q = initialQuery?.trim();
    if (!q || appliedInitialQueryRef.current === q) return;
    appliedInitialQueryRef.current = q;
    runSearch(q);
  }, [initialQuery, runSearch]);

  // This screen is a tab, so it stays mounted after the first visit — `autoFocus`
  // only fires on that first mount. Re-focus on every visit instead, so tapping
  // the Home search bar always drops the cursor in and opens the keyboard. A
  // `?query=` chip tap is about to run its own search, so it skips this rather
  // than stealing the keyboard from the results.
  useFocusEffect(
    useCallback(() => {
      if (initialQuery?.trim()) return;
      const timer = setTimeout(() => inputRef.current?.focus(), 50);
      return () => clearTimeout(timer);
    }, [initialQuery]),
  );

  // Editing the text after a search goes back to typing mode — live suggestions for what is
  // being typed. Without this the previous query's results stayed on screen under the new
  // text (the results for "South Indian" shown for "sandwich") until the search key was hit.
  const changeQuery = useCallback(
    (text: string) => {
      setQuery(text);
      if (!hasSearched) return;
      // Invalidate any search still in flight so it can't land on the new text.
      searchSeqRef.current++;
      loadingMoreRef.current = false;
      setHasSearched(false);
      setIsSearching(false);
      setIsLoadingMore(false);
      setHasMore(false);
      setResults([]);
      setSearchError(null);
    },
    [hasSearched],
  );

  // ── Voice search ──
  // Only in builds that carry speech recognition (src/lib/voiceSearch.ts); in Expo Go the mic
  // still just focuses the field.
  const [listening, setListening] = useState(false);
  const voiceRef = useRef<VoiceSearchSession | null>(null);
  useEffect(() => () => voiceRef.current?.cancel(), []);

  const onMicPress = useCallback(async () => {
    if (listening) {
      voiceRef.current?.stop();
      return;
    }
    if (!isVoiceSearchAvailable()) {
      // Re-focusing a field that is already focused doesn't bring Android's keyboard back
      // (it had been dismissed with Back) — blur first so the focus opens it again.
      inputRef.current?.blur();
      requestAnimationFrame(() => inputRef.current?.focus());
      return;
    }
    setListening(true);
    try {
      voiceRef.current = await startVoiceSearch({
        onPartial: (text) => changeQuery(text),
        onDone: (result) => {
          voiceRef.current = null;
          setListening(false);
          if (result.kind === 'text') {
            runSearch(result.text);
          } else if (result.kind === 'denied') {
            Alert.alert(
              'Microphone is off',
              'Allow microphone access for Yulo Stores in Settings to search by voice.',
              [
                { text: 'Not now', style: 'cancel' },
                { text: 'Open Settings', onPress: () => Linking.openSettings() },
              ],
            );
          } else if (result.kind === 'error') {
            logger.warn('search', 'Voice search failed', { reason: result.message });
            Alert.alert('Voice search stopped', 'Please try again, or type your search.');
          }
        },
      });
    } catch (err) {
      reportError('search', 'Could not start voice search', err);
      voiceRef.current = null;
      setListening(false);
      inputRef.current?.focus();
    }
  }, [listening, changeQuery, runSearch]);

  const clearSearch = useCallback(() => {
    // Invalidate any search still in flight so it can't land after the clear.
    searchSeqRef.current++;
    searchRef.current = null;
    loadingMoreRef.current = false;
    setIsSearching(false);
    setIsLoadingMore(false);
    setHasMore(false);
    setPage(1);
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
          message={
            located
              ? `No restaurant delivering to your address matched "${query.trim()}". Try a different term or change your delivery location.`
              : `Nothing matched "${query.trim()}". Try a different term.`
          }
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
        onEndReached={loadMore}
        onEndReachedThreshold={0.5}
        ListFooterComponent={
          isLoadingMore ? (
            <View style={styles.loadMoreFooter}>
              <ActivityIndicator size="small" color={t.accent} />
            </View>
          ) : undefined
        }
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
                onRemove={() =>
                  confirmThen(confirmAction, confirmCopy.removeRecentSearch(item.query), () =>
                    removeRecent(item.id),
                  )
                }
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
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <StatusBar style="dark" />
      <View style={styles.container}>
        {/* Header — back + search field */}
        <View style={styles.header}>
          <Pressable onPress={handleBack} hitSlop={8} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={22} color={Colors.foodText} />
          </Pressable>
          <View style={styles.searchBar}>
            <Ionicons name="search" size={18} color={t.accent} />
            <TextInput
              ref={inputRef}
              style={styles.input}
              placeholder={listening ? 'Listening…' : 'Search for restaurants and dishes'}
              placeholderTextColor={Colors.foodTextMuted}
              value={query}
              onChangeText={changeQuery}
              onSubmitEditing={() => runSearch(query)}
              returnKeyType="search"
              autoCapitalize="none"
              autoCorrect={false}
            />
            <View style={styles.searchDivider} />
            {listening ? (
              // While listening the spoken words fill the field, which would swap the mic for
              // the clear button — keep a stop control here instead.
              <Pressable
                onPress={onMicPress}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Stop voice search"
              >
                <Ionicons name="stop-circle" size={22} color={t.accent} />
              </Pressable>
            ) : query.length > 0 ? (
              <Pressable onPress={clearSearch} hitSlop={8}>
                <Ionicons name="close-circle" size={18} color={Colors.foodTextMuted} />
              </Pressable>
            ) : (
              // Listens in builds with speech recognition; in Expo Go (no native module) it
              // focuses the field instead — src/lib/voiceSearch.ts.
              <Pressable
                onPress={onMicPress}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Voice search"
              >
                <Image
                  source={require('../../assets/Images/Icons/Button - Voice search.png')}
                  style={styles.voiceIcon}
                  resizeMode="contain"
                />
              </Pressable>
            )}
          </View>
        </View>

        {!!vegBannerText && <VegBanner text={vegBannerText} />}

        {hasSearched ? renderResults() : isTyping ? renderTypeahead() : renderDiscovery()}

        {/* Absolutely placed, so the safe-area padding doesn't move it — lift it by the inset. */}
        <View style={[styles.cartBarSlot, { bottom: insets.bottom + Spacing.md }]} pointerEvents="box-none">
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
    paddingHorizontal: Spacing.md,
    height: 44,
    gap: Spacing.sm,
    ...Elevation.card,
  },
  input: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
    color: Colors.foodText,
    paddingVertical: 0,
  },
  searchDivider: {
    width: 1,
    height: 16,
    backgroundColor: Colors.foodBorderStrong,
  },
  voiceIcon: {
    width: 18,
    height: 18,
    tintColor: t.accent,
  },

  // ── Veg-mode confirmation pill ──
  vegBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    marginHorizontal: Spacing.base,
    marginTop: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: Colors.foodVegGreen,
    backgroundColor: Colors.foodPureVegBg,
  },
  vegBannerText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
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
    fontSize: 17,
    fontWeight: '700',
    color: Colors.foodText,
    letterSpacing: -0.2,
    marginBottom: Spacing.sm,
  },
  sectionTitleSpaced: {
    marginTop: Spacing.lg,
  },

  // Recent searches — a plain row (no card), per the Figma spec: just the icon,
  // the term, and the "x", with compact vertical rhythm doing the separation.
  recentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingVertical: Spacing.sm + 2,
  },
  recentText: {
    flex: 1,
    fontSize: 14,
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
  // Placeholder shape (RemoteImage's `style`) — a dashed circle, same footprint and
  // radius as the loaded photo so a missing image doesn't break the row's uniform look.
  tileImage: {
    width: TILE_SIZE,
    height: TILE_SIZE,
    borderRadius: TILE_SIZE / 2,
    borderWidth: 1,
    borderColor: Colors.foodBorder,
  },
  // Loaded-photo shape (RemoteImage's `imageStyle`) — masked to a circle with a hairline
  // ring, so every photo reads as the same size/radius/border regardless of source image.
  tileImageCircle: {
    width: TILE_SIZE,
    height: TILE_SIZE,
    borderRadius: TILE_SIZE / 2,
    borderWidth: 1,
    borderColor: Colors.foodBorder,
    backgroundColor: Colors.foodBgSecondary,
  },
  tileLabel: {
    marginTop: Spacing.xs,
    fontSize: 12,
    fontWeight: '600',
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
    marginTop: Spacing.sm,
    paddingVertical: Spacing.xs,
    ...Elevation.raised,
  },
  suggestionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.sm,
  },
  suggestionThumb: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.foodBgSecondary,
  },
  suggestionBody: { flex: 1, minWidth: 0, gap: 1 },
  suggestionNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  suggestionName: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: Colors.foodText,
  },
  suggestionNameMatch: {
    fontWeight: '800',
  },
  suggestionType: {
    fontSize: 11,
    color: Colors.foodTextMuted,
  },

  // ── Shared status / skeleton ──
  loadMoreFooter: { paddingVertical: Spacing.lg, alignItems: 'center' },
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
