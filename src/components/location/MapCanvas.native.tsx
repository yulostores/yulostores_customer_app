/**
 * MapCanvas — the interactive map backdrop for the location picker.
 *
 * Renders HERE map tiles (src/constants/Here.ts) through MapLibre
 * (`@maplibre/maplibre-react-native` — a native map renderer with no Google
 * Play Services dependency on Android, unlike react-native-maps, which is why
 * it was picked for a HERE-only stack). This replaces the static fallback
 * panel that stood in here while no map library was installed; the component
 * keeps the exact same public API (`MapCanvasHandle.animateTo`, the
 * `onCenter*`/`onMovingChange` props) so the caller — app/location/map.tsx's
 * drag-to-pin flow — needed no changes at all.
 *
 *   <MapCanvas ref={mapRef} initialCenter={coords} onCenterSettled={geocode} />
 *   mapRef.current?.animateTo(coords)   // flies the camera there
 *
 * The "pin" itself is NOT drawn by this component — app/location/map.tsx
 * overlays its own fixed, screen-centered <CenterPin/> on top and reads the
 * coordinate underneath it from onCenterChange/onCenterSettled. That's why
 * this component only ever needs to report camera state, never render a marker.
 */

import { Camera, Map, type CameraRef } from '@maplibre/maplibre-react-native';
import { forwardRef, useImperativeHandle, useRef } from 'react';
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { hereStyle } from '../../constants/Here';
import type { LatLng } from '../../types/address';

export interface MapCanvasHandle {
  animateTo: (center: LatLng, zoom?: number) => void;
}

interface Props {
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

/** MapLibre reports coordinates as `[lng, lat]` — everywhere else in this app
 *  (LatLng, the geocoding layer) uses `{latitude, longitude}`. */
function toLatLng([longitude, latitude]: [number, number]): LatLng {
  return { latitude, longitude };
}

const DEFAULT_ZOOM = 15;

const MapCanvas = forwardRef<MapCanvasHandle, Props>(function MapCanvas(
  { initialCenter, initialZoom = DEFAULT_ZOOM, onCenterChange, onCenterSettled, onMovingChange, style },
  ref,
) {
  const cameraRef = useRef<CameraRef>(null);

  useImperativeHandle(ref, () => ({
    animateTo: (center, zoom) => {
      cameraRef.current?.flyTo({
        center: [center.longitude, center.latitude],
        zoom,
        duration: 500,
      });
    },
  }));

  return (
    <Map
      style={[styles.map, style]}
      mapStyle={hereStyle()}
      onRegionWillChange={() => onMovingChange?.(true)}
      onRegionIsChanging={(e) => onCenterChange?.(toLatLng(e.nativeEvent.center))}
      onRegionDidChange={(e) => {
        onMovingChange?.(false);
        onCenterSettled?.(toLatLng(e.nativeEvent.center));
      }}
    >
      <Camera
        ref={cameraRef}
        initialViewState={{
          center: [initialCenter.longitude, initialCenter.latitude],
          zoom: initialZoom,
        }}
      />
    </Map>
  );
});

export default MapCanvas;

const styles = StyleSheet.create({
  map: { flex: 1 },
});
