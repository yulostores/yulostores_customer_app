import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import {
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors } from '../../src/constants/Colors';
import { BorderRadius, Spacing } from '../../src/constants/Theme';
import {
  ORANGE_ACCENT,
  useAccentTheme,
  useThemedStyles,
  type AccentTheme,
} from '../../src/hooks/useAccentTheme';

export default function ScanScreen() {
  const styles = useThemedStyles(makeStyles);
  const { accent } = useAccentTheme();
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

          <Pressable style={styles.scanBtn}>
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
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: Colors.foodText,
    paddingTop: Spacing.md,
  },
  subtitle: {
    fontSize: 14,
    color: Colors.foodTextMuted,
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
    backgroundColor: Colors.foodBgSecondary,
    borderRadius: BorderRadius.lg,
    padding: Spacing.base,
    alignItems: 'center',
    gap: 6,
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
