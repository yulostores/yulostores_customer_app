/**
 * MapLibreCanvas — the real interactive map backdrop for the location picker.
 *
 * Renders HERE map tiles (src/constants/Here.ts) through MapLibre
 * (`@maplibre/maplibre-react-native` — a native map renderer with no Google
 * Play Services dependency on Android, unlike react-native-maps, which is why
 * it was picked for a HERE-only stack).
 *
 * Never import this file directly: MapCanvas.native.tsx `require`s it only
 * once src/lib/mapLibre.ts has confirmed MapLibre's native code is in the
 * binary, because evaluating this module's imports throws otherwise.
 *
 * The "pin" itself is NOT drawn by this component — app/location/map.tsx
 * overlays its own fixed, screen-centered <CenterPin/> on top and reads the
 * coordinate underneath it from onCenterChange/onCenterSettled. That's why
 * this component only ever needs to report camera state, never render a marker.
 */

import { Camera, Map, type CameraRef } from '@maplibre/maplibre-react-native';
import { forwardRef, useImperativeHandle, useRef } from 'react';
import { StyleSheet } from 'react-native';
import { hereStyle } from '../../constants/Here';
import type { LatLng } from '../../types/address';
import type { MapCanvasHandle, MapCanvasProps } from './MapCanvasFallback';

/** MapLibre reports coordinates as `[lng, lat]` — everywhere else in this app
 *  (LatLng, the geocoding layer) uses `{latitude, longitude}`. */
function toLatLng([longitude, latitude]: [number, number]): LatLng {
  return { latitude, longitude };
}

const DEFAULT_ZOOM = 15;

const MapLibreCanvas = forwardRef<MapCanvasHandle, MapCanvasProps>(function MapLibreCanvas(
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

export default MapLibreCanvas;

const styles = StyleSheet.create({
  map: { flex: 1 },
});
