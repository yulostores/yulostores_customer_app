/**
 * app/coupons/index.tsx — My Coupons: Active / Used / Expired tabs of the partner-shop coupons
 * the customer earned by paying for orders (GET /api/users/me/coupons). Tap one for its code and
 * QR. Guests see a sign-in prompt — coupons need an account.
 */
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CouponListItem } from '../../src/components/coupons/CouponListItem';
import { DemographicsPrompt } from '../../src/components/coupons/DemographicsPrompt';
import { Colors } from '../../src/constants/Colors';
import { BorderRadius, Spacing } from '../../src/constants/Theme';
import { useAccentTheme, useThemedStyles, type AccentTheme } from '../../src/hooks/useAccentTheme';
import { useMyCoupons } from '../../src/hooks/useMyCoupons';
import { COUPON_TABS, couponListState, type CouponTabKey } from '../../src/lib/coupons';

function goBack() {
  if (router.canGoBack()) router.back();
  else router.navigate('/(tabs)/profile');
}

export default function MyCouponsScreen() {
  const styles = useThemedStyles(makeStyles);
  const { accent } = useAccentTheme();
  const [tab, setTab] = useState<CouponTabKey>('active');
  const status = COUPON_TABS.find((t) => t.key === tab)!.status;
  const list = useMyCoupons(status);
  const state = couponListState({
    tab,
    notSignedIn: list.notSignedIn,
    isLoading: list.isLoading,
    error: list.error,
    count: list.coupons.length,
  });

  const header = (
    <View style={styles.header}>
      <Pressable onPress={goBack} hitSlop={10} style={styles.backBtn} accessibilityLabel="Back">
        <Ionicons name="arrow-back" size={22} color={Colors.foodText} />
      </Pressable>
      <Text style={styles.headerTitle}>My coupons</Text>
      <View style={{ width: 36 }} />
    </View>
  );

  if (state.kind === 'sign-in')
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <StatusBar style="dark" />
        {header}
        <View style={styles.centered}>
          <Ionicons name="ticket-outline" size={44} color={Colors.foodTextMuted} />
          <Text style={styles.emptyTitle}>Sign in to get coupons</Text>
          <Text style={styles.emptyBody}>Coupons come with orders you pay for while signed in.</Text>
          <Pressable style={[styles.primaryBtn, { backgroundColor: accent }]} onPress={() => router.push('/sign-in')}>
            <Text style={styles.primaryBtnText}>Sign in</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <StatusBar style="dark" />
      {header}
      <View style={styles.tabs} accessibilityRole="tablist">
        {COUPON_TABS.map((t) => {
          const on = t.key === tab;
          return (
            <Pressable
              key={t.key}
              onPress={() => setTab(t.key)}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              style={[styles.tab, on && styles.tabOn]}
            >
              <Text style={[styles.tabText, on && styles.tabTextOn]}>
                {t.label}
                {on && !list.isLoading && list.total > 0 ? ` · ${list.total}` : ''}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {state.kind === 'loading' ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={accent} />
        </View>
      ) : state.kind === 'error' ? (
        <View style={styles.centered}>
          <Ionicons name="cloud-offline-outline" size={40} color={Colors.foodTextMuted} />
          <Text style={styles.emptyBody}>{state.message}</Text>
          <Pressable style={[styles.primaryBtn, { backgroundColor: accent }]} onPress={list.retry}>
            <Text style={styles.primaryBtnText}>Try again</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={list.coupons}
          keyExtractor={(c) => c.id}
          contentContainerStyle={list.coupons.length ? styles.list : styles.listEmpty}
          ItemSeparatorComponent={() => <View style={{ height: Spacing.md }} />}
          renderItem={({ item }) => (
            <CouponListItem coupon={item} onPress={() => router.push(`/coupons/${item.id}`)} />
          )}
          onEndReached={list.loadMore}
          onEndReachedThreshold={0.4}
          refreshControl={
            <RefreshControl refreshing={list.isRefreshing} onRefresh={list.refresh} tintColor={accent} colors={[accent]} />
          }
          ListFooterComponent={
            list.isLoadingMore ? <ActivityIndicator style={{ marginVertical: Spacing.lg }} color={accent} /> : undefined
          }
          ListEmptyComponent={
            <View style={styles.centered}>
              <Ionicons name="ticket-outline" size={44} color={Colors.foodTextMuted} />
              <Text style={styles.emptyTitle}>{state.kind === 'empty' ? state.title : ''}</Text>
              <Text style={styles.emptyBody}>{state.kind === 'empty' ? state.body : ''}</Text>
            </View>
          }
        />
      )}
      <DemographicsPrompt hasCoupon={tab === 'active' && list.total > 0} />
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
    tabs: {
      flexDirection: 'row',
      margin: Spacing.base,
      padding: 4,
      borderRadius: BorderRadius.full,
      backgroundColor: Colors.foodBgSecondary,
    },
    tab: { flex: 1, height: 38, borderRadius: BorderRadius.full, alignItems: 'center', justifyContent: 'center' },
    tabOn: { backgroundColor: Colors.foodSurface },
    tabText: { fontSize: 14, fontWeight: '600', color: Colors.foodTextSecondary },
    tabTextOn: { color: t.accentDark, fontWeight: '800' },
    list: { paddingHorizontal: Spacing.base, paddingBottom: Spacing['2xl'] },
    listEmpty: { flexGrow: 1 },
    centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl, gap: Spacing.sm },
    emptyTitle: { fontSize: 17, fontWeight: '800', color: Colors.foodText, marginTop: Spacing.sm },
    emptyBody: { fontSize: 13.5, lineHeight: 20, color: Colors.foodTextSecondary, textAlign: 'center' },
    primaryBtn: {
      marginTop: Spacing.md,
      height: 46,
      paddingHorizontal: Spacing.xl,
      borderRadius: BorderRadius.full,
      alignItems: 'center',
      justifyContent: 'center',
    },
    primaryBtnText: { fontSize: 15, fontWeight: '800', color: Colors.white },
  });
