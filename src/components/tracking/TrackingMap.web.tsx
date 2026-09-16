/**
 * TrackingMap (web) — non-crashing stand-in for the browser.
 *
 * See TrackingMap.native.tsx's header comment for why this split exists:
 * @maplibre/maplibre-react-native has no web build, and importing it on web
 * throws a fatal, uncaught exception the instant the module loads. Metro's
 * platform-extension resolution means web never evaluates that import here.
 *
 * Everything else on the tracking screen — status timeline, partner card,
 * ETA — is plain React Native Web and keeps working; only the visual map is
 * unavailable. A real web map (maplibre-gl, which does support browsers,
 * unlike this native package) is a separate, larger follow-up if wanted.
 */

import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import { Colors } from '../../constants/Colors';
import type { PartnerLocation } from '../../services/tracking';

interface Props {
  partnerLocation: PartnerLocation | null;
  destination: [number, number] | null | undefined;
  restaurant: { lat: number; lng: number } | null;
}

export default function TrackingMap(_props: Props) {
  return (
    <View style={styles.fallback}>
      <Ionicons name="map-outline" size={28} color={Colors.white} />
      <Text style={styles.text}>Live map preview isn&apos;t available on web yet.</Text>
      <Text style={styles.subtext}>Status and partner details below are still live.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: '#2b2f36',
  },
  text: { color: Colors.white, fontSize: 13, fontWeight: '700', marginTop: 6 },
  subtext: { color: Colors.white, fontSize: 11.5, opacity: 0.75 },
});
