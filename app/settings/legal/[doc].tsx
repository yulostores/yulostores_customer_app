/**
 * app/settings/legal/[doc].tsx — one legal document (Terms of Service, Privacy
 * & data, …).
 *
 * `:doc` is a document id from `GET /api/app/config` → `legal[].id`. The screen
 * reads it with `GET /api/app/legal/:doc` (useLegalDocument) and renders the
 * `{ heading, body }` sections natively — no webview, no markdown, and readable
 * offline once loaded. The title and "Last updated" date come from the payload,
 * so the same screen serves every document without a line of per-document code.
 */

import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors } from '../../../src/constants/Colors';
import { BorderRadius, Shadows, Spacing } from '../../../src/constants/Theme';
import {
  ORANGE_ACCENT,
  useAccentTheme,
  useThemedStyles,
  type AccentTheme,
} from '../../../src/hooks/useAccentTheme';
import { useLegalDocument } from '../../../src/hooks/useLegalDocument';

function goBack() {
  if (router.canGoBack()) router.back();
  else router.navigate('/settings');
}

function formatUpdated(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return `Last updated ${d.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })}`;
}

export default function LegalDocumentScreen() {
  const styles = useThemedStyles(makeStyles);
  const { accent } = useAccentTheme();
  const { doc } = useLocalSearchParams<{ doc: string }>();
  const { document, isLoading, error, notFound, refresh } = useLegalDocument(doc);

  const headerTitle = document?.title ?? 'Legal';
  const header = (
    <View style={styles.header}>
      <Pressable onPress={goBack} hitSlop={10} style={styles.backBtn}>
        <Ionicons name="arrow-back" size={24} color={Colors.foodText} />
      </Pressable>
      <Text style={styles.title} numberOfLines={2}>{headerTitle}</Text>
    </View>
  );

  if (isLoading && !document) {
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

  if (notFound) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <StatusBar style="dark" />
        {header}
        <View style={styles.centered}>
          <Ionicons name="document-outline" size={44} color={Colors.foodBorder} />
          <Text style={styles.centeredTitle}>Document not found</Text>
          <Text style={styles.centeredText}>This policy isn’t available right now.</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!document) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <StatusBar style="dark" />
        {header}
        <View style={styles.centered}>
          <Ionicons name="cloud-offline-outline" size={44} color={Colors.foodBorder} />
          <Text style={styles.centeredTitle}>Couldn’t load this document</Text>
          <Text style={styles.centeredText}>{error ?? 'Check your connection and try again.'}</Text>
          <Pressable style={styles.primaryBtn} onPress={refresh}>
            <Text style={styles.primaryBtnText}>Try again</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const updated = formatUpdated(document.updatedAt);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <StatusBar style="dark" />
      {header}

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {updated ? <Text style={styles.updated}>{updated}</Text> : null}

        <View style={styles.card}>
          {document.sections.map((section, i) => (
            <View key={`${section.heading}-${i}`} style={[styles.section, i > 0 && styles.sectionGap]}>
              {section.heading ? <Text style={styles.sectionHeading}>{section.heading}</Text> : null}
              {section.body ? <Text style={styles.sectionBody}>{section.body}</Text> : null}
            </View>
          ))}

          {document.sections.length === 0 ? (
            <Text style={styles.sectionBody}>This document has no content yet.</Text>
          ) : null}
        </View>

        {document.canonicalUrl ? (
          <Pressable
            style={styles.linkRow}
            onPress={() => Linking.openURL(document.canonicalUrl as string).catch(() => {})}
            accessibilityRole="link"
          >
            <Ionicons name="open-outline" size={16} color={accent} />
            <Text style={styles.linkText}>View the full version online</Text>
          </Pressable>
        ) : null}
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

  updated: {
    fontSize: 12.5,
    color: Colors.foodTextMuted,
    marginBottom: Spacing.md,
  },

  card: {
    backgroundColor: Colors.foodSurface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    ...Shadows.sm,
  },
  section: {},
  sectionGap: { marginTop: Spacing.lg },
  sectionHeading: {
    fontSize: 15.5,
    fontWeight: '800',
    color: Colors.foodText,
    marginBottom: Spacing.xs,
    letterSpacing: -0.2,
  },
  sectionBody: {
    fontSize: 14,
    color: Colors.foodTextSecondary,
    lineHeight: 21,
  },

  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
    paddingVertical: Spacing.base,
    paddingHorizontal: Spacing.xs,
    marginTop: Spacing.sm,
  },
  linkText: { fontSize: 13.5, fontWeight: '700', color: t.accent },
  });

const styles = makeStyles(ORANGE_ACCENT);
