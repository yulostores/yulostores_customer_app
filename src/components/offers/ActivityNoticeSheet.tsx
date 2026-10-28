/**
 * ActivityNoticeSheet — the one-time notice after sign-in that restaurants can see what this
 * customer browses (first name only) to send personal offers. "OK" keeps sharing on, "Turn off"
 * turns it off; both record the answer (OffersContext.answerNotice). Shown only when the
 * feature is on, never to guests (src/lib/offerText.ts → shouldShowActivityNotice).
 */
import { Ionicons } from '@expo/vector-icons';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../../constants/Colors';
import { BorderRadius, Spacing } from '../../constants/Theme';
import { useOffers } from '../../context/OffersContext';
import { useAccentTheme } from '../../hooks/useAccentTheme';
import { ACTIVITY_NOTICE } from '../../lib/offerText';

export default function ActivityNoticeSheet() {
  const { noticeVisible, answerNotice } = useOffers();
  const insets = useSafeAreaInsets();
  const { accent, accentLight } = useAccentTheme();
  if (!noticeVisible) return null;
  return (
    <Modal transparent animationType="slide" statusBarTranslucent navigationBarTranslucent onRequestClose={() => void answerNotice(false)}>
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { paddingBottom: Spacing.xl + insets.bottom }]} accessibilityViewIsModal>
          <View style={[styles.icon, { backgroundColor: accentLight }]}>
            <Ionicons name="eye-outline" size={24} color={accent} />
          </View>
          <Text style={styles.title} accessibilityRole="header">
            {ACTIVITY_NOTICE.title}
          </Text>
          <Text style={styles.body}>{ACTIVITY_NOTICE.body}</Text>
          <Pressable
            style={[styles.primary, { backgroundColor: accent }]}
            accessibilityRole="button"
            accessibilityLabel="OK, keep sharing"
            onPress={() => void answerNotice(false)}
          >
            <Text style={styles.primaryText}>OK</Text>
          </Pressable>
          <Pressable
            style={styles.secondary}
            accessibilityRole="button"
            accessibilityLabel="Turn off activity sharing"
            onPress={() => void answerNotice(true)}
          >
            <Text style={styles.secondaryText}>Turn off</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: {
    backgroundColor: Colors.foodSurface,
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.xl,
    gap: Spacing.md,
  },
  icon: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 19, fontWeight: '800', color: Colors.foodText },
  body: { fontSize: 14.5, lineHeight: 21, color: Colors.foodTextSecondary },
  primary: { borderRadius: BorderRadius.full, paddingVertical: Spacing.md, alignItems: 'center', marginTop: Spacing.sm },
  primaryText: { fontSize: 15, fontWeight: '800', color: Colors.white },
  secondary: { paddingVertical: Spacing.md, alignItems: 'center' },
  secondaryText: { fontSize: 15, fontWeight: '700', color: Colors.foodText },
});
