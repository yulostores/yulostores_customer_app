import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors } from '../../src/constants/Colors';
import { BorderRadius, Spacing } from '../../src/constants/Theme';
import { reportError } from '../../src/lib/logger';
import type { Restaurant } from '../../src/types/restaurant';
import { fetchRestaurants } from '../../src/services/restaurants';

export default function SearchScreen() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Restaurant[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const handleSearch = useCallback(async () => {
    if (!query.trim()) return;
    setIsSearching(true);
    setHasSearched(true);
    setSearchError(null);
    try {
      // `q` — not `cuisine`: the list endpoint has no cuisine filter, and any
      // request without `q` is treated as a geo-browse and 400s without lat/lng.
      // `q` already matches cuisine names as well as restaurant names.
      const { restaurants } = await fetchRestaurants({ q: query.trim() });
      setResults(restaurants);
    } catch (err) {
      reportError('search', 'Restaurant search failed', err, { query: query.trim() });
      setResults([]);
      setSearchError(
        err instanceof Error && err.message
          ? err.message
          : "Couldn't run that search. Check your connection and try again.",
      );
    } finally {
      setIsSearching(false);
    }
  }, [query]);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.container}>
        {/* Header */}
        <Text style={styles.title}>Search</Text>
        <Text style={styles.subtitle}>Find restaurants & cuisines</Text>

        {/* Search Bar */}
        <View style={styles.searchBar}>
          <Ionicons name="search-outline" size={20} color={Colors.foodTextMuted} />
          <TextInput
            style={styles.input}
            placeholder="Search restaurants, cuisines..."
            placeholderTextColor={Colors.foodTextMuted}
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={handleSearch}
            returnKeyType="search"
            autoCapitalize="none"
          />
          {query.length > 0 && (
            <Pressable onPress={() => { setQuery(''); setResults([]); setHasSearched(false); setSearchError(null); }}>
              <Ionicons name="close-circle" size={20} color={Colors.foodTextMuted} />
            </Pressable>
          )}
        </View>

        {/* Results */}
        {isSearching ? (
          <View style={styles.centerBox}>
            <ActivityIndicator size="large" color={Colors.foodAccent} />
          </View>
        ) : searchError ? (
          <View style={styles.centerBox}>
            <Ionicons name="cloud-offline-outline" size={56} color={Colors.foodBorder} />
            <Text style={styles.emptyText}>Search didn&apos;t work</Text>
            <Text style={styles.emptySubtext}>{searchError}</Text>
            <Pressable style={styles.retryBtn} onPress={handleSearch}>
              <Text style={styles.retryBtnText}>Try again</Text>
            </Pressable>
          </View>
        ) : hasSearched && results.length === 0 ? (
          <View style={styles.centerBox}>
            <Ionicons name="search-outline" size={56} color={Colors.foodBorder} />
            <Text style={styles.emptyText}>No restaurants found</Text>
            <Text style={styles.emptySubtext}>Try a different search term</Text>
          </View>
        ) : !hasSearched ? (
          <View style={styles.centerBox}>
            <Ionicons name="restaurant-outline" size={56} color={Colors.foodBorder} />
            <Text style={styles.emptyText}>Discover Restaurants</Text>
            <Text style={styles.emptySubtext}>Search by name or cuisine type</Text>
          </View>
        ) : (
          <FlatList
            data={results}
            keyExtractor={(r) => r._id}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
            renderItem={({ item }) => (
              <Pressable style={styles.card}>
                {item.logo ? (
                  <Image source={{ uri: item.logo }} style={styles.cardImage} />
                ) : (
                  <View style={[styles.cardImage, styles.cardImagePlaceholder]}>
                    <Ionicons name="restaurant" size={24} color={Colors.foodTextMuted} />
                  </View>
                )}
                <View style={styles.cardBody}>
                  <Text style={styles.cardName} numberOfLines={1}>{item.name}</Text>
                  <Text style={styles.cardCuisine} numberOfLines={1}>
                    {item.cuisineType.join(' • ')}
                  </Text>
                  <View style={styles.ratingRow}>
                    <View style={styles.ratingBadge}>
                      <Ionicons name="star" size={10} color="#FFF" />
                      <Text style={styles.ratingText}>{item.avgRating?.toFixed(1) ?? '—'}</Text>
                    </View>
                    <Text style={styles.cardMeta}>
                      {item.totalRatings ?? 0} ratings
                    </Text>
                  </View>
                </View>
              </Pressable>
            )}
          />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.foodBg },
  container: { flex: 1, backgroundColor: Colors.foodBg },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: Colors.foodText,
    paddingHorizontal: Spacing.base,
    paddingTop: Spacing.md,
  },
  subtitle: {
    fontSize: 14,
    color: Colors.foodTextMuted,
    paddingHorizontal: Spacing.base,
    marginBottom: Spacing.md,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.foodSearchBg,
    borderRadius: BorderRadius.lg,
    marginHorizontal: Spacing.base,
    paddingHorizontal: Spacing.md,
    height: 48,
    marginBottom: Spacing.base,
    gap: Spacing.sm,
  },
  input: {
    flex: 1,
    fontSize: 15,
    color: Colors.foodText,
  },
  centerBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingBottom: 80,
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
    paddingHorizontal: Spacing.xl,
  },
  retryBtn: {
    marginTop: Spacing.md,
    backgroundColor: Colors.foodAccent,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
  },
  retryBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.white,
  },
  list: {
    paddingHorizontal: Spacing.base,
    gap: Spacing.md,
    paddingBottom: 20,
  },
  card: {
    flexDirection: 'row',
    backgroundColor: Colors.foodCardBg,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.foodBorder,
    padding: Spacing.md,
    gap: Spacing.md,
    alignItems: 'center',
  },
  cardImage: {
    width: 60,
    height: 60,
    borderRadius: BorderRadius.md,
  },
  cardImagePlaceholder: {
    backgroundColor: Colors.foodSearchBg,
    alignItems: 'center',
    justifyContent: 'center',
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
});
