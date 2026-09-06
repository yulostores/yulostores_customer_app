/**
 * MapCanvas — one cross-platform interactive map for the picker.
 *
 * Android → Google Maps, iOS → Apple Maps (via `expo-maps`). Any other target
 * (web, Expo Go without the native module) gets a static fallback so the rest
 * of the screen still works.
 *
 * expo-maps has no "camera idle" event, so we synthesise one: every
 * `onCameraMove` re-arms a short timer; when it fires the camera has settled and
 * we report the resting centre for geocoding.
 *
 *   <MapCanvas
 *     ref={mapRef}
 *     initialCenter={coords}
 *     onMovingChange={setMoving}
 *     onCenterSettled={geocode}
 *   />
 *   mapRef.current?.animateTo(coords)
 */

import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useMemo,
  useRef,
} from 'react';
import { Platform, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/Colors';
import { DEFAULT_ZOOM } from '../../lib/geo';
import type { LatLng } from '../../types/address';

// `expo-maps` ships native code that is absent from Expo Go and from any dev
// build made before the package was added. Importing it there throws at module
// load (`Cannot find native module 'ExpoMaps'`), which would take down the whole
// route — so pull it in defensively and let the static fallback below cover the
// miss. A proper development build restores the real map.
let AppleMaps: any;
let GoogleMaps: any;
try {
  ({ AppleMaps, GoogleMaps } = require('expo-maps'));
} catch {
  AppleMaps = undefined;
  GoogleMaps = undefined;
}

const SETTLE_MS = 280;

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

interface CameraMoveEvent {
  coordinates: LatLng;
  zoom?: number;
}

const nativeAvailable =
  Platform.OS === 'android' ? !!GoogleMaps?.View : Platform.OS === 'ios' ? !!AppleMaps?.View : false;

const MapCanvas = forwardRef<MapCanvasHandle, Props>(function MapCanvas(
  { initialCenter, initialZoom = DEFAULT_ZOOM, onCenterChange, onCenterSettled, onMovingChange, style },
  ref,
) {
  const nativeRef = useRef<any>(null);
  const zoomRef = useRef(initialZoom);
  const centerRef = useRef(initialCenter);
  const movingRef = useRef(false);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Frozen at mount so a re-render never yanks the camera back — programmatic
  // moves go through the imperative handle instead.
  const initialCamera = useMemo(
    () => ({ coordinates: initialCenter, zoom: initialZoom }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  useImperativeHandle(ref, () => ({
    animateTo: (center, zoom) => {
      centerRef.current = center;
      const z = zoom ?? zoomRef.current;
      nativeRef.current?.setCameraPosition?.({ coordinates: center, zoom: z, duration: 450 });
    },
  }));

  const handleCameraMove = useCallback(
    (e: CameraMoveEvent) => {
      if (!e?.coordinates) return;
      centerRef.current = e.coordinates;
      if (typeof e.zoom === 'number') zoomRef.current = e.zoom;
      onCenterChange?.(e.coordinates);

      if (!movingRef.current) {
        movingRef.current = true;
        onMovingChange?.(true);
      }
      if (settleTimer.current) clearTimeout(settleTimer.current);
      settleTimer.current = setTimeout(() => {
        movingRef.current = false;
        onMovingChange?.(false);
        onCenterSettled?.(centerRef.current);
      }, SETTLE_MS);
    },
    [onCenterChange, onCenterSettled, onMovingChange],
  );

  if (!nativeAvailable) {
    return (
      <View style={[styles.fallback, style]}>
        <Ionicons name="map-outline" size={30} color={Colors.foodTextMuted} />
        <Text style={styles.fallbackText}>
          Interactive map needs a development build{'\n'}(not available in Expo Go / web)
        </Text>
      </View>
    );
  }

  if (Platform.OS === 'ios') {
    return (
      <AppleMaps.View
        ref={nativeRef}
        style={[styles.map, style]}
        cameraPosition={initialCamera}
        onCameraMove={handleCameraMove as any}
        properties={{ isMyLocationEnabled: true, selectionEnabled: false }}
        uiSettings={{ compassEnabled: false, myLocationButtonEnabled: false, scaleBarEnabled: false }}
      />
    );
  }

  return (
    <GoogleMaps.View
      ref={nativeRef}
      style={[styles.map, style]}
      cameraPosition={initialCamera}
      onCameraMove={handleCameraMove as any}
      properties={{ isMyLocationEnabled: true, isBuildingEnabled: true, selectionEnabled: false }}
      uiSettings={{
        compassEnabled: false,
        mapToolbarEnabled: false,
        myLocationButtonEnabled: false,
        zoomControlsEnabled: false,
        rotationGesturesEnabled: false,
        tiltGesturesEnabled: false,
        scaleBarEnabled: false,
      }}
    />
  );
});

export default MapCanvas;

const styles = StyleSheet.create({
  map: { flex: 1 },
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
