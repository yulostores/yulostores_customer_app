/**
 * TrackingMap (native) — the live map on app/order/[id]/track.tsx.
 *
 * Draws the partner's marker wherever `partnerLocation` currently is (updated
 * in real time by useOrderTracking's `partner_location_updated` socket
 * listener, with a 30s REST-poll fallback baked into that hook already) and a
 * fixed destination marker at the delivery address. Camera auto-fits both the
 * moment they're both known.
 *
 * No route polyline yet — the backend has no real routing engine (see
 * yulo_backend's geo.service.js), only straight-line distance, so a drawn
 * line here would falsely suggest a road-accurate path. Worth adding once
 * real routing exists.
 *
 * Split into .native/.web (see TrackingMap.web.tsx) because
 * @maplibre/maplibre-react-native has no web implementation at all — a plain
 * `import` of it on web throws a fatal, uncaught exception the instant this
 * module loads. Metro's platform-extension resolution means web never
 * evaluates this file's imports in the first place.
 */

import { Camera, Map, Marker, type CameraRef } from '@maplibre/maplibre-react-native';
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { Colors } from '../../constants/Colors';
import { hereStyle } from '../../constants/Here';
import { Shadows } from '../../constants/Theme';
import { useAccentTheme } from '../../hooks/useAccentTheme';
import type { PartnerLocation } from '../../services/tracking';

interface Props {
  partnerLocation: PartnerLocation | null;
  /** GeoJSON order: [lng, lat]. */
  destination: [number, number] | null | undefined;
  restaurant: { lat: number; lng: number } | null;
}

export default function TrackingMap({ partnerLocation, destination, restaurant }: Props) {
  const { accent } = useAccentTheme();
  const cameraRef = useRef<CameraRef>(null);

  // Fallback center when neither the partner nor the destination is known yet
  // (e.g. order just placed, no assignment) — the restaurant, then a sane
  // default so the map never renders with an undefined camera.
  const fallbackCenter: [number, number] = restaurant
    ? [restaurant.lng, restaurant.lat]
    : [77.209, 28.6139]; // New Delhi — same default as src/lib/geo.ts's DEFAULT_REGION

  useEffect(() => {
    if (!partnerLocation || !destination) return;
    const lngs = [partnerLocation.lng, destination[0]];
    const lats = [partnerLocation.lat, destination[1]];
    cameraRef.current?.fitBounds(
      [Math.min(...lngs), Math.min(...lats), Math.max(...lngs), Math.max(...lats)],
      { padding: { top: 60, right: 60, bottom: 60, left: 60 }, duration: 500 },
    );
  }, [partnerLocation, destination]);

  return (
    <Map style={styles.map} mapStyle={hereStyle()}>
      <Camera
        ref={cameraRef}
        initialViewState={{
          center: destination ?? fallbackCenter,
          zoom: 13,
        }}
      />

      {partnerLocation && (
        <Marker lngLat={[partnerLocation.lng, partnerLocation.lat]} anchor="center">
          <View style={styles.bikeIconBg}>
            <Ionicons name="bicycle" size={22} color={Colors.white} />
          </View>
        </Marker>
      )}

      {destination && (
        <Marker lngLat={destination} anchor="center">
          <View style={[styles.destinationDot, { backgroundColor: accent }]}>
            <View style={styles.destinationInner} />
          </View>
        </Marker>
      )}
    </Map>
  );
}

const styles = StyleSheet.create({
  map: { flex: 1 },
  bikeIconBg: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.info,
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadows.md,
  },
  destinationDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 3,
    borderColor: Colors.white,
    ...Shadows.sm,
  },
  destinationInner: {
    flex: 1,
    borderRadius: 99,
  },
});
