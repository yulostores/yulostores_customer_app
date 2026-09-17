/**
 * TrackingMap (native) — picks the real MapLibre map or the static fallback.
 *
 * The real implementation lives in MapLibreTrackingMap.tsx and is `require`d
 * only after src/lib/mapLibre.ts confirms MapLibre's native modules are in this
 * binary — evaluating that package on a binary built without it (reachable via
 * an OTA update) throws and would take the tracking screen down with it.
 */

import type { ComponentType } from 'react';
import { isMapLibreLinked } from '../../lib/mapLibre';
import TrackingMapFallback, { type TrackingMapProps } from './TrackingMapFallback';

type Impl = ComponentType<TrackingMapProps>;

let impl: Impl | null | undefined;

function loadImpl(): Impl | null {
  if (impl === undefined) {
    impl = isMapLibreLinked()
      ? (require('./MapLibreTrackingMap') as { default: Impl }).default
      : null;
  }
  return impl;
}

export default function TrackingMap(props: TrackingMapProps) {
  const Real = loadImpl();
  if (Real) return <Real {...props} />;
  return <TrackingMapFallback message="The live map needs the latest version of the app." />;
}
