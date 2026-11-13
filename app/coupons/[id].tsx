/**
 * app/coupons/[id].tsx — one coupon: the code and its QR to show at the shop's counter, the
 * offer and terms, the shop (tap to call, tap to open the map) and a live expiry countdown.
 * Used / expired coupons keep their details but drop the QR.
 */
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { QrCode } from '../../src/components/coupons/QrCode';
import { Colors } from '../../src/constants/Colors';
import { BorderRadius, Elevation, Spacing } from '../../src/constants/Theme';
import { useAccentTheme, useThemedStyles, type AccentTheme } from '../../src/hooks/useAccentTheme';
import { useCoupon } from '../../src/hooks/useMyCoupons';
import { couponDetailState, formatCode, mapsUrl, telUrl } from '../../src/lib/coupons';

function goBack() {
  if (router.canGoBack()) router.back();
  else router.navigate('/coupons');
}

const day = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

/** The current time, ticking every second while `on`. */
function useNow(on: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!on) return undefined;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [on]);
  return now;
}

async function open(url: string | null, what: string) {
  if (!url) return;
  try {
    await Linking.openURL(url);
  } catch {
    Alert.alert(`Can’t ${what}`, 'Your phone has no app for this.');
  }
}

export default function CouponDetailScreen() {
  const styles = useThemedStyles(makeStyles);
  const { accent } = useAccentTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { coupon, isLoading, error, notFound, reload } = useCoupon(String(id ?? ''));
  const now = useNow(coupon?.status === 'issued');
  const state = couponDetailState({ coupon, isLoading, error, notFound }, now);

  const header = (
    <View style={styles.header}>
      <Pressable onPress={goBack} hitSlop={10} style={styles.backBtn} accessibilityLabel="Back">
        <Ionicons name="arrow-back" size={22} color={Colors.foodText} />
      </Pressable>
      <Text style={styles.headerTitle}>Coupon</Text>
      <View style={{ width: 36 }} />
    </View>
  );

  if (state.kind === 'loading')
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <StatusBar style="dark" />
        {header}
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={accent} />
        </View>
      </SafeAreaView>
    );

  if (!coupon || state.kind === 'not-found' || state.kind === 'error')
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <StatusBar style="dark" />
        {header}
        <View style={styles.centered}>
          <Ionicons name="alert-circle-outline" size={44} color={Colors.foodTextMuted} />
          <Text style={styles.muted}>{state.kind === 'error' ? state.message : 'This coupon isn’t available.'}</Text>
          {state.kind === 'error' ? (
            <Pressable style={[styles.retryBtn, { backgroundColor: accent }]} onPress={reload}>
              <Text style={styles.retryText}>Try again</Text>
            </Pressable>
          ) : null}
        </View>
      </SafeAreaView>
    );

  const tel = telUrl(coupon.sellerPhone);
  const map = mapsUrl(coupon);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <StatusBar style="dark" />
      {header}
      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <View style={styles.card}>
          {coupon.categoryName ? <Text style={styles.category}>{coupon.categoryName.toUpperCase()}</Text> : null}
          <Text style={styles.title}>{coupon.title}</Text>
          <Text style={styles.seller}>{coupon.sellerName}</Text>

          {state.kind === 'active' ? (
            <>
              <View style={styles.qrWrap}>
                <QrCode value={coupon.qrPayload} size={220} />
              </View>
              <Text style={styles.code} selectable accessibilityLabel={`Code ${coupon.code.split('').join(' ')}`}>
                {formatCode(coupon.code)}
              </Text>
              <Text style={styles.hint}>Show this at the counter</Text>
              <View style={[styles.countdown, state.countdown.urgent && styles.countdownUrgent]}>
                <Ionicons
                  name="time-outline"
                  size={16}
                  color={state.countdown.urgent ? Colors.authDanger : Colors.foodTextSecondary}
                />
                <Text style={[styles.countdownText, state.countdown.urgent && { color: Colors.authDanger }]}>
                  {state.countdown.text}
                </Text>
              </View>
              <Text style={styles.muted}>Valid until {day(coupon.expiresAt)}</Text>
            </>
          ) : (
            <View style={styles.doneBanner}>
              <Text style={styles.doneStatus}>{state.kind === 'done' ? state.label : ''}</Text>
              <Text style={styles.muted}>{state.kind === 'done' ? state.line : ''}</Text>
              <Text style={styles.codeDone}>{formatCode(coupon.code)}</Text>
            </View>
          )}
        </View>

        {coupon.terms ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Terms</Text>
            <Text style={styles.terms}>{coupon.terms}</Text>
          </View>
        ) : null}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Where to use it</Text>
          <Text style={styles.shopName}>{coupon.sellerName}</Text>
          {coupon.sellerAddress ? (
            <Pressable
              style={styles.linkRow}
              onPress={() => open(map, 'open the map')}
              disabled={!map}
              accessibilityRole="link"
              accessibilityHint="Opens the map"
            >
              <Ionicons name="location-outline" size={18} color={accent} />
              <Text style={styles.linkText}>{coupon.sellerAddress}</Text>
              <Ionicons name="open-outline" size={16} color={Colors.foodTextMuted} />
            </Pressable>
          ) : null}
          {tel ? (
            <Pressable
              style={styles.linkRow}
              onPress={() => open(tel, 'call')}
              accessibilityRole="link"
              accessibilityHint="Calls the shop"
            >
              <Ionicons name="call-outline" size={18} color={accent} />
              <Text style={styles.linkText}>{coupon.sellerPhone}</Text>
            </Pressable>
          ) : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const makeStyles = (t: AccentTheme) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: Colors.foodBg },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: Spacing.base,
      paddingVertical: Spacing.sm + 2,
      backgroundColor: Colors.foodSurface,
      borderBottomWidth: 1,
      borderBottomColor: Colors.foodBorder,
    },
    backBtn: { width: 36, height: 40, alignItems: 'center', justifyContent: 'center' },
    headerTitle: { fontSize: 18, fontWeight: '800', color: Colors.foodText, letterSpacing: -0.3 },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl, gap: Spacing.sm },
    body: { padding: Spacing.base, paddingBottom: Spacing['3xl'], gap: Spacing.md },
    card: {
      backgroundColor: Colors.foodSurface,
      borderRadius: BorderRadius.xl,
      borderWidth: 1,
      borderColor: Colors.foodBorder,
      padding: Spacing.xl,
      alignItems: 'center',
      ...Elevation.card,
    },
    category: { fontSize: 11.5, fontWeight: '800', letterSpacing: 0.8, color: t.accentDark },
    title: { marginTop: 4, fontSize: 21, fontWeight: '800', color: Colors.foodText, textAlign: 'center' },
    seller: { marginTop: 2, fontSize: 14, color: Colors.foodTextSecondary },
    qrWrap: { marginTop: Spacing.xl, padding: Spacing.sm, borderRadius: BorderRadius.md, backgroundColor: Colors.white },
    code: { marginTop: Spacing.md, fontSize: 24, fontWeight: '800', letterSpacing: 2, color: Colors.foodText },
    hint: { marginTop: 2, fontSize: 12.5, color: Colors.foodTextMuted },
    countdown: {
      marginTop: Spacing.lg,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: Spacing.md,
      paddingVertical: 6,
      borderRadius: BorderRadius.full,
      backgroundColor: Colors.foodBgSecondary,
    },
    countdownUrgent: { backgroundColor: '#FEF2F2' },
    countdownText: { fontSize: 13.5, fontWeight: '700', color: Colors.foodTextSecondary },
    muted: { marginTop: 6, fontSize: 13, color: Colors.foodTextSecondary, textAlign: 'center' },
    doneBanner: { marginTop: Spacing.lg, alignItems: 'center' },
    doneStatus: { fontSize: 16, fontWeight: '800', color: Colors.foodTextSecondary },
    codeDone: {
      marginTop: Spacing.md,
      fontSize: 18,
      fontWeight: '700',
      letterSpacing: 2,
      color: Colors.foodTextMuted,
      textDecorationLine: 'line-through',
    },
    section: {
      backgroundColor: Colors.foodSurface,
      borderRadius: BorderRadius.lg,
      borderWidth: 1,
      borderColor: Colors.foodBorder,
      padding: Spacing.base,
    },
    sectionTitle: { fontSize: 12, fontWeight: '800', letterSpacing: 0.6, color: Colors.foodTextMuted, marginBottom: Spacing.sm },
    terms: { fontSize: 14, lineHeight: 20, color: Colors.foodText },
    shopName: { fontSize: 15.5, fontWeight: '800', color: Colors.foodText },
    linkRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: Spacing.sm, minHeight: 44 },
    linkText: { flex: 1, fontSize: 14, lineHeight: 20, color: Colors.foodText },
    retryBtn: { marginTop: Spacing.md, height: 44, paddingHorizontal: Spacing.xl, borderRadius: BorderRadius.full, justifyContent: 'center' },
    retryText: { fontSize: 15, fontWeight: '800', color: Colors.white },
  });
