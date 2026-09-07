/**
 * app/help/[id].tsx — one support request and its thread.
 *
 * Reads `GET /api/support/tickets/:id` via useSupportTicket(); the thread is the
 * original description followed by every reply (`threadOf`). The composer posts
 * `POST /api/support/tickets/:id/messages` — optimistic, rolled back on failure.
 * A closed ticket takes no further replies, so the composer is replaced with a
 * note.
 */

import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors } from '../../src/constants/Colors';
import { BorderRadius, Shadows, Spacing } from '../../src/constants/Theme';
import { useAuth } from '../../src/context/AuthContext';
import { useSupportTicket } from '../../src/hooks/useSupportTicket';
import {
  formatMessageTime,
  formatTicketDate,
  isTicketClosed,
  shortTicketId,
  threadOf,
  ticketStatusMeta,
  type TicketMessage,
} from '../../src/services/support';

const MAX_REPLY = 1000;

function goBack() {
  if (router.canGoBack()) router.back();
  else router.navigate('/help');
}

const TONE_COLOR = {
  accent: Colors.foodAccent,
  positive: Colors.foodDeliveryBadge,
  muted: Colors.foodTextMuted,
} as const;

// ─── Message bubble ──────────────────────────────────────────────────────────

function Bubble({ message }: { message: TicketMessage }) {
  const mine = message.from === 'you';
  return (
    <View style={[styles.bubbleRow, mine ? styles.bubbleRowMine : styles.bubbleRowTheirs]}>
      <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}>
        {!mine ? <Text style={styles.bubbleSender}>Support</Text> : null}
        <Text style={[styles.bubbleText, mine && styles.bubbleTextMine]}>{message.text}</Text>
      </View>
      {message.sentAt ? (
        <Text style={styles.bubbleTime}>{formatMessageTime(message.sentAt)}</Text>
      ) : null}
    </View>
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
      <Ionicons name={icon} size={46} color={Colors.foodBorder} />
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

export default function SupportTicketScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { signOut } = useAuth();
  const {
    ticket,
    isLoading,
    isRefreshing,
    isSending,
    error,
    notSignedIn,
    sendError,
    refresh,
    sendMessage,
  } = useSupportTicket(id ?? '');

  const [draft, setDraft] = useState('');
  const listRef = useRef<FlatList<TicketMessage>>(null);

  const scrollToEnd = useCallback(() => {
    requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
  }, []);

  const onSend = async () => {
    const body = draft.trim();
    if (!body || isSending) return;
    setDraft('');
    const ok = await sendMessage(body);
    if (ok) scrollToEnd();
    else setDraft(body); // restore so the customer doesn't lose their text
  };

  const header = (title: string, sub?: string) => (
    <View style={styles.header}>
      <Pressable onPress={goBack} hitSlop={10} style={styles.backBtn}>
        <Ionicons name="arrow-back" size={22} color={Colors.foodText} />
      </Pressable>
      <View style={styles.headerText}>
        <Text style={styles.headerTitle} numberOfLines={1}>{title}</Text>
        {sub ? <Text style={styles.headerSub} numberOfLines={1}>{sub}</Text> : null}
      </View>
      <View style={styles.backBtn} />
    </View>
  );

  if (isLoading) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        {header('Request')}
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={Colors.foodAccent} />
        </View>
      </SafeAreaView>
    );
  }

  if (notSignedIn) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        {header('Request')}
        <CenteredNotice
          icon="lock-closed-outline"
          title="Sign in to view this request"
          message="Support requests are tied to your account. Sign in again to pick up where you left off."
          actionLabel="Sign in"
          onAction={signOut}
        />
      </SafeAreaView>
    );
  }

  if (error || !ticket) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        {header('Request')}
        <CenteredNotice
          icon="alert-circle-outline"
          title="Couldn’t load this request"
          message={error ?? 'This request could not be found.'}
          actionLabel="Retry"
          onAction={refresh}
        />
      </SafeAreaView>
    );
  }

  const status = ticketStatusMeta(ticket.status);
  const tone = TONE_COLOR[status.tone];
  const thread = threadOf(ticket);
  const closed = isTicketClosed(ticket.status);
  const canSend = draft.trim().length > 0 && !isSending;
  const subLine = `#${shortTicketId(ticket.id)} · raised ${formatTicketDate(ticket.createdAt)}`;

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <StatusBar style="dark" />
      {header(ticket.subject, subLine)}

      <View style={[styles.statusStrip, { backgroundColor: tone + '14' }]}>
        <View style={[styles.statusDot, { backgroundColor: tone }]} />
        <Text style={[styles.statusText, { color: tone }]}>{status.label}</Text>
        {ticket.orderId ? (
          <Pressable
            style={styles.orderLink}
            onPress={() => router.push(`/order/${ticket.orderId}/track`)}
            hitSlop={6}
          >
            <Ionicons name="receipt-outline" size={13} color={Colors.foodTextSecondary} />
            <Text style={styles.orderLinkText}>
              Order #{ticket.orderId.slice(-6).toUpperCase()}
            </Text>
          </Pressable>
        ) : null}
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 8 : 0}
      >
        <FlatList
          ref={listRef}
          data={thread}
          keyExtractor={(_, i) => String(i)}
          renderItem={({ item }) => <Bubble message={item} />}
          contentContainerStyle={styles.thread}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={scrollToEnd}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={refresh}
              tintColor={Colors.foodAccent}
              colors={[Colors.foodAccent]}
            />
          }
          ListFooterComponent={
            closed ? (
              <Text style={styles.closedNote}>
                This request is closed. Start a new one from Help &amp; Support if you still need a hand.
              </Text>
            ) : (
              <Text style={styles.threadHint}>
                Our team replies here — you’ll see updates on this screen.
              </Text>
            )
          }
        />

        {sendError ? (
          <View style={styles.sendErrorStrip}>
            <Ionicons name="alert-circle" size={14} color={Colors.danger} />
            <Text style={styles.sendErrorText}>{sendError}</Text>
          </View>
        ) : null}

        {!closed ? (
          <View style={styles.composer}>
            <TextInput
              style={styles.composerInput}
              value={draft}
              onChangeText={(t) => setDraft(t.slice(0, MAX_REPLY))}
              placeholder="Write a reply…"
              placeholderTextColor={Colors.foodTextMuted}
              multiline
              maxLength={MAX_REPLY}
            />
            <Pressable
              style={[styles.sendBtn, !canSend && styles.sendBtnDisabled]}
              onPress={onSend}
              disabled={!canSend}
              accessibilityRole="button"
              accessibilityLabel="Send reply"
            >
              {isSending ? (
                <ActivityIndicator size="small" color={Colors.white} />
              ) : (
                <Ionicons name="arrow-up" size={19} color={Colors.white} />
              )}
            </Pressable>
          </View>
        ) : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.foodBg },
  flex: { flex: 1 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.sm + 2,
    borderBottomWidth: 1,
    borderBottomColor: Colors.foodBorder,
    backgroundColor: Colors.foodSurface,
  },
  backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  headerText: { flex: 1, alignItems: 'center', paddingHorizontal: Spacing.xs },
  headerTitle: { fontSize: 15.5, fontWeight: '800', color: Colors.foodText, letterSpacing: -0.2 },
  headerSub: { fontSize: 11.5, color: Colors.foodTextMuted, marginTop: 1 },

  statusStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.sm,
  },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  statusText: { fontSize: 12, fontWeight: '800' },
  orderLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginLeft: 'auto',
  },
  orderLinkText: { fontSize: 12, color: Colors.foodTextSecondary, fontWeight: '600' },

  thread: {
    padding: Spacing.base,
    gap: Spacing.md,
    flexGrow: 1,
  },

  bubbleRow: { maxWidth: '82%' },
  bubbleRowMine: { alignSelf: 'flex-end', alignItems: 'flex-end' },
  bubbleRowTheirs: { alignSelf: 'flex-start', alignItems: 'flex-start' },
  bubble: {
    borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 2,
  },
  bubbleMine: {
    backgroundColor: Colors.foodAccent,
    borderBottomRightRadius: 4,
  },
  bubbleTheirs: {
    backgroundColor: Colors.foodSurface,
    borderWidth: 1,
    borderColor: Colors.foodBorder,
    borderBottomLeftRadius: 4,
  },
  bubbleSender: {
    fontSize: 11,
    fontWeight: '800',
    color: Colors.foodTextMuted,
    letterSpacing: 0.4,
    marginBottom: 3,
    textTransform: 'uppercase',
  },
  bubbleText: { fontSize: 14, lineHeight: 20, color: Colors.foodText },
  bubbleTextMine: { color: Colors.white },
  bubbleTime: { fontSize: 10.5, color: Colors.foodTextMuted, marginTop: 4, marginHorizontal: 4 },

  threadHint: {
    fontSize: 12,
    color: Colors.foodTextMuted,
    textAlign: 'center',
    marginTop: Spacing.lg,
    paddingHorizontal: Spacing.lg,
    lineHeight: 17,
  },
  closedNote: {
    fontSize: 12.5,
    color: Colors.foodTextMuted,
    textAlign: 'center',
    marginTop: Spacing.lg,
    paddingHorizontal: Spacing.lg,
    lineHeight: 18,
  },

  sendErrorStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.sm,
    backgroundColor: '#FDECEC',
  },
  sendErrorText: { fontSize: 12.5, color: Colors.danger, fontWeight: '600' },

  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.base,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.base,
    borderTopWidth: 1,
    borderTopColor: Colors.foodBorder,
    backgroundColor: Colors.foodSurface,
  },
  composerInput: {
    flex: 1,
    maxHeight: 120,
    minHeight: 44,
    borderRadius: BorderRadius.lg,
    borderWidth: 1.5,
    borderColor: Colors.foodBorder,
    backgroundColor: Colors.foodBg,
    paddingHorizontal: Spacing.base,
    paddingTop: Platform.OS === 'ios' ? 12 : 8,
    paddingBottom: Platform.OS === 'ios' ? 12 : 8,
    fontSize: 14.5,
    lineHeight: 20,
    color: Colors.foodText,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.foodAccent,
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadows.sm,
  },
  sendBtnDisabled: { backgroundColor: Colors.foodBorder },

  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.md,
    padding: Spacing.xl,
  },
  noticeTitle: { fontSize: 17, fontWeight: '800', color: Colors.foodText, marginTop: 4 },
  noticeText: { fontSize: 13.5, color: Colors.foodTextSecondary, textAlign: 'center', lineHeight: 19 },
  actionBtn: {
    backgroundColor: Colors.foodAccent,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.full,
    marginTop: Spacing.sm,
  },
  actionBtnText: { fontSize: 14, fontWeight: '700', color: Colors.white },
});
