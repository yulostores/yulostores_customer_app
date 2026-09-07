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
 * "Log out" is styled in the app's danger red and confirms before clearing the
 * session, so it never reads as just another navigation row.
 */

import { Ionicons } from '@expo/vector-icons';
import { router, type Href } from 'expo-router';
import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Alert,
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
import { BorderRadius, Shadows, Spacing } from '../../src/constants/Theme';
import { useAuth } from '../../src/context/AuthContext';
import { useProfile } from '../../src/hooks/useProfile';
import { useVegFleetPreference } from '../../src/hooks/useVegFleetPreference';
import {
  displayName,
  formatPhone,
  initialsFor,
  memberSinceLabel,
  type CustomerProfile,
} from '../../src/services/profile';

type IoniconName = keyof typeof Ionicons.glyphMap;

/** One menu row. `link` navigates, `toggle` is the veg-fleet switch, `soon` is a
 *  parked feature, `danger` is the sign-out action. */
type MenuRow =
  | { key: string; label: string; icon: IoniconName; kind: 'link'; route: string }
  | { key: string; label: string; icon: IoniconName; kind: 'toggle' | 'soon' | 'danger' };

const MENU: readonly MenuRow[] = [
  { key: 'orders', label: 'Order history', icon: 'time-outline', kind: 'link', route: '/(tabs)/orders' },
  { key: 'favorites', label: 'Favorites', icon: 'heart-outline', kind: 'link', route: '/favorites' },
  { key: 'addresses', label: 'Saved addresses', icon: 'location-outline', kind: 'link', route: '/address' },
  { key: 'veg-fleet', label: 'Veg-fleet preference', icon: 'leaf-outline', kind: 'toggle' },
  { key: 'settings', label: 'Settings', icon: 'settings-outline', kind: 'soon' },
  { key: 'help', label: 'Help & support', icon: 'help-buoy-outline', kind: 'link', route: '/help' },
  { key: 'logout', label: 'Log out', icon: 'log-out-outline', kind: 'danger' },
] as const;

// ─── Identity card ───────────────────────────────────────────────────────────

function IdentityCard({ profile }: { profile: CustomerProfile }) {
  const name = displayName(profile);
  const initials = initialsFor(profile);
  // Don't repeat the phone as the sub-line when it's already standing in for the name.
  const contact =
    profile.name && profile.phone
      ? formatPhone(profile.phone)
      : profile.email ?? null;
  const since = memberSinceLabel(profile.memberSince);

  return (
    <View style={styles.identityCard}>
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
        {since ? <Text style={styles.since}>{since}</Text> : null}
      </View>
    </View>
  );
}

// ─── One menu row ────────────────────────────────────────────────────────────

function Row({ row, onPress, right }: { row: MenuRow; onPress?: () => void; right: ReactNode }) {
  const danger = row.kind === 'danger';
  const dim = row.kind === 'soon';
  const iconColor = danger ? Colors.danger : dim ? Colors.foodTextMuted : Colors.foodText;
  const labelColor = danger ? Colors.danger : dim ? Colors.foodTextSecondary : Colors.foodText;

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
      <Text style={[styles.rowLabel, { color: labelColor }]}>{row.label}</Text>
      {right}
    </Pressable>
  );
}

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function ProfileScreen() {
  const { signOut } = useAuth();
  const { profile, isLoading, isRefreshing, error, refresh } = useProfile();
  const vegFleet = useVegFleetPreference();

  const confirmSignOut = () => {
    Alert.alert('Log out?', 'You’ll need to sign in again to place orders.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log out', style: 'destructive', onPress: signOut },
    ]);
  };

  const addressCount = profile?.savedAddressCount ?? 0;

  // First load with nothing to show yet.
  if (isLoading && !profile) {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <Text style={styles.title}>Profile</Text>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={Colors.foodAccent} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <Text style={styles.title}>Profile</Text>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={refresh}
            tintColor={Colors.foodAccent}
            colors={[Colors.foodAccent]}
          />
        }
      >
        {error ? (
          <Pressable style={styles.errorBanner} onPress={refresh}>
            <Ionicons name="cloud-offline-outline" size={16} color={Colors.foodAccentDark} />
            <Text style={styles.errorText} numberOfLines={1}>Couldn’t refresh your profile</Text>
            <Text style={styles.errorRetry}>Retry</Text>
          </Pressable>
        ) : null}

        {profile ? <IdentityCard profile={profile} /> : null}

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
                      <Ionicons name="chevron-forward" size={18} color={Colors.foodTextMuted} />
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
                        onValueChange={vegFleet.setEnabled}
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

            if (row.kind === 'soon') {
              return (
                <Row
                  key={row.key}
                  row={row}
                  right={
                    <View style={styles.soonPill}>
                      <Text style={styles.soonText}>Soon</Text>
                    </View>
                  }
                />
              );
            }

            // danger — Log out
            return (
              <Row
                key={row.key}
                row={row}
                onPress={confirmSignOut}
                right={<Ionicons name="chevron-forward" size={18} color={Colors.danger} />}
              />
            );
          })}
        </View>

        <View style={{ height: Spacing['2xl'] }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.authBg },

  title: {
    fontSize: 28,
    fontWeight: '800',
    color: Colors.foodText,
    letterSpacing: -0.5,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.base,
  },

  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  scroll: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.xs },

  // Transient "couldn't refresh" strip
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.foodAccentLight,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.sm + 2,
    marginBottom: Spacing.md,
  },
  errorText: { flex: 1, fontSize: 13, color: Colors.foodAccentDark, fontWeight: '600' },
  errorRetry: { fontSize: 13, fontWeight: '800', color: Colors.foodAccentDark },

  // Identity card
  identityCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.base,
    backgroundColor: Colors.foodSurface,
    borderRadius: BorderRadius.lg,
    padding: Spacing.lg,
    ...Shadows.sm,
  },
  avatar: { width: 60, height: 60, borderRadius: BorderRadius.full },
  avatarFallback: {
    backgroundColor: Colors.foodAccent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitials: { fontSize: 22, fontWeight: '800', color: Colors.white, letterSpacing: 0.5 },
  identityText: { flex: 1, gap: 3 },
  name: { fontSize: 20, fontWeight: '800', color: Colors.foodText, letterSpacing: -0.3 },
  contact: { fontSize: 14, color: Colors.foodTextSecondary },
  since: { fontSize: 12, color: Colors.foodTextMuted, marginTop: 1 },

  // Menu
  menu: { marginTop: Spacing.lg, gap: Spacing.md },
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
  },
  rowDanger: { marginTop: Spacing.xs },
  rowPressed: { backgroundColor: Colors.foodBgSecondary },
  rowLabel: { flex: 1, fontSize: 15, fontWeight: '600' },
  rowRight: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  rowMeta: { fontSize: 13, color: Colors.foodTextMuted },

  soonPill: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.foodBgSecondary,
  },
  soonText: { fontSize: 11, fontWeight: '700', color: Colors.foodTextMuted, letterSpacing: 0.3 },
});
