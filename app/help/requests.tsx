/**
 * app/help/requests.tsx — "Your requests": every support ticket the customer has
 * raised, newest first.
 *
 * Pure presentation over useSupportTickets() (`GET /api/support/tickets`, paged).
 * Each row taps through to the ticket thread. Mirrors the Favorites / Orders
 * screens: FlatList with pull-to-refresh, end-reached paging, and the shared
 * "sign in" / "couldn't load" notices.
 */

import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors } from '../../src/constants/Colors';
import { BorderRadius, Shadows, Spacing } from '../../src/constants/Theme';
import { useAuth } from '../../src/context/AuthContext';
import { useSupportTickets } from '../../src/hooks/useSupportTickets';
import {
  formatTicketDate,
  shortTicketId,
  threadOf,
  ticketStatusMeta,
  topicFor,
  type SupportTicket,
} from '../../src/services/support';

function goBack() {
  if (router.canGoBack()) router.back();
  else router.navigate('/help');
}

const TONE_COLOR = {
  accent: Colors.foodAccent,
  positive: Colors.foodDeliveryBadge,
  muted: Colors.foodTextMuted,
} as const;

// ─── Ticket row ──────────────────────────────────────────────────────────────

function TicketRow({ ticket }: { ticket: SupportTicket }) {
  const status = ticketStatusMeta(ticket.status);
  const tone = TONE_COLOR[status.tone];
  const thread = threadOf(ticket);
  const last = thread[thread.length - 1];
  const lastLine = last
    ? `${last.from === 'you' ? 'You' : 'Support'}: ${last.text}`
    : ticket.description;

  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      onPress={() => router.push({ pathname: '/help/[id]', params: { id: ticket.id } })}
      accessibilityRole="button"
      accessibilityLabel={`${ticket.subject} — ${status.label}`}
    >
      <View style={styles.cardTop}>
        <View style={styles.topicIcon}>
          <Ionicons name={topicFor(ticket.category).icon} size={16} color={Colors.foodAccent} />
        </View>
        <Text style={styles.cardTitle} numberOfLines={1}>{ticket.subject}</Text>
        <View style={[styles.statusPill, { backgroundColor: tone + '1A' }]}>
          <View style={[styles.statusDot, { backgroundColor: tone }]} />
          <Text style={[styles.statusText, { color: tone }]}>{status.label}</Text>
        </View>
      </View>

      <Text style={styles.cardPreview} numberOfLines={2}>{lastLine}</Text>

      <View style={styles.cardBottom}>
        <Text style={styles.cardMeta}>#{shortTicketId(ticket.id)}</Text>
        <Text style={styles.cardMetaDot}>·</Text>
        <Text style={styles.cardMeta}>{formatTicketDate(ticket.createdAt)}</Text>
        {thread.length > 1 ? (
          <>
            <Text style={styles.cardMetaDot}>·</Text>
            <Text style={styles.cardMeta}>
              {thread.length} message{thread.length !== 1 ? 's' : ''}
            </Text>
          </>
        ) : null}
        <Ionicons
          name="chevron-forward"
          size={16}
          color={Colors.foodTextMuted}
          style={{ marginLeft: 'auto' }}
        />
      </View>
    </Pressable>
  );
}

// ─── Centered notice ─────────────────────────────────────────────────────────

