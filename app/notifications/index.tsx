/**
 * app/notifications/index.tsx — "Notification preferences", reached from the
 * Profile tab.
 *
 * Nothing here is hard-coded. `useNotificationPreferences()` reads the account's
 * `preferences.notifications` from `GET /api/users/me/preferences`: `pushEnabled`
 * is the master status pill, and every switch below is a real
 * `notifications.categories` row (label/blurb mapped by key in
 * src/services/notifications.ts, with a fallback so a category added on the
 * backend just appears). Flipping switches builds a draft; "Save changes" PATCHes
 * only the rows that changed. The master push row isn't editable in-app — like
 * every other delivery app it points at the OS settings.
 */

import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../../src/constants/Colors';
import { BorderRadius, Shadows, Spacing } from '../../src/constants/Theme';
import { useAuth } from '../../src/context/AuthContext';
import {
  ORANGE_ACCENT,
  useAccentTheme,
  useThemedStyles,
  type AccentTheme,
} from '../../src/hooks/useAccentTheme';
import { useNotificationPreferences } from '../../src/hooks/useNotificationPreferences';

function goBack() {
  if (router.canGoBack()) router.back();
  else router.navigate('/(tabs)/profile');
}

function openSystemSettings() {
  Linking.openSettings().catch(() => {});
}

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function NotificationPreferencesScreen() {
  const styles = useThemedStyles(makeStyles);
  const { accent, accentDark } = useAccentTheme();
  const insets = useSafeAreaInsets();
  const { signOut } = useAuth();
  const {
    pushEnabled,
    categories,
    available,
    isLoading,
    isSaving,
    error,
    dirty,
    savedOnce,
    setCategoryEnabled,
    save,
    reload,
  } = useNotificationPreferences();

  const header = (
    <View style={styles.header}>
      <Pressable onPress={goBack} hitSlop={10} style={styles.backBtn}>
        <Ionicons name="arrow-back" size={24} color={Colors.foodText} />
      </Pressable>
      <Text style={styles.title}>Notification preferences</Text>
    </View>
  );

  if (isLoading) {
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

  if (!available) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <StatusBar style="dark" />
        {header}
        <View style={styles.centered}>
          <Ionicons name="lock-closed-outline" size={44} color={Colors.foodBorder} />
          <Text style={styles.centeredTitle}>Sign in to manage notifications</Text>
          <Text style={styles.centeredText}>
            Notification settings are saved to your account. Sign in again to change them.
          </Text>
          <Pressable style={styles.primaryBtn} onPress={signOut}>
            <Text style={styles.primaryBtnText}>Sign in</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <StatusBar style="dark" />
      {header}

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 140 }]}
        showsVerticalScrollIndicator={false}
      >
        {error ? (
          <Pressable style={styles.errorBanner} onPress={reload}>
            <Ionicons name="cloud-offline-outline" size={16} color={accentDark} />
            <Text style={styles.errorText} numberOfLines={2}>
              {error}
            </Text>
            <Text style={styles.errorRetry}>Retry</Text>
          </Pressable>
        ) : null}

        {/* Master push status — mirrors the OS permission, changed in system settings. */}
        <View style={styles.card}>
          <View style={styles.cardRow}>
            <Text style={styles.cardTitle}>Push notifications</Text>
            <View style={[styles.statusPill, pushEnabled ? styles.statusPillOn : styles.statusPillOff]}>
              <Text
                style={[
                  styles.statusText,
                  pushEnabled ? styles.statusTextOn : styles.statusTextOff,
                ]}
              >
                {pushEnabled ? 'On' : 'Off'}
              </Text>
            </View>
          </View>
          <Text style={styles.cardHint}>
            {pushEnabled
              ? 'This device is set up for push notifications. Manage system-level access in '
              : 'To enable notifications, go to '}
            <Text
              style={styles.link}
              onPress={openSystemSettings}
              accessibilityRole="link"
            >
              settings
            </Text>
          </Text>
        </View>

        {/* One card per category the account actually has. */}
        {categories.map((c) => (
          <View key={c.key} style={styles.card}>
            <View style={styles.cardRow}>
              <Text style={styles.cardTitle}>{c.title}</Text>
              <Switch
                value={c.enabled}
                onValueChange={(next) => setCategoryEnabled(c.key, next)}
                disabled={isSaving}
                trackColor={{ false: Colors.toggleTrackOff, true: accent }}
                thumbColor={Colors.toggleThumb}
                ios_backgroundColor={Colors.toggleTrackOff}
                accessibilityLabel={c.title}
              />
            </View>
            <Text style={styles.cardHint}>{c.description}</Text>
          </View>
        ))}

        {categories.length === 0 && !error ? (
          <Text style={styles.emptyNote}>
            No notification categories are set up for your account yet.
          </Text>
        ) : null}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + Spacing.md }]}>
        {savedOnce && !dirty ? (
          <View style={styles.footerNote}>
            <Ionicons name="checkmark-circle" size={15} color={Colors.foodVegGreen} />
            <Text style={styles.footerNoteText}>All changes saved</Text>
          </View>
        ) : null}
        <Pressable
          style={[styles.cta, (!dirty || isSaving) && styles.ctaOff]}
          onPress={save}
          disabled={!dirty || isSaving}
          accessibilityRole="button"
          accessibilityLabel="Save changes"
        >
          {isSaving ? (
            <ActivityIndicator color={Colors.white} />
          ) : (
            <Text style={styles.ctaText}>Save changes</Text>
          )}
        </Pressable>
      </View>
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

  scroll: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.xs },

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

  card: {
    backgroundColor: Colors.foodSurface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
    ...Shadows.sm,
    borderWidth: 1,
    borderColor: Colors.foodBorder,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
  },
  cardTitle: { flex: 1, fontSize: 17, fontWeight: '700', color: Colors.foodText, letterSpacing: -0.2 },
  cardHint: {
    fontSize: 13.5,
    color: Colors.foodTextSecondary,
    lineHeight: 19,
    marginTop: Spacing.sm,
  },
  link: { color: t.accent, fontWeight: '700' },

  statusPill: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
  },
  statusPillOff: { backgroundColor: Colors.foodBgSecondary },
  statusPillOn: { backgroundColor: t.accentLight },
  statusText: { fontSize: 12.5, fontWeight: '700', letterSpacing: 0.3 },
  statusTextOff: { color: Colors.foodTextMuted },
  statusTextOn: { color: t.accentDark },

  emptyNote: {
    fontSize: 13.5,
    color: Colors.foodTextMuted,
    lineHeight: 19,
    paddingHorizontal: Spacing.xs,
    paddingTop: Spacing.sm,
  },

  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: Colors.foodBg,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
  },
  footerNote: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    marginBottom: Spacing.sm,
  },
  footerNoteText: { fontSize: 12.5, color: Colors.foodVegGreen, fontWeight: '700' },
  cta: {
    height: 54,
    borderRadius: BorderRadius.full,
    backgroundColor: t.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaOff: { opacity: 0.45 },
  ctaText: { fontSize: 15.5, fontWeight: '800', color: Colors.white, letterSpacing: 0.3 },

  primaryBtn: {
    backgroundColor: t.accent,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.full,
    marginTop: Spacing.sm,
  },
  primaryBtnText: { fontSize: 14, fontWeight: '700', color: Colors.white },
  });

const styles = makeStyles(ORANGE_ACCENT);
