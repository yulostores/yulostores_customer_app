/**
 * MapCanvasFallback — static stand-in for the drag-to-pin map, plus the
 * MapCanvas public types every platform variant shares.
 *
 * Rendered wherever a real map can't be: on web (MapLibre has no web build —
 * see MapCanvas.web.tsx) and on a native binary that doesn't contain
 * MapLibre's native code (see src/lib/mapLibre.ts). It keeps MapCanvas's API
 * so app/location/map.tsx works unchanged: "Use current location", search and
 * confirm still set the pin; only dragging the map is unavailable.
 */

import { Ionicons } from '@expo/vector-icons';
import { forwardRef, useImperativeHandle } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Colors } from '../../constants/Colors';
import type { LatLng } from '../../types/address';

export interface MapCanvasHandle {
  animateTo: (center: LatLng, zoom?: number) => void;
}

export interface MapCanvasProps {
  initialCenter: LatLng;
  initialZoom?: number;
  /** Fires on every camera frame while dragging (not debounced). */
  onCenterChange?: (center: LatLng) => void;
  /** Fires once the camera has been still for a moment. */
  onCenterSettled?: (center: LatLng) => void;
  /** True while the camera is in motion. */
  onMovingChange?: (moving: boolean) => void;
  style?: StyleProp<ViewStyle>;
}

const MapCanvasFallback = forwardRef<MapCanvasHandle, MapCanvasProps & { message: string }>(
  function MapCanvasFallback({ style, message }, ref) {
    useImperativeHandle(ref, () => ({ animateTo: () => {} }));

    return (
      <View style={[styles.fallback, style]}>
        <Ionicons name="map-outline" size={30} color={Colors.foodTextMuted} />
        <Text style={styles.fallbackText}>{message}</Text>
      </View>
    );
  },
);

export default MapCanvasFallback;

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
