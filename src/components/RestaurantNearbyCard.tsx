/**
 * RestaurantNearbyCard — the full-width restaurant card from Home's "Restaurants near you",
 * also used by the "See all" list (app/restaurants/nearby.tsx) so both look the same.
 * Moved out of app/(tabs)/index.tsx unchanged.
 */

import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Colors } from '../constants/Colors';
import { BorderRadius, Elevation, Spacing } from '../constants/Theme';
import { useFavoriteToggle } from '../hooks/useFavoriteToggle';
import { deliveryEtaWindow } from '../lib/deliveryEta';
import type { Restaurant } from '../types/restaurant';
import { FoodTypeMark } from './FoodTypeMark';
import { RemoteImage } from './RemoteImage';

function formatPrice(price: number): string {
  return '₹' + price.toLocaleString('en-IN');
}

function formatDistance(distanceKm: number | undefined): string | null {
  if (distanceKm == null || !Number.isFinite(distanceKm)) return null;
  return distanceKm < 1
    ? `${Math.round(distanceKm * 1000)} m`
    : `${distanceKm.toFixed(1)} km`;
}

/** Vertical restaurant card (for "Restaurants near you") */
export default function RestaurantNearbyCard({ restaurant }: { restaurant: Restaurant }) {
  const { favorited: liked, toggle: toggleFavorite } = useFavoriteToggle(
    'restaurant',
    restaurant._id,
    restaurant.isFavorited,
  );

  const eta = deliveryEtaWindow(restaurant.deliveryMinutes, restaurant.distanceKm);
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

const styles = StyleSheet.create({
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
  nearbyDot: {
    fontSize: 12,
    color: Colors.foodTextMuted,
  },
  nearbyMetaText: {
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
});
