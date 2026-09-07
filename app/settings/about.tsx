/**
 * app/settings/about.tsx — "About Yulo Stores".
 *
 * Every line except the build number comes from `GET /api/app/config` → `about`
 * (useAppConfig): the app name, tagline, legal entity, registered address,
 * website / help-centre / social links, support email and phone, and the
 * copyright (year-stamped server-side). The version string is the one thing the
 * backend can't know — it's read from the native bundle via expo-constants.
 */

import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import {
  ActivityIndicator,
  Linking,
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

function goBack() {
  if (router.canGoBack()) router.back();
  else router.navigate('/settings');
}

function openUrl(url: string) {
  Linking.openURL(url).catch(() => {});
}

/** The app's own version + build, from the native bundle (not the backend). */
function versionLabel(): string {
  const version = Constants.expoConfig?.version ?? '—';
  const build =
    Constants.nativeBuildVersion != null ? String(Constants.nativeBuildVersion) : null;
  return build && build !== version ? `Version ${version} (${build})` : `Version ${version}`;
}

function iconForSocial(id: string): keyof typeof Ionicons.glyphMap {
  switch (id) {
    case 'instagram':
      return 'logo-instagram';
    case 'x':
    case 'twitter':
      return 'logo-twitter';
    case 'linkedin':
      return 'logo-linkedin';
    case 'facebook':
      return 'logo-facebook';
    case 'youtube':
      return 'logo-youtube';
    default:
      return 'link-outline';
  }
}

function ActionRow({
  icon,
  label,
  value,
  onPress,
  first,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value?: string;
  onPress: () => void;
  first: boolean;
}) {
  return (
    <Pressable
      style={({ pressed }) => [styles.actionRow, !first && styles.rowDivider, pressed && styles.rowPressed]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Ionicons name={icon} size={19} color={Colors.foodText} />
      <View style={styles.actionText}>
        <Text style={styles.actionLabel}>{label}</Text>
        {value ? <Text style={styles.actionValue}>{value}</Text> : null}
      </View>
      <Ionicons name="chevron-forward" size={17} color={Colors.foodTextMuted} />
    </Pressable>
  );
}

export default function AboutScreen() {
  const styles = useThemedStyles(makeStyles);
  const { accent } = useAccentTheme();
  const { config, isLoading, error, refresh } = useAppConfig();

  const header = (
    <View style={styles.header}>
      <Pressable onPress={goBack} hitSlop={10} style={styles.backBtn}>
        <Ionicons name="arrow-back" size={24} color={Colors.foodText} />
      </Pressable>
      <Text style={styles.title} numberOfLines={2}>
        {config ? `About ${config.about.appName}` : 'About'}
      </Text>
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
          <Text style={styles.centeredTitle}>Couldn’t load this page</Text>
          <Text style={styles.centeredText}>{error ?? 'Check your connection and try again.'}</Text>
          <Pressable style={styles.primaryBtn} onPress={refresh}>
            <Text style={styles.primaryBtnText}>Try again</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const { about } = config;

  // Website + help centre + socials, in one list rendered as tappable rows.
  const links: { icon: keyof typeof Ionicons.glyphMap; label: string; url: string }[] = [];
  if (about.websiteUrl) links.push({ icon: 'globe-outline', label: 'Website', url: about.websiteUrl });
  if (about.helpCentreUrl) {
    links.push({ icon: 'help-buoy-outline', label: 'Help centre', url: about.helpCentreUrl });
  }
  for (const s of about.socialLinks) {
    links.push({ icon: iconForSocial(s.id), label: s.label, url: s.url });
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <StatusBar style="dark" />
      {header}

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* Identity */}
        <View style={styles.identity}>
          <Text style={styles.appName}>{about.appName}</Text>
          {about.tagline ? <Text style={styles.tagline}>{about.tagline}</Text> : null}
          <Text style={styles.version}>{versionLabel()}</Text>
        </View>

        {/* Links */}
        {links.length > 0 && (
          <>
            <Text style={styles.sectionLabel}>Links</Text>
            <View style={styles.card}>
              {links.map((l, i) => (
                <ActionRow
                  key={l.label}
                  icon={l.icon}
                  label={l.label}
                  onPress={() => openUrl(l.url)}
                  first={i === 0}
                />
              ))}
            </View>
          </>
        )}

        {/* Contact */}
        {(about.supportEmail || about.supportPhone) && (
          <>
            <Text style={styles.sectionLabel}>Contact</Text>
            <View style={styles.card}>
              {about.supportEmail ? (
                <ActionRow
                  icon="mail-outline"
                  label="Email support"
                  value={about.supportEmail}
                  onPress={() => openUrl(`mailto:${about.supportEmail}`)}
                  first
                />
              ) : null}
              {about.supportPhone ? (
                <ActionRow
                  icon="call-outline"
                  label="Call support"
                  value={about.supportPhone}
                  onPress={() => openUrl(`tel:${about.supportPhone!.replace(/[^\d+]/g, '')}`)}
                  first={!about.supportEmail}
                />
              ) : null}
            </View>
          </>
        )}

        {/* Company */}
        <Text style={styles.sectionLabel}>Company</Text>
        <View style={styles.card}>
          <View style={styles.companyBlock}>
            <Text style={styles.companyName}>{about.legalName}</Text>
            {about.addressLines.map((line, i) => (
              <Text key={i} style={styles.companyLine}>{line}</Text>
            ))}
          </View>
        </View>

        {about.copyright ? <Text style={styles.copyright}>{about.copyright}</Text> : null}
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
    fontSize: 26,
    fontWeight: '800',
    color: Colors.foodText,
    letterSpacing: -0.5,
    lineHeight: 32,
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

  scroll: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.xs, paddingBottom: Spacing['3xl'] },

  identity: { alignItems: 'center', paddingVertical: Spacing.lg },
  appName: { fontSize: 24, fontWeight: '800', color: Colors.foodText, letterSpacing: -0.4 },
  tagline: {
    fontSize: 13.5,
    color: Colors.foodTextSecondary,
    textAlign: 'center',
    marginTop: Spacing.xs,
    lineHeight: 19,
  },
  version: { fontSize: 12.5, color: Colors.foodTextMuted, marginTop: Spacing.sm },

  sectionLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: Colors.foodTextMuted,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginTop: Spacing.lg,
    marginBottom: Spacing.sm,
  },

  card: {
    backgroundColor: Colors.foodSurface,
    borderRadius: BorderRadius.lg,
    overflow: 'hidden',
    ...Shadows.sm,
  },

  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
    minHeight: 56,
  },
  rowDivider: { borderTopWidth: 1, borderTopColor: Colors.foodBorder },
  rowPressed: { backgroundColor: Colors.foodBgSecondary },
  actionText: { flex: 1, gap: 1 },
  actionLabel: { fontSize: 14.5, fontWeight: '600', color: Colors.foodText },
  actionValue: { fontSize: 12.5, color: Colors.foodTextMuted },

  companyBlock: { padding: Spacing.base, gap: 3 },
  companyName: { fontSize: 14, fontWeight: '700', color: Colors.foodText, marginBottom: 2 },
  companyLine: { fontSize: 13, color: Colors.foodTextSecondary, lineHeight: 18 },

  copyright: {
    fontSize: 12,
    color: Colors.foodTextMuted,
    textAlign: 'center',
    marginTop: Spacing.xl,
  },
  });

const styles = makeStyles(ORANGE_ACCENT);
