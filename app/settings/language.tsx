/**
 * app/settings/language.tsx — pick the app's language.
 *
 * The list is `GET /api/app/config` → `languages` (useAppConfig): every entry
 * the backend defines, in its order, each flagged `available` only when the app
 * actually ships strings for it. Selecting an available language writes
 * `preferences.preferredLanguage` (usePreferredLanguage) — optimistic, reverts
 * on failure. Languages that aren't ready yet are shown but disabled, the way a
 * delivery app lists a language before its translation ships.
 *
 * Saving a language needs a real account: on a bypass session the list is
 * read-only and a banner explains why, with the platform default selected.
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
import { usePreferredLanguage } from '../../src/hooks/usePreferredLanguage';
import type { AppLanguage } from '../../src/services/appConfig';

function goBack() {
  if (router.canGoBack()) router.back();
  else router.navigate('/settings');
}

function LanguageRow({
  language,
  selected,
  disabled,
  saving,
  onPress,
}: {
  language: AppLanguage;
  selected: boolean;
  disabled: boolean;
  saving: boolean;
  onPress: () => void;
}) {
  const styles = useThemedStyles(makeStyles);
  const { accent } = useAccentTheme();
  const showEndonym = language.endonym && language.endonym !== language.label;
  return (
    <Pressable
      style={({ pressed }) => [
        styles.row,
        pressed && !disabled && styles.rowPressed,
        disabled && styles.rowDisabled,
      ]}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ selected, disabled }}
      accessibilityLabel={language.label}
    >
      <View style={styles.rowText}>
        <Text style={styles.rowLabel}>{language.label}</Text>
        {showEndonym ? <Text style={styles.rowEndonym}>{language.endonym}</Text> : null}
      </View>

      {saving ? (
        <ActivityIndicator size="small" color={Colors.foodTextMuted} />
      ) : !language.available ? (
        <View style={styles.soonPill}>
          <Text style={styles.soonText}>Soon</Text>
        </View>
      ) : selected ? (
        <Ionicons name="checkmark-circle" size={22} color={accent} />
      ) : (
        <View style={styles.radioEmpty} />
      )}
    </Pressable>
  );
}

export default function LanguageScreen() {
  const styles = useThemedStyles(makeStyles);
  const { accent, accentDark } = useAccentTheme();
  const { config, isLoading, error, refresh } = useAppConfig();
  const language = usePreferredLanguage();

  const header = (
    <View style={styles.header}>
      <Pressable onPress={goBack} hitSlop={10} style={styles.backBtn}>
        <Ionicons name="arrow-back" size={24} color={Colors.foodText} />
      </Pressable>
      <Text style={styles.title}>Language</Text>
    </View>
  );

  if ((isLoading && !config) || language.isLoading) {
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
          <Text style={styles.centeredTitle}>Couldn’t load languages</Text>
          <Text style={styles.centeredText}>{error ?? 'Check your connection and try again.'}</Text>
          <Pressable style={styles.primaryBtn} onPress={refresh}>
            <Text style={styles.primaryBtnText}>Try again</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  // On a bypass session there's nothing to write to — show the platform default
  // selected and make the list read-only.
  const effectiveCode = language.available ? language.code : config.defaultLanguage;

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <StatusBar style="dark" />
      {header}

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {!language.available ? (
          <View style={styles.noticeBanner}>
            <Ionicons name="lock-closed-outline" size={16} color={accentDark} />
            <Text style={styles.noticeText}>
              Sign in to save a language to your account.
            </Text>
          </View>
        ) : null}

        <View style={styles.list}>
          {config.languages.map((lang) => {
            const selectable = language.available && lang.available;
            return (
              <LanguageRow
                key={lang.code}
                language={lang}
                selected={lang.code === effectiveCode}
                disabled={!selectable || language.isSaving}
                saving={language.isSaving && lang.code === effectiveCode}
                onPress={() => language.setCode(lang.code)}
              />
            );
          })}
        </View>

        <Text style={styles.footNote}>
          More languages are on the way. Your orders and receipts always match the store’s
          own language.
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

  noticeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: t.accentLight,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.sm + 2,
    marginBottom: Spacing.md,
  },
  noticeText: { flex: 1, fontSize: 13, color: t.accentDark, fontWeight: '600' },

  list: { gap: Spacing.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 58,
    backgroundColor: Colors.foodSurface,
    borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    ...Shadows.sm,
  },
  rowPressed: { backgroundColor: Colors.foodBgSecondary },
  rowDisabled: { opacity: 0.55 },
  rowText: { flex: 1, gap: 2 },
  rowLabel: { fontSize: 15.5, fontWeight: '600', color: Colors.foodText },
  rowEndonym: { fontSize: 13, color: Colors.foodTextSecondary },

  radioEmpty: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: Colors.foodBorder,
  },
  soonPill: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.foodBgSecondary,
  },
  soonText: { fontSize: 11, fontWeight: '700', color: Colors.foodTextMuted, letterSpacing: 0.3 },

  footNote: {
    fontSize: 12.5,
    color: Colors.foodTextMuted,
    lineHeight: 18,
    paddingHorizontal: Spacing.xs,
    marginTop: Spacing.lg,
  },
  });

const styles = makeStyles(ORANGE_ACCENT);
