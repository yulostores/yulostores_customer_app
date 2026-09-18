/**
 * app/(tabs)/profile.tsx — the customer's account screen.
 *
 * Nothing on this screen is hard-coded. The identity block (name, phone, avatar,
 * "member since", saved-address count) is the customer's own record from
 * `GET /api/users/me` via useProfile(); the "Veg-fleet preference" switch reads
 * and writes `preferences.vegFleetPreferenceEnabled` via useVegFleetPreference().
 * The menu itself is a declarative config (`MENU` below) rendered generically —
 * add a row by adding an entry, not by writing markup.
 *
 * Layout follows the Swiggy/Zomato account-page idiom: a back arrow beside a
 * large title, a tappable identity card (tap → edit profile), then one rounded
 * card per menu row. "Log out" is styled in the app's danger red and confirms
 * before clearing the session, so it never reads as just another navigation row.
 */

import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect, type Href } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RemoteImage } from '../../src/components/RemoteImage';
import { Colors } from '../../src/constants/Colors';
import { BorderRadius, Elevation, Spacing } from '../../src/constants/Theme';
import { useAuth } from '../../src/context/AuthContext';
import {
  ORANGE_ACCENT,
  useAccentTheme,
  useThemedStyles,
  type AccentTheme,
} from '../../src/hooks/useAccentTheme';
import { useProfile } from '../../src/hooks/useProfile';
import { useVegFleetPreference } from '../../src/hooks/useVegFleetPreference';
import {
  displayName,
  formatPhone,
  initialsFor,
  type CustomerProfile,
} from '../../src/services/profile';

const ROW_RADIUS = 20;

type IoniconName = keyof typeof Ionicons.glyphMap;

/** One menu row. `link` navigates, `toggle` is the veg-fleet switch, `danger` is
 *  the sign-out action. */
type MenuRow =
  | { key: string; label: string; icon: IoniconName; kind: 'link'; route: string }
  | { key: string; label: string; icon: IoniconName; kind: 'toggle' | 'danger' };

function goBack() {
  // Profile is a root tab, so there is often nothing to pop — fall back to Home.
  if (router.canGoBack()) router.back();
  else router.navigate('/(tabs)');
}

const MENU: readonly MenuRow[] = [
  { key: 'orders', label: 'Order history', icon: 'time-outline', kind: 'link', route: '/(tabs)/orders' },
  { key: 'favorites', label: 'Favorites', icon: 'heart-outline', kind: 'link', route: '/favorites' },
  { key: 'addresses', label: 'Saved addresses', icon: 'location-outline', kind: 'link', route: '/address' },
  { key: 'veg-fleet', label: 'Veg-fleet preference', icon: 'leaf-outline', kind: 'toggle' },
  { key: 'notifications', label: 'Notifications', icon: 'notifications-outline', kind: 'link', route: '/notifications' },
  { key: 'settings', label: 'Settings', icon: 'settings-outline', kind: 'link', route: '/settings' },
  { key: 'help', label: 'Help & support', icon: 'help-buoy-outline', kind: 'link', route: '/help' },
  { key: 'logout', label: 'Log out', icon: 'log-out-outline', kind: 'danger' },
] as const;

// ─── Identity card ───────────────────────────────────────────────────────────

/** Shown instead of the real identity card while browsing as a guest — the
 *  fetched profile has no name/phone worth showing, so this replaces it outright
 *  rather than rendering a card that just looks broken. */
function GuestIdentityCard() {
  const styles = useThemedStyles(makeStyles);
  const { accent } = useAccentTheme();

  return (
    <View style={styles.identityCard}>
      <View style={[styles.avatar, styles.avatarFallback]}>
        <Ionicons name="person-outline" size={28} color={Colors.white} />
      </View>

      <View style={styles.identityText}>
        <Text style={styles.name} numberOfLines={1}>Browsing as guest</Text>
        <Text style={styles.contact} numberOfLines={2}>
          Sign in to check out, track orders and get support.
        </Text>
      </View>

      <Pressable
        style={[styles.guestSignInBtn, { backgroundColor: accent }]}
        onPress={() => router.push('/sign-in')}
        accessibilityRole="button"
        accessibilityLabel="Sign in"
      >
        <Text style={styles.guestSignInText}>Sign in</Text>
      </Pressable>
    </View>
  );
}

