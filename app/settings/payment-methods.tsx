/**
 * app/settings/payment-methods.tsx — the payment methods Yulo Stores accepts.
 *
 * A read-only view of `GET /api/app/config` → `payments` (useAppConfig): the
 * same catalogue the checkout Payment screen offers, grouped the same way. You
 * choose a method when you place an order, not here — there is nothing to save
 * on this screen. Add or retire a method on the backend and this list follows.
 */

import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors } from '../../src/constants/Colors';
import { BorderRadius, Shadows, Spacing } from '../../src/constants/Theme';
import { useAppConfig } from '../../src/hooks/useAppConfig';
import {
  ORANGE_ACCENT,
  useAccentTheme,
  useThemedStyles,
  type AccentTheme,
} from '../../src/hooks/useAccentTheme';
import type { PaymentCatalogueMethod } from '../../src/services/appConfig';

function goBack() {
  if (router.canGoBack()) router.back();
  else router.navigate('/settings');
}

function MethodRow({ method, first }: { method: PaymentCatalogueMethod; first: boolean }) {
  return (
    <View style={[styles.methodRow, !first && styles.methodDivider]}>
      <View style={[styles.methodBadge, { backgroundColor: method.tint + '18' }]}>
        <Ionicons
          name={method.icon as keyof typeof Ionicons.glyphMap}
          size={18}
          color={method.tint}
        />
      </View>
      <View style={styles.methodText}>
        <Text style={styles.methodLabel}>{method.label}</Text>
        {method.hint ? <Text style={styles.methodHint}>{method.hint}</Text> : null}
      </View>
    </View>
  );
}

export default function PaymentMethodsScreen() {
  const styles = useThemedStyles(makeStyles);
  const { accent } = useAccentTheme();
  const { config, isLoading, error, refresh } = useAppConfig();

  const header = (
    <View style={styles.header}>
      <Pressable onPress={goBack} hitSlop={10} style={styles.backBtn}>
        <Ionicons name="arrow-back" size={24} color={Colors.foodText} />
      </Pressable>
      <Text style={styles.title}>Payment methods</Text>
    </View>
  );

  if (isLoading && !config) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <StatusBar style="dark" />
        {header}
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={accent} />
        </View>
      </SafeAreaView>
    );
  }

  if (!config) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <StatusBar style="dark" />
        {header}
        <View style={styles.centered}>
          <Ionicons name="cloud-offline-outline" size={44} color={Colors.foodBorder} />
          <Text style={styles.centeredTitle}>Couldn’t load payment methods</Text>
          <Text style={styles.centeredText}>{error ?? 'Check your connection and try again.'}</Text>
          <Pressable style={styles.primaryBtn} onPress={refresh}>
            <Text style={styles.primaryBtnText}>Try again</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const { groups, methods } = config.payments;
  // Only render a group that actually has methods, in the backend's group order.
  const populatedGroups = groups
    .map((group) => ({ group, items: methods.filter((m) => m.group === group.id) }))
    .filter((g) => g.items.length > 0);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <StatusBar style="dark" />
      {header}

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.intro}>
          These are the ways you can pay for an order. You’ll pick one at checkout.
        </Text>

        {populatedGroups.map(({ group, items }) => (
          <View key={group.id} style={styles.group}>
            <Text style={styles.groupTitle}>{group.title}</Text>
            {group.subtitle ? <Text style={styles.groupSubtitle}>{group.subtitle}</Text> : null}
            <View style={styles.card}>
              {items.map((method, i) => (
                <MethodRow key={method.id} method={method} first={i === 0} />
              ))}
            </View>
          </View>
        ))}

        <Text style={styles.footNote}>
          Yulo Stores never stores your full card number or UPI PIN — online payments are
          handled by our payment partner.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const makeStyles = (t: AccentTheme) =>
  StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.authBg },

  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.base,
  },
  backBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', marginTop: 3 },
  title: {
    flex: 1,
    fontSize: 28,
    fontWeight: '800',
    color: Colors.foodText,
    letterSpacing: -0.5,
    lineHeight: 34,
  },

  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.xl,
  },
  centeredTitle: { fontSize: 17, fontWeight: '800', color: Colors.foodText, marginTop: Spacing.sm },
  centeredText: {
    fontSize: 13.5,
    color: Colors.foodTextSecondary,
    textAlign: 'center',
    lineHeight: 19,
    marginBottom: Spacing.md,
  },
  primaryBtn: {
    backgroundColor: t.accent,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.full,
    marginTop: Spacing.sm,
  },
  primaryBtnText: { fontSize: 14, fontWeight: '700', color: Colors.white },

  scroll: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.xs, paddingBottom: Spacing['2xl'] },

  intro: {
    fontSize: 13.5,
    color: Colors.foodTextSecondary,
    lineHeight: 19,
    marginBottom: Spacing.lg,
  },

  group: { marginBottom: Spacing.lg },
  groupTitle: { fontSize: 15, fontWeight: '800', color: Colors.foodText },
  groupSubtitle: { fontSize: 12.5, color: Colors.foodTextMuted, marginTop: 2, marginBottom: Spacing.sm },

  card: {
    backgroundColor: Colors.foodSurface,
    borderRadius: BorderRadius.lg,
    overflow: 'hidden',
    marginTop: Spacing.sm,
    ...Shadows.sm,
  },
  methodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
    minHeight: 58,
  },
  methodDivider: { borderTopWidth: 1, borderTopColor: Colors.foodBorder },
  methodBadge: {
    width: 38,
    height: 38,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  methodText: { flex: 1 },
  methodLabel: { fontSize: 14.5, fontWeight: '700', color: Colors.foodText },
  methodHint: { fontSize: 12, color: Colors.foodTextMuted, marginTop: 1 },

  footNote: {
    fontSize: 12.5,
    color: Colors.foodTextMuted,
    lineHeight: 18,
    paddingHorizontal: Spacing.xs,
  },
  });

const styles = makeStyles(ORANGE_ACCENT);
