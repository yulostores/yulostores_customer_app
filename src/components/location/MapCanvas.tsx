/**
 * MapCanvas — static backdrop for the location picker.
 *
 * Interactive maps are disabled in this build (no `expo-maps`, no Google Maps
 * key). This component keeps the API the picker screen expects —
 * `MapCanvasHandle.animateTo` plus the `onCenter*` / `onMovingChange` props — so
 * the rest of the flow (GPS recentre → reverse-geocode → confirm) keeps working;
 * it just renders a non-interactive panel instead of a live map.
 *
 *   <MapCanvas ref={mapRef} initialCenter={coords} onCenterSettled={geocode} />
 *   mapRef.current?.animateTo(coords)   // no-op while maps are disabled
 */

import { forwardRef, useImperativeHandle } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/Colors';
import type { LatLng } from '../../types/address';

export interface MapCanvasHandle {
  animateTo: (center: LatLng, zoom?: number) => void;
}

interface Props {
  initialCenter: LatLng;
  initialZoom?: number;
  /** Fires on every camera frame while dragging (not debounced). */
  onCenterChange?: (center: LatLng) => void;
  /** Fires once the camera has been still for ~280 ms. */
  onCenterSettled?: (center: LatLng) => void;
  /** True while the camera is in motion. */
  onMovingChange?: (moving: boolean) => void;
  style?: StyleProp<ViewStyle>;
}

const MapCanvas = forwardRef<MapCanvasHandle, Props>(function MapCanvas({ style }: Props, ref) {
  // No live camera to drive — expose a no-op so callers (recentre-to-GPS) don't
  // crash. The picker still resolves the address from `initialCenter` and from
  // the GPS fix directly, so the flow completes without a map.
  useImperativeHandle(ref, () => ({ animateTo: () => {} }));

  return (
    <View style={[styles.fallback, style]}>
      <Ionicons name="map-outline" size={30} color={Colors.foodTextMuted} />
      <Text style={styles.fallbackText}>
        Map preview is unavailable.{'\n'}Use “Use current location” to set your pin.
      </Text>
    </View>
  );
});

export default MapCanvas;

const styles = StyleSheet.create({
  fallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: Colors.locMapWash,
  },
  fallbackText: {
    marginTop: 10,
    textAlign: 'center',
    fontSize: 12.5,
    lineHeight: 18,
    color: Colors.foodTextMuted,
  },
});