function IdentityCard({ profile, onEdit }: { profile: CustomerProfile; onEdit: () => void }) {
  const styles = useThemedStyles(makeStyles);
  const name = displayName(profile);
  const initials = initialsFor(profile);
  // Don't repeat the phone as the sub-line when it's already standing in for the name.
  const contact =
    profile.name && profile.phone
      ? formatPhone(profile.phone)
      : profile.email ?? null;

  return (
    <Pressable
      style={({ pressed }) => [styles.identityCard, pressed && styles.rowPressed]}
      onPress={onEdit}
      accessibilityRole="button"
      accessibilityLabel={`${name}, edit profile`}
    >
      {profile.avatarUrl ? (
        <RemoteImage uri={profile.avatarUrl} style={styles.avatar} icon="person" iconSize={28} />
      ) : (
        <View style={[styles.avatar, styles.avatarFallback]}>
          {initials ? (
            <Text style={styles.avatarInitials}>{initials}</Text>
          ) : (
            <Ionicons name="person" size={28} color={Colors.white} />
          )}
        </View>
      )}

      <View style={styles.identityText}>
        <Text style={styles.name} numberOfLines={1}>{name}</Text>
        {contact ? <Text style={styles.contact} numberOfLines={1}>{contact}</Text> : null}
      </View>
    </Pressable>
  );
}

// ─── One menu row ────────────────────────────────────────────────────────────

function Row({ row, onPress, right }: { row: MenuRow; onPress?: () => void; right: ReactNode }) {
  const danger = row.kind === 'danger';
  const iconColor = danger ? Colors.danger : Colors.foodTextSecondary;
  const labelColor = danger ? Colors.danger : Colors.foodText;

  return (
    <Pressable
      style={({ pressed }) => [
        styles.row,
        danger && styles.rowDanger,
        pressed && onPress && styles.rowPressed,
      ]}
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={row.label}
    >
      <Ionicons name={row.icon} size={22} color={iconColor} />
      <Text style={[styles.rowLabel, danger && styles.rowLabelDanger, { color: labelColor }]}>
        {row.label}
      </Text>
      {right}
    </Pressable>
  );
}

// ─── Veg-fleet confirmation sheet ───────────────────────────────────────────

/** Shown once, right after the customer turns the veg-fleet switch on — a
 *  bottom sheet confirming what the preference actually does. */
function VegFleetConfirmSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const styles = useThemedStyles(makeStyles);
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.sheetBackdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <View style={styles.sheetHandle} />
          <View style={styles.sheetIconCircle}>
            <Ionicons name="leaf" size={26} color={Colors.foodVegGreen} />
          </View>
          <Text style={styles.sheetHeading}>Veg-fleet preference on</Text>
          <Text style={styles.sheetBody}>
            Your order will be handled by our veg fleet delivery partner.
          </Text>
          <Pressable style={styles.sheetBtn} onPress={onClose} accessibilityRole="button">
            <Text style={styles.sheetBtnText}>Got it</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function ProfileScreen() {
  const styles = useThemedStyles(makeStyles);
  const { accent, accentDark } = useAccentTheme();
  const { isGuest, signOut } = useAuth();
  const { profile, isLoading, isRefreshing, error, refresh } = useProfile();
  const vegFleet = useVegFleetPreference();
  const [showVegFleetConfirm, setShowVegFleetConfirm] = useState(false);

  // Pick up name/avatar changes made on the edit-profile screen — skip the
  // very first focus, since useProfile already loads once on mount.
  const mountedOnceRef = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (mountedOnceRef.current) refresh();
      else mountedOnceRef.current = true;
    }, [refresh]),
  );

  const confirmSignOut = () => {
    if (isGuest) {
      // Nothing to lose a confirmation over — a guest session is just cleared,
      // dropping the customer back on sign-in.
      signOut();
      return;
    }
    Alert.alert('Log out?', 'You’ll need to sign in again to place orders.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log out', style: 'destructive', onPress: signOut },
    ]);
  };

  const addressCount = profile?.savedAddressCount ?? 0;

  const header = (
    <View style={styles.header}>
      <Pressable
        onPress={goBack}
        hitSlop={12}
        style={styles.backBtn}
        accessibilityRole="button"
        accessibilityLabel="Go back"
      >
        <Ionicons name="arrow-back" size={26} color={Colors.foodText} />
      </Pressable>
      <Text style={styles.title}>Profile</Text>
    </View>
  );

  // First load with nothing to show yet.
  if (isLoading && !profile) {
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

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <StatusBar style="dark" />
      {header}

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={refresh}
            tintColor={accent}
            colors={[accent]}
          />
        }
      >
        {error ? (
          <Pressable style={styles.errorBanner} onPress={refresh}>
            <Ionicons name="cloud-offline-outline" size={16} color={accentDark} />
            <Text style={styles.errorText} numberOfLines={1}>Couldn’t refresh your profile</Text>
            <Text style={styles.errorRetry}>Retry</Text>
          </Pressable>
        ) : null}

        {isGuest ? (
          <GuestIdentityCard />
        ) : profile ? (
          <IdentityCard profile={profile} onEdit={() => router.push('/profile/edit')} />
        ) : null}

        <View style={styles.menu}>
          {MENU.map((row) => {
            if (row.kind === 'link') {
              const subtitle =
                row.key === 'addresses' && addressCount > 0 ? `${addressCount} saved` : null;
              return (
                <Row
                  key={row.key}
                  row={row}
                  onPress={() => router.push(row.route as Href)}
                  right={
                    <View style={styles.rowRight}>
                      {subtitle ? <Text style={styles.rowMeta}>{subtitle}</Text> : null}
                      <Ionicons name="chevron-forward" size={20} color={Colors.foodText} />
                    </View>
                  }
                />
              );
            }

            if (row.kind === 'toggle') {
              return (
                <Row
                  key={row.key}
                  row={row}
                  right={
                    vegFleet.isLoading ? (
                      <ActivityIndicator size="small" color={Colors.foodTextMuted} />
                    ) : (
                      <Switch
                        value={vegFleet.enabled}
                        onValueChange={(next) => {
                          vegFleet.setEnabled(next);
                          if (next) setShowVegFleetConfirm(true);
                        }}
                        disabled={!vegFleet.available || vegFleet.isSaving}
                        trackColor={{ false: Colors.toggleTrackOff, true: Colors.foodVegGreen }}
                        thumbColor={Colors.toggleThumb}
                        ios_backgroundColor={Colors.toggleTrackOff}
                      />
                    )
                  }
                />
              );
            }

            // danger — Log out (relabelled for a guest, who has nothing to confirm)
            return (
              <Row
                key={row.key}
                row={isGuest ? { ...row, label: 'Exit guest mode' } : row}
                onPress={confirmSignOut}
                right={<Ionicons name="chevron-forward" size={20} color={Colors.danger} />}
              />
            );
          })}
        </View>

        <View style={{ height: Spacing['2xl'] }} />
      </ScrollView>

      <VegFleetConfirmSheet
        visible={showVegFleetConfirm}
        onClose={() => setShowVegFleetConfirm(false)}
      />
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
    gap: Spacing.base,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.lg,
  },
  backBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  title: {
    fontSize: 34,
    fontWeight: '800',
    color: Colors.foodText,
    letterSpacing: -0.8,
  },

  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  scroll: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.xs },

  // Transient "couldn't refresh" strip
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

  // Identity card
  identityCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.base,
    backgroundColor: Colors.foodSurface,
    borderRadius: ROW_RADIUS,
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md + 2,
    ...Elevation.card,
    borderWidth: 1,
    borderColor: Colors.foodBorder,
  },
  avatar: { width: 60, height: 60, borderRadius: BorderRadius.full },
  avatarFallback: {
    backgroundColor: t.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitials: { fontSize: 20, fontWeight: '600', color: Colors.white },
  identityText: { flex: 1, gap: 4 },
  name: { fontSize: 19, fontWeight: '600', color: Colors.foodText, letterSpacing: -0.2 },
  contact: { fontSize: 15, color: Colors.foodTextSecondary, letterSpacing: 0.2 },
  guestSignInBtn: {
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.sm + 2,
    borderRadius: BorderRadius.full,
  },
  guestSignInText: { fontSize: 13.5, fontWeight: '800', color: Colors.white },

  // Menu
  menu: { marginTop: Spacing.xl, gap: Spacing.md },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.base,
    minHeight: 60,
    backgroundColor: Colors.foodSurface,
    borderRadius: ROW_RADIUS,
    paddingHorizontal: Spacing.base + 2,
    paddingVertical: Spacing.md,
    ...Elevation.card,
    borderWidth: 1,
    borderColor: Colors.foodBorder,
  },
  rowDanger: { marginTop: Spacing.xs },
  rowPressed: { backgroundColor: Colors.foodBgSecondary },
  rowLabel: { flex: 1, fontSize: 16.5, fontWeight: '500', letterSpacing: -0.1 },
  rowLabelDanger: { fontWeight: '600' },
  rowRight: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  rowMeta: { fontSize: 13, color: Colors.foodTextMuted },

  // Veg-fleet confirmation sheet
  sheetBackdrop: { flex: 1, backgroundColor: Colors.locScrim, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: Colors.foodSurface,
    ...Elevation.sheet,
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.xl,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.foodBorder,
    marginBottom: Spacing.lg,
  },
  sheetIconCircle: {
    width: 48,
    height: 48,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.foodPureVegBg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.md,
  },
  sheetHeading: {
    fontSize: 20,
    fontWeight: '800',
    color: Colors.foodText,
    letterSpacing: -0.3,
    marginBottom: Spacing.sm,
  },
  sheetBody: {
    fontSize: 15,
    lineHeight: 21,
    color: Colors.foodTextSecondary,
    marginBottom: Spacing.lg,
  },
  sheetBtn: {
    backgroundColor: Colors.foodVegGreen,
    borderRadius: BorderRadius.full,
    paddingVertical: Spacing.md,
    alignItems: 'center',
  },
  sheetBtnText: { fontSize: 16, fontWeight: '700', color: Colors.white },
  });

const styles = makeStyles(ORANGE_ACCENT);
