/**
 * MapLibreTrackingMap — the real live map on app/order/[id]/track.tsx.
 *
 * Draws three things and keeps them honest:
 *
 *   1. The road route for the leg in progress. The backend returns a HERE flexible polyline
 *      (see yulo_backend's routing.service.js); this decodes it with src/lib/flexiblePolyline.ts
 *      and draws it as a line layer. When routing is unavailable the polyline is null and NO line
 *      is drawn — never a straight line between the markers, which customers read as the road the
 *      rider is on.
 *   2. A rider marker that moves instead of teleporting. Pings arrive every few seconds, so a
 *      marker bound straight to the latest coordinate jumps. MapLibre's own AnimatedPoint eases
 *      between fixes on the Animated runtime, so this costs no React re-renders, and the icon
 *      rotates to the direction of travel.
 *   3. A camera that yields. Re-fitting the bounds on every ping means panning away snaps back a
 *      second later; touching the map hands control to the customer until they ask for it back.
 *
 * Never import this file directly: TrackingMap.native.tsx `require`s it only once
 * src/lib/mapLibre.ts has confirmed MapLibre's native code is in the binary, because evaluating
 * this module's imports throws otherwise.
 */

import {
  Animated as MapLibreAnimated,
  Camera,
  GeoJSONSource,
  Layer,
  Map,
  Marker,
  type CameraRef,
  type ViewStateChangeEvent,
} from '@maplibre/maplibre-react-native';
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, View, type NativeSyntheticEvent } from 'react-native';
import { Colors } from '../../constants/Colors';
import { hereStyle } from '../../constants/Here';
import { Shadows } from '../../constants/Theme';
import { bearingBetween } from '../../lib/geo';
import { decodeFlexiblePolyline, toLngLatPairs } from '../../lib/flexiblePolyline';
import { useAccentTheme } from '../../hooks/useAccentTheme';
import type { TrackingMapProps } from './TrackingMapFallback';

// Long enough to read as movement rather than a jump, short enough that the marker has settled
// before the next ping lands. Pings arrive every ~15s from the partner app.
const MARKER_EASE_MS = 1200;

// Keeps the fitted route clear of the back button up top and the status card that overlaps the
// bottom edge of the map zone.
const FIT_PADDING = { top: 80, right: 64, bottom: 80, left: 64 };

const ROUTE_SOURCE_ID = 'tracking-route';

/** New Delhi — the same default as src/lib/geo.ts's DEFAULT_REGION. */
const FALLBACK_CENTER: [number, number] = [77.209, 28.6139];

