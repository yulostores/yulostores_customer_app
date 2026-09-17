/**
 * MapCanvas (web) — non-crashing stand-in for the browser.
 *
 * `@maplibre/maplibre-react-native` (used by MapLibreCanvas.tsx) has no web
 * implementation at all — importing it on web throws
 * `codegenNativeComponent is not a function` as a FATAL, uncaught exception
 * the moment this module loads. Metro's platform-extension resolution
 * (`.native.tsx` vs `.web.tsx`) means web never even evaluates that import.
 *
 * "Use current location" and the search flow still work here — they don't
 * depend on the map actually rendering, only on this component not crashing.
 * A real interactive web map (maplibre-gl, which — unlike this native
 * package — does support browsers) is a separate, larger follow-up if wanted.
 */

import { forwardRef } from 'react';
import MapCanvasFallback, { type MapCanvasHandle, type MapCanvasProps } from './MapCanvasFallback';

export type { MapCanvasHandle, MapCanvasProps };

const MapCanvas = forwardRef<MapCanvasHandle, MapCanvasProps>(function MapCanvas(props, ref) {
  return (
    <MapCanvasFallback
      ref={ref}
      {...props}
      message={
        'Live map preview isn’t available on web yet.\nUse “Use current location” or search to set your pin.'
      }
    />
  );
});

export default MapCanvas;
