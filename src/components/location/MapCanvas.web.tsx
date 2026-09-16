/**
 * MapCanvas (web) — non-crashing stand-in for the browser.
 *
 * `@maplibre/maplibre-react-native` (used by MapCanvas.native.tsx) has no web
 * implementation at all — importing it on web throws
 * `codegenNativeComponent is not a function` as a FATAL, uncaught exception
 * the moment this module loads, taking down the whole screen. Metro's
 * platform-extension resolution (`.native.tsx` vs `.web.tsx`) means web never
 * even evaluates that import: this file is a complete stand-in with the same
 * public API (`MapCanvasHandle.animateTo`, the `onCenter*`/`onMovingChange`
 * props) as the native version, so app/location/map.tsx needs no changes to
 * work on either platform.
 *
 * "Use current location" and the search flow still work here — they don't
 * depend on the map actually rendering, only on this component not crashing.
 * A real interactive web map (maplibre-gl, which — unlike this native
 * package — does support browsers) is a separate, larger follow-up if wanted.
 */

import { Ionicons } from '@expo/vector-icons';
import { forwardRef, useImperativeHandle } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Colors } from '../../constants/Colors';
import type { LatLng } from '../../types/address';

export interface MapCanvasHandle {
  animateTo: (center: LatLng, zoom?: number) => void;
}

interface Props {
  initialCenter: LatLng;
  initialZoom?: number;
  onCenterChange?: (center: LatLng) => void;
  onCenterSettled?: (center: LatLng) => void;
  onMovingChange?: (moving: boolean) => void;
  style?: StyleProp<ViewStyle>;
}

const MapCanvas = forwardRef<MapCanvasHandle, Props>(function MapCanvas({ style }: Props, ref) {
  useImperativeHandle(ref, () => ({ animateTo: () => {} }));

  return (
    <View style={[styles.fallback, style]}>
      <Ionicons name="map-outline" size={30} color={Colors.foodTextMuted} />
      <Text style={styles.fallbackText}>
        Live map preview isn&apos;t available on web yet.{'\n'}Use &quot;Use current location&quot;
        or search to set your pin.
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
