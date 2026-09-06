import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors } from '../../src/constants/Colors';
import { BorderRadius, Shadows, Spacing } from '../../src/constants/Theme';

const MENU = [
  { icon: 'location-outline', label: 'Saved Addresses', chevron: true },
  { icon: 'card-outline', label: 'Payment Methods', chevron: true },
  { icon: 'notifications-outline', label: 'Notifications', chevron: true },
  { icon: 'lock-closed-outline', label: 'Privacy & Security', chevron: true },
  { icon: 'help-circle-outline', label: 'Help & Support', chevron: true },
  { icon: 'star-outline', label: 'Rate the App', chevron: true },
  { icon: 'information-circle-outline', label: 'About Yulo Stores', chevron: true },
];

function MenuItem({ icon, label }: { icon: string; label: string }) {
  return (
    <Pressable style={styles.menuItem}>
      <View style={styles.menuIconWrap}>
        <Ionicons name={icon as any} size={20} color={Colors.primaryLight} />
      </View>
      <Text style={styles.menuLabel}>{label}</Text>
      <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
    </Pressable>
  );
}

export default function ProfileScreen() {
  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <LinearGradient colors={[Colors.bgDark, Colors.bgMid]} style={styles.bg}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
          {/* Avatar & Name */}
          <View style={styles.profileSection}>
            <LinearGradient
              colors={[Colors.primary, Colors.primaryDark]}
              style={styles.avatar}
            >
              <Text style={styles.avatarInitials}>JS</Text>
            </LinearGradient>
            <Text style={styles.name}>John Samuel</Text>
            <Text style={styles.email}>john.samuel@email.com</Text>
            <Pressable style={styles.editBtn}>
              <Text style={styles.editBtnText}>Edit Profile</Text>
            </Pressable>
          </View>

          {/* Stats Row */}
          <View style={styles.statsRow}>
            {[
              { label: 'Orders', value: '24' },
              { label: 'Wishlist', value: '12' },
              { label: 'Reviews', value: '8' },
            ].map((s) => (
              <View key={s.label} style={styles.statItem}>
                <Text style={styles.statValue}>{s.value}</Text>
                <Text style={styles.statLabel}>{s.label}</Text>
              </View>
            ))}
          </View>

          {/* Menu */}
          <View style={styles.menuCard}>
            {MENU.map((m) => (
              <MenuItem key={m.label} icon={m.icon} label={m.label} />
            ))}
          </View>

          {/* Logout */}
          <Pressable style={styles.logoutBtn}>
            <Ionicons name="log-out-outline" size={20} color={Colors.danger} />
            <Text style={styles.logoutText}>Log Out</Text>
          </Pressable>

          <View style={{ height: 20 }} />
        </ScrollView>
      </LinearGradient>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: Colors.bgDark },
  bg: { flex: 1 },
  scroll: { paddingHorizontal: Spacing.base, paddingTop: Spacing.md },
  profileSection: { alignItems: 'center', marginBottom: Spacing.lg, gap: 6 },
  avatar: {
    width: 88,
    height: 88,
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
    ...Shadows.md,
  },
  avatarInitials: { fontSize: 30, fontWeight: '800', color: Colors.white },
  name: { fontSize: 22, fontWeight: '800', color: Colors.white },
  email: { fontSize: 13, color: Colors.textMuted },
  editBtn: {
    marginTop: 8,
    paddingHorizontal: 24,
    paddingVertical: 8,
    borderRadius: BorderRadius.full,
    borderWidth: 1.5,
    borderColor: Colors.primaryLight,
  },
  editBtnText: { fontSize: 13, fontWeight: '700', color: Colors.primaryLight },
  statsRow: {
    flexDirection: 'row',
    backgroundColor: Colors.bgCard,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: Spacing.lg,
    ...Shadows.sm,
  },
  statItem: { flex: 1, alignItems: 'center', paddingVertical: Spacing.base },
  statValue: { fontSize: 22, fontWeight: '800', color: Colors.primaryLight },
  statLabel: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  menuCard: {
    backgroundColor: Colors.bgCard,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: Spacing.base,
    overflow: 'hidden',
    ...Shadows.sm,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
    gap: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.divider,
  },
  menuIconWrap: {
    width: 36,
    height: 36,
    borderRadius: BorderRadius.sm,
    backgroundColor: 'rgba(123,47,190,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuLabel: { flex: 1, fontSize: 14, fontWeight: '600', color: Colors.white },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: 'rgba(239,68,68,0.1)',
    borderRadius: BorderRadius.lg,
    padding: Spacing.base,
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.3)',
  },
  logoutText: { fontSize: 15, fontWeight: '700', color: Colors.danger },
});
