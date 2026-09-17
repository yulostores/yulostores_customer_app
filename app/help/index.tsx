/**
 * app/help/index.tsx — Help & Support landing, reached from the Profile tab.
 *
 * Nothing here is hard-coded. The topic rows are {@link ORDER_ISSUE_TOPICS} /
 * "Talk to support" from src/services/support.ts — each `category` is the exact
 * wire value the backend accepts (`SupportTicket.category`). Tapping one opens
 * the compose screen; submitting it there creates a real
 * `POST /api/support/tickets`. "Your requests" reads the customer's own tickets
 * (`GET /api/support/tickets` via useSupportTickets) and shows the live
 * open-request count.
 */

import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors } from '../../src/constants/Colors';
import { BorderRadius, Shadows, Spacing } from '../../src/constants/Theme';
import {
  ORANGE_ACCENT,
  useAccentTheme,
  useThemedStyles,
  type AccentTheme,
} from '../../src/hooks/useAccentTheme';
import { useSupportTickets } from '../../src/hooks/useSupportTickets';
import {
  ORDER_ISSUE_TOPICS,
  topicFor,
  type SupportTopic,
} from '../../src/services/support';

function goBack() {
  if (router.canGoBack()) router.back();
  else router.navigate('/(tabs)/profile');
}

// ─── One tappable row ────────────────────────────────────────────────────────

function HelpRow({
  icon,
  title,
  subtitle,
  meta,
  onPress,
  first,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle?: string;
  meta?: string;
  onPress: () => void;
  first?: boolean;
}) {
  const styles = useThemedStyles(makeStyles);
  const { accent } = useAccentTheme();
  return (
    <Pressable
      style={({ pressed }) => [
        styles.row,
        !first && styles.rowDivider,
        pressed && styles.rowPressed,
      ]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={title}
    >
      <View style={styles.rowIcon}>
        <Ionicons name={icon} size={19} color={accent} />
      </View>
      <View style={styles.rowText}>
        <Text style={styles.rowTitle}>{title}</Text>
        {subtitle ? <Text style={styles.rowSubtitle}>{subtitle}</Text> : null}
      </View>
      {meta ? <Text style={styles.rowMeta}>{meta}</Text> : null}
      <Ionicons name="chevron-forward" size={18} color={Colors.foodTextMuted} />
    </Pressable>
  );
}

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function HelpAndSupportScreen() {
  const { openCount, total, notSignedIn } = useSupportTickets();

  const openTopic = (topic: SupportTopic) =>
    router.push({ pathname: '/help/new', params: { category: topic.category } });

  const requestsMeta = notSignedIn
    ? undefined
    : openCount > 0
      ? `${openCount} open`
      : total > 0
        ? 'View all'
        : undefined;

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <StatusBar style="dark" />
      <View style={styles.header}>
        <Pressable onPress={goBack} hitSlop={10} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={Colors.foodText} />
        </Pressable>
        <Text style={styles.headerTitle}>Help &amp; Support</Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.intro}>
          Pick what went wrong and we’ll pick it up from there.
        </Text>

        <Text style={styles.sectionLabel}>Get help with an order</Text>
        <View style={styles.card}>
          {ORDER_ISSUE_TOPICS.map((topic, i) => (
            <HelpRow
              key={topic.category}
              icon={topic.icon}
              title={topic.title}
              subtitle={topic.blurb}
              onPress={() => openTopic(topic)}
              first={i === 0}
            />
          ))}
        </View>

        <Text style={styles.sectionLabel}>More</Text>
        <View style={styles.card}>
          <HelpRow
            icon={topicFor('other').icon}
            title={topicFor('other').title}
            subtitle={topicFor('other').blurb}
            onPress={() => openTopic(topicFor('other'))}
            first
          />
          <HelpRow
            icon="reader-outline"
            title="Your requests"
            subtitle="Track replies on issues you’ve raised"
            meta={requestsMeta}
            onPress={() => router.push('/help/requests')}
          />
        </View>

        <Text style={styles.footNote}>
          Raised requests stay in “Your requests” — our team follows up there.
        </Text>
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
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.sm + 2,
    borderBottomWidth: 1,
    borderBottomColor: Colors.foodBorder,
    backgroundColor: Colors.foodSurface,
  },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 18, fontWeight: '800', color: Colors.foodText, letterSpacing: -0.3 },

  scroll: { paddingHorizontal: Spacing.base, paddingTop: Spacing.base, paddingBottom: Spacing['2xl'] },

  intro: {
    fontSize: 14,
    color: Colors.foodTextSecondary,
    lineHeight: 20,
    marginBottom: Spacing.lg,
  },

  sectionLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: Colors.foodTextMuted,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: Spacing.sm,
  },

  card: {
    backgroundColor: Colors.foodSurface,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.foodBorder,
    overflow: 'hidden',
    marginBottom: Spacing.lg,
    ...Shadows.sm,
  },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md + 1,
    minHeight: 60,
  },
  rowDivider: { borderTopWidth: 1, borderTopColor: Colors.foodBorder },
  rowPressed: { backgroundColor: Colors.foodBgSecondary },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: BorderRadius.full,
    backgroundColor: t.accentLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: { flex: 1, gap: 2 },
  rowTitle: { fontSize: 15, fontWeight: '700', color: Colors.foodText },
  rowSubtitle: { fontSize: 12.5, color: Colors.foodTextSecondary, lineHeight: 17 },
  rowMeta: { fontSize: 12, fontWeight: '700', color: t.accent },

  footNote: {
    fontSize: 12,
    color: Colors.foodTextMuted,
    lineHeight: 17,
    paddingHorizontal: Spacing.xs,
  },
  });

const styles = makeStyles(ORANGE_ACCENT);
