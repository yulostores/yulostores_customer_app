/**
 * MapCanvas (native) — picks the real MapLibre map or the static fallback.
 *
 * The real implementation lives in MapLibreCanvas.tsx and is `require`d only
 * after src/lib/mapLibre.ts confirms MapLibre's native modules are in this
 * binary. A top-level `import` would evaluate the package unconditionally, and
 * on a binary built before MapLibre was added (reachable via an OTA update)
 * that evaluation throws and blanks the whole location flow.
 *
 *   <MapCanvas ref={mapRef} initialCenter={coords} onCenterSettled={geocode} />
 *   mapRef.current?.animateTo(coords)   // flies the camera there
 */

import { forwardRef, type ComponentType, type RefAttributes } from 'react';
import { isMapLibreLinked } from '../../lib/mapLibre';
import MapCanvasFallback, { type MapCanvasHandle, type MapCanvasProps } from './MapCanvasFallback';

export type { MapCanvasHandle, MapCanvasProps };

type Impl = ComponentType<MapCanvasProps & RefAttributes<MapCanvasHandle>>;

let impl: Impl | null | undefined;

function loadImpl(): Impl | null {
  if (impl === undefined) {
    impl = isMapLibreLinked() ? (require('./MapLibreCanvas') as { default: Impl }).default : null;
  }
  return impl;
}

const MapCanvas = forwardRef<MapCanvasHandle, MapCanvasProps>(function MapCanvas(props, ref) {
  const Real = loadImpl();
  if (Real) return <Real ref={ref} {...props} />;
  return (
    <MapCanvasFallback
      ref={ref}
      {...props}
      message={
        'The live map needs the latest version of the app.\nUse “Use current location” or search to set your pin.'
      }
    />
  );
});

export default MapCanvas;
