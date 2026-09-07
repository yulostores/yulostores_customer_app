import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
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

  const handleBarCodeScanned = ({ type, data }: { type: string; data: string }) => {
    setScanned(true);
    setIsScanning(false);
    Alert.alert('QR Code Scanned!', `Data: ${data}`);
  };

  if (isScanning) {
    return (
      <View style={styles.cameraContainer}>
        <CameraView
          style={StyleSheet.absoluteFillObject}
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
      <View style={styles.container}>
        {/* Header */}
        <Text style={styles.title}>Scan QR Code</Text>
        <Text style={styles.subtitle}>Scan a table QR to order directly</Text>

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
            Scan the QR code on your restaurant table to view the menu and place
            your order directly.
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