export default function MapLibreTrackingMap({
  partnerLocation,
  destination,
  restaurant,
  routePolyline,
  assignmentStatus,
}: TrackingMapProps) {
  const { accent } = useAccentTheme();
  const cameraRef = useRef<CameraRef>(null);

  // Camera ownership. Starts with us so the map opens framed on the journey; the first gesture
  // hands it to the customer, and the recentre button takes it back. Without this the map fights
  // anyone trying to look ahead at their own street.
  const [following, setFollowing] = useState(true);

  const routeCoordinates = useMemo(
    () => toLngLatPairs(decodeFlexiblePolyline(routePolyline)),
    [routePolyline],
  );

  const routeShape = useMemo(
    () =>
      ({
        type: 'Feature' as const,
        properties: {},
        geometry: { type: 'LineString' as const, coordinates: routeCoordinates },
      }),
    [routeCoordinates],
  );

  // ─── Rider marker: position ──────────────────────────────────────────────
  // AnimatedPoint is MapLibre's own animated GeoJSON point. It is driven by the Animated runtime
  // rather than by React state, so easing the marker between fixes re-renders nothing.
  const riderPoint = useRef(
    new MapLibreAnimated.Point({
      type: 'Point',
      coordinates: partnerLocation
        ? [partnerLocation.lng, partnerLocation.lat]
        : FALLBACK_CENTER,
    }),
  ).current;

  // ─── Rider marker: rotation ──────────────────────────────────────────────
  // Held as a cumulative value rather than a 0-360 compass bearing so the marker takes the short
  // way round: 350° to 10° must rotate +20°, not -340°, or the icon spins backwards across the
  // screen every time the rider passes through north.
  const rotation = useRef(new Animated.Value(0)).current;
  const cumulativeRotation = useRef(0);
  const previousFix = useRef<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    if (!partnerLocation) return;

    riderPoint
      .timing({
        toValue: { type: 'Point', coordinates: [partnerLocation.lng, partnerLocation.lat] },
        duration: MARKER_EASE_MS,
        easing: Easing.linear,
      })
      .start();

    // Prefer the device's own heading; fall back to the direction between the last two fixes,
    // which is all we have when a stationary phone reports no heading.
    const previous = previousFix.current;
    const heading =
      partnerLocation.heading ??
      (previous && (previous.lat !== partnerLocation.lat || previous.lng !== partnerLocation.lng)
        ? bearingBetween(
            { latitude: previous.lat, longitude: previous.lng },
            { latitude: partnerLocation.lat, longitude: partnerLocation.lng },
          )
        : null);

    if (heading != null) {
      // Shortest signed turn from where the icon currently points to where it should point.
      const currentHeading = ((cumulativeRotation.current % 360) + 360) % 360;
      const delta = ((heading - currentHeading + 540) % 360) - 180;
      cumulativeRotation.current += delta;

      Animated.timing(rotation, {
        toValue: cumulativeRotation.current,
        duration: MARKER_EASE_MS,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }).start();
    }

    previousFix.current = { lat: partnerLocation.lat, lng: partnerLocation.lng };
  }, [partnerLocation, riderPoint, rotation]);

  // ─── Camera ──────────────────────────────────────────────────────────────
  // Frames whatever is currently meaningful: the whole route when we have one, otherwise the two
  // points we know about. Re-runs on every ping, but only while we still own the camera.
  useEffect(() => {
    if (!following || !cameraRef.current) return;

    const points: [number, number][] = routeCoordinates.length
      ? routeCoordinates
      : ([
          partnerLocation ? [partnerLocation.lng, partnerLocation.lat] : null,
          destination ?? null,
        ].filter(Boolean) as [number, number][]);

    if (points.length < 2) return;

    const lngs = points.map((p) => p[0]);
    const lats = points.map((p) => p[1]);
    cameraRef.current.fitBounds(
      [Math.min(...lngs), Math.min(...lats), Math.max(...lngs), Math.max(...lats)],
      { padding: FIT_PADDING, duration: 600 },
    );
  }, [following, routeCoordinates, partnerLocation, destination]);

  // MapLibre reports whether a viewport change came from a gesture, which is exactly the
  // distinction needed here — our own fitBounds above must not be mistaken for the customer
  // panning and switch follow off the moment it engages.
  const onRegionWillChange = (event: NativeSyntheticEvent<ViewStateChangeEvent>) => {
    if (event.nativeEvent.userInteraction) setFollowing(false);
  };

  // Where to open before any live data arrives: the destination, then the restaurant, then a sane
  // default so the map never mounts with an undefined camera.
  const initialCenter: [number, number] =
    destination ?? (restaurant ? [restaurant.lng, restaurant.lat] : FALLBACK_CENTER);

  const riderIsCarryingFood = assignmentStatus === 'picked_up';

  return (
    <View style={styles.container}>
      <Map
        style={styles.map}
        mapStyle={hereStyle()}
        onRegionWillChange={onRegionWillChange}
        // Rotating or tilting a tracking map only ever makes the route harder to read, and both
        // gestures are easy to trigger by accident while pinching to zoom.
        touchRotate={false}
        touchPitch={false}
      >
        <Camera ref={cameraRef} initialViewState={{ center: initialCenter, zoom: 13 }} />

        {/* Casing under the route line. Two stacked layers rather than one is what keeps a route
            legible where it crosses a same-coloured road on the tiles underneath. */}
        {routeCoordinates.length > 1 && (
          <GeoJSONSource id={ROUTE_SOURCE_ID} data={routeShape}>
            <Layer
              id="tracking-route-casing"
              type="line"
              source={ROUTE_SOURCE_ID}
              layout={{ 'line-cap': 'round', 'line-join': 'round' }}
              paint={{ 'line-color': Colors.white, 'line-width': 9, 'line-opacity': 0.9 }}
            />
            <Layer
              id="tracking-route-line"
              type="line"
              source={ROUTE_SOURCE_ID}
              layout={{ 'line-cap': 'round', 'line-join': 'round' }}
              paint={{ 'line-color': accent, 'line-width': 5 }}
            />
          </GeoJSONSource>
        )}

        {restaurant && (
          <Marker lngLat={[restaurant.lng, restaurant.lat]} anchor="center">
            <View style={styles.restaurantPin}>
              <Ionicons name="restaurant" size={13} color={Colors.white} />
            </View>
          </Marker>
        )}

        {destination && (
          <Marker lngLat={destination} anchor="center">
            <View style={[styles.destinationDot, { backgroundColor: accent }]} />
          </Marker>
        )}

        {partnerLocation && (
          <MapLibreAnimated.Marker lngLat={riderPoint as never} anchor="center">
            <Animated.View
              style={[
                styles.riderPin,
                {
                  backgroundColor: riderIsCarryingFood ? accent : Colors.info,
                  transform: [
                    {
                      rotate: rotation.interpolate({
                        inputRange: [0, 360],
                        outputRange: ['0deg', '360deg'],
                      }),
                    },
                  ],
                },
              ]}
            >
              <Ionicons name="navigate" size={18} color={Colors.white} />
            </Animated.View>
          </MapLibreAnimated.Marker>
        )}
      </Map>

      {/* Only offered once it would actually do something — an always-visible button that is
          usually a no-op trains people to ignore it. */}
      {!following && (
        <Pressable style={styles.recentreBtn} onPress={() => setFollowing(true)} hitSlop={10}>
          <Ionicons name="locate" size={18} color={Colors.foodText} />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },
  riderPin: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 2.5,
    borderColor: Colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadows.md,
  },
  restaurantPin: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: Colors.foodText,
    borderWidth: 2,
    borderColor: Colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadows.sm,
  },
  destinationDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 4,
    borderColor: Colors.white,
    ...Shadows.sm,
  },
  recentreBtn: {
    position: 'absolute',
    right: 14,
    bottom: 14,
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: Colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadows.md,
  },
});
