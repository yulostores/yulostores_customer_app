/**
 * app/settings/index.tsx — the Settings list, reached from the Profile tab.
 *
 * Nothing here is hard-coded. Every row is built from `GET /api/app/config`
 * (useAppConfig): "Language" shows the customer's current language from
 * `preferences.preferredLanguage` (usePreferredLanguage); "Payment methods"
 * appears only while the catalogue is non-empty; the legal rows are one per
 * document the backend defines, in its order; and "About …" carries the app
 * name from the same config. Add a language, a payment method or a policy on the
 * backend and the row follows — the screen isn't touched.
 */

import { Ionicons } from '@expo/vector-icons';
import { router, type Href } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import type { ReactNode } from 'react';
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
import { usePreferredLanguage } from '../../src/hooks/usePreferredLanguage';

type IoniconName = keyof typeof Ionicons.glyphMap;

interface SettingsRow {
  key: string;
  label: string;
  route: Href;
  icon: IoniconName;
  /** Trailing hint, e.g. the current language. */
  meta?: string | null;
}

function goBack() {
  if (router.canGoBack()) router.back();
  else router.navigate('/(tabs)/profile');
}

/** Legal rows are backend-defined, so the icon is a best-effort guess from the
 *  doc's id/title — falls back to a plain document icon for anything unrecognized. */
function iconForLegalDoc(id: string, title: string): IoniconName {
  const key = `${id} ${title}`.toLowerCase();
  if (key.includes('privacy')) return 'shield-checkmark-outline';
  if (key.includes('refund') || key.includes('cancellation')) return 'cash-outline';
  return 'document-text-outline';
}

function Row({ row }: { row: SettingsRow }) {
  return (
    <Pressable
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
      onPress={() => router.push(row.route)}
      accessibilityRole="button"
      accessibilityLabel={row.label}
    >
      <Ionicons name={row.icon} size={22} color={Colors.foodText} />
      <Text style={styles.rowLabel}>{row.label}</Text>
      <View style={styles.rowRight}>
        {row.meta ? <Text style={styles.rowMeta}>{row.meta}</Text> : null}
        <Ionicons name="chevron-forward" size={18} color={Colors.foodTextMuted} />
      </View>
    </Pressable>
  );
}

export default function SettingsScreen() {
  const styles = useThemedStyles(makeStyles);
  const { accent, accentDark } = useAccentTheme();
  const { config, isLoading, error, refresh } = useAppConfig();
  const language = usePreferredLanguage();

  const header = (
    <View style={styles.header}>
      <Pressable onPress={goBack} hitSlop={10} style={styles.backBtn}>
        <Ionicons name="arrow-back" size={24} color={Colors.foodText} />
      </Pressable>
      <Text style={styles.title}>Settings</Text>
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
          <Text style={styles.centeredTitle}>Couldn’t load settings</Text>
          <Text style={styles.centeredText}>{error ?? 'Check your connection and try again.'}</Text>
          <Pressable style={styles.primaryBtn} onPress={refresh}>
            <Text style={styles.primaryBtnText}>Try again</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  // "Language" trailing hint — the customer's current language in its own script.
  const currentLanguage =
    config.languages.find((l) => l.code === language.code) ??
    config.languages.find((l) => l.code === config.defaultLanguage) ??
    null;

  const rows: SettingsRow[] = [
    {
      key: 'language',
      label: 'Language',
      icon: 'language-outline',
      route: '/settings/language',
      meta: currentLanguage?.endonym ?? null,
    },
  ];

  if (config.payments.methods.length > 0) {
    rows.push({
      key: 'payment-methods',
      label: 'Payment methods',
      icon: 'card-outline',
      route: '/settings/payment-methods',
    });
  }

  for (const doc of config.legal) {
    rows.push({
      key: `legal-${doc.id}`,
      label: doc.title,
      icon: iconForLegalDoc(doc.id, doc.title),
      route: { pathname: '/settings/legal/[doc]', params: { doc: doc.id } },
    });
  }

  rows.push({
    key: 'about',
    label: `About ${config.about.appName}`,
    icon: 'information-circle-outline',
    route: '/settings/about',
  });

  const content: ReactNode = (
    <View style={styles.list}>
      {rows.map((row) => (
        <Row key={row.key} row={row} />
      ))}
    </View>
  );

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <StatusBar style="dark" />
      {header}
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {error ? (
          <Pressable style={styles.errorBanner} onPress={refresh}>
            <Ionicons name="cloud-offline-outline" size={16} color={accentDark} />
            <Text style={styles.errorText} numberOfLines={1}>Couldn’t refresh settings</Text>
            <Text style={styles.errorRetry}>Retry</Text>
          </Pressable>
        ) : null}
        {content}
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const makeStyles = (t: AccentTheme) =>
  StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.foodBg },

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

  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: t.accentLight,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.sm + 2,
    marginBottom: Spacing.md,
  },
  errorText: { flex: 1, fontSize: 13, color: t.accentDark, fontWeight: '600' },
  errorRetry: { fontSize: 13, fontWeight: '800', color: t.accentDark },

  list: { gap: Spacing.md },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.base,
    minHeight: 58,
    backgroundColor: Colors.foodSurface,
    borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
    ...Shadows.sm,
    borderWidth: 1,
    borderColor: Colors.foodBorder,
  },
  rowPressed: { backgroundColor: Colors.foodBgSecondary },
  rowLabel: { flex: 1, fontSize: 15, fontWeight: '600', color: Colors.foodText },
  rowRight: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  rowMeta: { fontSize: 13, color: Colors.foodTextMuted },
  });

const styles = makeStyles(ORANGE_ACCENT);
