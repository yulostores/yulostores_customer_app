/**
 * TrackingMap (web) — non-crashing stand-in for the browser.
 *
 * @maplibre/maplibre-react-native has no web build, and importing it on web
 * throws a fatal, uncaught exception the instant the module loads. Metro's
 * platform-extension resolution means web never evaluates that import here.
 * A real web map (maplibre-gl, which does support browsers, unlike this
 * native package) is a separate, larger follow-up if wanted.
 */

import TrackingMapFallback, { type TrackingMapProps } from './TrackingMapFallback';

export default function TrackingMap(_props: TrackingMapProps) {
  return <TrackingMapFallback message={'Live map preview isn’t available on web yet.'} />;
}
