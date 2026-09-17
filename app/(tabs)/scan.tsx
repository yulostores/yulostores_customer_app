import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useState } from 'react';
import {
  Alert,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors } from '../../src/constants/Colors';
import { BorderRadius, Elevation, Spacing } from '../../src/constants/Theme';
import {
  ORANGE_ACCENT,
  useAccentTheme,
  useThemedStyles,
  type AccentTheme,
} from '../../src/hooks/useAccentTheme';
import { reportError } from '../../src/lib/logger';

/**
 * What a scanned string resolves to:
 *  - `internal` — a Yulo deep link (our `yulostores://` scheme, or a yulostores.in
 *    universal link) that names a screen we can push straight to.
 *  - `external` — any other http(s) URL, e.g. a table QR that points at the guest
 *    ordering site. Opened via the OS after a confirm.
 *  - `unknown`  — not a link we can do anything with.
 */
type ScanTarget =
  | { kind: 'internal'; path: string }
  | { kind: 'external'; url: string }
  | { kind: 'unknown' };

const INTERNAL_HOSTS = ['yulostores.in', 'www.yulostores.in'];
// First path segment we're willing to navigate to from a scan.
const ROUTABLE_PREFIXES = ['restaurant', 'item', 'cuisines', 'order'];

function resolveScan(raw: string): ScanTarget {
  const value = raw.trim();
  if (!value) return { kind: 'unknown' };

  let parsed: ReturnType<typeof Linking.parse>;
  try {
    parsed = Linking.parse(value);
  } catch {
    return { kind: 'unknown' };
  }

  const path = (parsed.path ?? '').replace(/^\/+/, '');
  const firstSeg = path.split('/')[0]?.toLowerCase();
  const routable = !!firstSeg && ROUTABLE_PREFIXES.includes(firstSeg);
  const host = parsed.hostname?.toLowerCase();

  // Our own scheme — app.json → "scheme": "yulostores".
  if (parsed.scheme === 'yulostores' && routable) {
    return { kind: 'internal', path: `/${path}` };
  }

  if (parsed.scheme === 'http' || parsed.scheme === 'https') {
    if (host && INTERNAL_HOSTS.includes(host) && routable) {
      return { kind: 'internal', path: `/${path}` };
    }
    return { kind: 'external', url: value };
  }

  return { kind: 'unknown' };
}