function CenteredNotice({
  icon,
  title,
  message,
  actionLabel,
  onAction,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.centered}>
      <Ionicons name={icon} size={48} color={Colors.foodBorder} />
      <Text style={styles.noticeTitle}>{title}</Text>
      <Text style={styles.noticeText}>{message}</Text>
      {actionLabel && onAction ? (
        <Pressable style={styles.actionBtn} onPress={onAction}>
          <Text style={styles.actionBtnText}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function SupportRequestsScreen() {
  const { signOut } = useAuth();
  const {
    tickets,
    total,
    isLoading,
    isRefreshing,
    isPaging,
    error,
    notSignedIn,
    refresh,
    loadMore,
  } = useSupportTickets();

  const header = (
    <View style={styles.header}>
      <Pressable onPress={goBack} hitSlop={10} style={styles.backBtn}>
        <Ionicons name="arrow-back" size={22} color={Colors.foodText} />
      </Pressable>
      <Text style={styles.headerTitle}>Your requests</Text>
      <View style={styles.backBtn} />
    </View>
  );

  if (isLoading) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        {header}
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={Colors.foodAccent} />
        </View>
      </SafeAreaView>
    );
  }

  if (notSignedIn) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        {header}
        <CenteredNotice
          icon="lock-closed-outline"
          title="Sign in to see your requests"
          message="Support requests are saved to your account. Sign in again to pick up where you left off."
          actionLabel="Sign in"
          onAction={signOut}
        />
      </SafeAreaView>
    );
  }

  if (error && tickets.length === 0) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        {header}
        <CenteredNotice
          icon="alert-circle-outline"
          title="Couldn’t load your requests"
          message={error}
          actionLabel="Retry"
          onAction={refresh}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      {header}
      <FlatList
        data={tickets}
        keyExtractor={(t) => t.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => <TicketRow ticket={item} />}
        ListHeaderComponent={
          tickets.length > 0 ? (
            <Text style={styles.count}>
              {total} request{total !== 1 ? 's' : ''}
            </Text>
          ) : null
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="reader-outline" size={60} color={Colors.foodBorder} />
            <Text style={styles.emptyTitle}>No requests yet</Text>
            <Text style={styles.emptySubtitle}>
              When you raise a help request it shows up here with every reply.
            </Text>
            <Pressable style={styles.actionBtn} onPress={() => router.replace('/help')}>
              <Text style={styles.actionBtnText}>Get help</Text>
            </Pressable>
          </View>
        }
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={refresh}
            tintColor={Colors.foodAccent}
            colors={[Colors.foodAccent]}
          />
        }
        onEndReached={loadMore}
        onEndReachedThreshold={0.4}
        ListFooterComponent={
          isPaging ? (
            <ActivityIndicator style={{ marginVertical: 16 }} color={Colors.foodAccent} />
          ) : null
        }
      />
    </SafeAreaView>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
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

  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.md,
    padding: Spacing.xl,
  },
  noticeTitle: { fontSize: 18, fontWeight: '800', color: Colors.foodText, marginTop: 4 },
  noticeText: { fontSize: 14, color: Colors.foodTextSecondary, textAlign: 'center', lineHeight: 20 },
  actionBtn: {
    backgroundColor: Colors.foodAccent,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.full,
    marginTop: Spacing.sm,
  },
  actionBtnText: { fontSize: 14, fontWeight: '700', color: Colors.white },

  list: {
    paddingHorizontal: Spacing.base,
    paddingTop: Spacing.md,
    paddingBottom: 24,
    gap: Spacing.md,
  },
  count: { fontSize: 13, color: Colors.foodTextMuted, marginBottom: Spacing.sm },

  card: {
    backgroundColor: Colors.foodSurface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.base,
    borderWidth: 1,
    borderColor: Colors.foodBorder,
    ...Shadows.sm,
  },
  cardPressed: { opacity: 0.9, backgroundColor: Colors.foodBgSecondary },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  topicIcon: {
    width: 28,
    height: 28,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.foodAccentLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: { flex: 1, fontSize: 14.5, fontWeight: '800', color: Colors.foodText },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
  },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 11, fontWeight: '800' },

  cardPreview: {
    fontSize: 13,
    color: Colors.foodTextSecondary,
    lineHeight: 18,
    marginTop: Spacing.sm,
  },
  cardBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: Spacing.sm,
  },
  cardMeta: { fontSize: 12, color: Colors.foodTextMuted },
  cardMetaDot: { fontSize: 12, color: Colors.foodTextMuted },

  empty: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 72,
    paddingHorizontal: Spacing.xl,
    gap: Spacing.md,
  },
  emptyTitle: { fontSize: 19, fontWeight: '800', color: Colors.foodText },
  emptySubtitle: { fontSize: 14, color: Colors.foodTextSecondary, textAlign: 'center', lineHeight: 20 },
});
