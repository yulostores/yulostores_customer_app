/**
 * TrackingMapFallback — static stand-in for the live tracking map, plus the
 * TrackingMap props every platform variant shares.
 *
 * Rendered on web (MapLibre has no web build — see TrackingMap.web.tsx) and on
 * a native binary that doesn't contain MapLibre's native code (see
 * src/lib/mapLibre.ts). Everything else on the tracking screen — status
 * timeline, partner card, ETA — keeps working; only the visual map is missing.
 */

import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import { Colors } from '../../constants/Colors';
import type { PartnerLocation } from '../../services/tracking';

export interface TrackingMapProps {
  /** Live rider position. `heading` is null when the device reported none. */
  partnerLocation: PartnerLocation | null;
  /** GeoJSON order: [lng, lat]. */
  destination: [number, number] | null | undefined;
  restaurant: { lat: number; lng: number } | null;
  /**
   * HERE flexible polyline for the leg currently in progress, or null when the backend could not
   * route. Null draws no line at all rather than a straight one between the markers — a fake
   * path is worse than no path, because customers read it as the road the rider is actually on.
   */
  routePolyline?: string | null;
  /** Drives which leg is emphasised and how the rider marker is coloured. */
  assignmentStatus?: string;
}

export default function TrackingMapFallback({ message }: { message: string }) {
  return (
    <View style={styles.fallback}>
      <Ionicons name="map-outline" size={28} color={Colors.white} />
      <Text style={styles.text}>{message}</Text>
      <Text style={styles.subtext}>Status and partner details below are still live.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: '#2b2f36',
  },
  text: { color: Colors.white, fontSize: 13, fontWeight: '700', marginTop: 6 },
  subtext: { color: Colors.white, fontSize: 11.5, opacity: 0.75 },
});