export default function ScanScreen() {
  const styles = useThemedStyles(makeStyles);
  const { accent } = useAccentTheme();

  const [permission, requestPermission] = useCameraPermissions();
  const [isScanning, setIsScanning] = useState(false);
  const [scanned, setScanned] = useState(false);

  const handleOpenCamera = async () => {
    if (!permission?.granted) {
      const result = await requestPermission();
      if (!result.granted) {
        Alert.alert('Permission needed', 'Camera permission is required to scan QR codes.');
        return;
      }
    }
    setScanned(false);
    setIsScanning(true);
  };

  const handleBarCodeScanned = ({ data }: { type: string; data: string }) => {
    if (scanned) return; // guard against a second frame firing before the camera unmounts
    setScanned(true);
    setIsScanning(false);

    const target = resolveScan(data);

    if (target.kind === 'internal') {
      router.push(target.path as Parameters<typeof router.push>[0]);
      return;
    }

    if (target.kind === 'external') {
      Alert.alert('Open this link?', target.url, [
        { text: 'Cancel', style: 'cancel', onPress: () => setScanned(false) },
        {
          text: 'Open',
          onPress: () => {
            Linking.openURL(target.url).catch((err) => {
              reportError('scan', 'Could not open scanned link', err, { url: target.url });
              Alert.alert('Couldn’t open that link', 'The scanned code could not be opened.');
              setScanned(false);
            });
          },
        },
      ]);
      return;
    }

    Alert.alert(
      'Unrecognised QR code',
      "That doesn't look like a Yulo Stores code. Scan the QR printed on your restaurant table.",
      [{ text: 'OK', onPress: () => setScanned(false) }],
    );
  };

  if (isScanning) {
    return (
      <View style={styles.cameraContainer}>
        <StatusBar style="light" />
        <CameraView
          style={StyleSheet.absoluteFill}
          onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
          barcodeScannerSettings={{
            barcodeTypes: ['qr'],
          }}
        />
        <SafeAreaView style={styles.cameraOverlay} edges={['top', 'bottom']}>
           <Pressable style={styles.closeBtn} onPress={() => setIsScanning(false)}>
             <Ionicons name="close-circle" size={40} color={Colors.white} />
           </Pressable>
        </SafeAreaView>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <StatusBar style="dark" />
      <View style={styles.container}>
        {/* Header */}
        <Text style={styles.title}>Scan QR Code</Text>
        <Text style={styles.subtitle}>Scan a Yulo QR to jump to a store or menu</Text>

        {/* Illustration area */}
        <View style={styles.centerBox}>
          <View style={styles.qrFrame}>
            <Image
              source={require('../../assets/Images/Icons/qr-scan.png')}
              style={styles.qrIcon}
              resizeMode="contain"
            />
          </View>

          <Text style={styles.scanTitle}>Point your camera at a QR code</Text>
          <Text style={styles.scanSubtext}>
            Scan the QR code on your restaurant table, or any Yulo Stores code, to
            open the store or menu it points to.
          </Text>

          <Pressable style={styles.scanBtn} onPress={handleOpenCamera}>
            <Ionicons name="camera-outline" size={22} color={Colors.white} />
            <Text style={styles.scanBtnText}>Open Camera</Text>
          </Pressable>
        </View>

        {/* Info cards */}
        <View style={styles.infoRow}>
          <View style={styles.infoCard}>
            <Ionicons name="flash-outline" size={22} color={accent} />
            <Text style={styles.infoTitle}>Quick Order</Text>
            <Text style={styles.infoSubtext}>No waiting for a waiter</Text>
          </View>
          <View style={styles.infoCard}>
            <Ionicons name="shield-checkmark-outline" size={22} color={accent} />
            <Text style={styles.infoTitle}>Secure</Text>
            <Text style={styles.infoSubtext}>Safe & verified orders</Text>
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}

const makeStyles = (t: AccentTheme) =>
  StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.foodBg },
  container: {
    flex: 1,
    backgroundColor: Colors.foodBg,
    paddingHorizontal: Spacing.base,
  },
  cameraContainer: {
    flex: 1,
    backgroundColor: '#000',
  },
  cameraOverlay: {
    flex: 1,
    backgroundColor: 'transparent',
    padding: Spacing.lg,
    alignItems: 'flex-end',
    justifyContent: 'flex-start',
  },
  closeBtn: {
    marginTop: Spacing.xl,
    marginRight: Spacing.md,
    ...Elevation.card,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: Colors.foodText,
    letterSpacing: -0.6,
    paddingTop: Spacing.md,
  },
  subtitle: {
    fontSize: 14,
    color: Colors.foodTextSecondary,
    marginBottom: Spacing.lg,
  },
  centerBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    paddingBottom: 20,
  },
  qrFrame: {
    width: 140,
    height: 140,
    borderRadius: 28,
    backgroundColor: t.accentLight,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: t.accent,
    borderStyle: 'dashed',
    marginBottom: 12,
  },
  qrIcon: {
    width: 64,
    height: 64,
    tintColor: t.accent,
  },
  scanTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.foodText,
    textAlign: 'center',
  },
  scanSubtext: {
    fontSize: 14,
    color: Colors.foodTextMuted,
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: 32,
  },
  scanBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: t.accent,
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: BorderRadius.full,
    marginTop: 8,
  },
  scanBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.white,
  },
  infoRow: {
    flexDirection: 'row',
    gap: Spacing.md,
    paddingBottom: 24,
  },
  infoCard: {
    flex: 1,
    backgroundColor: Colors.foodSurface,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.foodBorder,
    padding: Spacing.base,
    alignItems: 'center',
    gap: 6,
    ...Elevation.card,
  },
  infoTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.foodText,
  },
  infoSubtext: {
    fontSize: 11,
    color: Colors.foodTextMuted,
    textAlign: 'center',
  },
  });

const styles = makeStyles(ORANGE_ACCENT);
