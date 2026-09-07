/**
 * app/address/index.tsx — Saved Addresses management screen.
 *
 * Matches the Zomato/Swiggy "Delivery address" UX:
 *  - Lists all saved addresses with Home / Work / Other icons.
 *  - Highlights the currently active delivery address with an orange border.
 *  - Allows: set default, delete, or start the add-new flow.
 *  - "Deliver here" CTA at the bottom to confirm the highlighted address.
 *
 * Data: pulled from DeliveryLocationContext which keeps the server list in sync.
 */

import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors } from '../../src/constants/Colors';
import { BorderRadius, Spacing } from '../../src/constants/Theme';
import { useDeliveryLocation } from '../../src/context/DeliveryLocationContext';
import { reportError } from '../../src/lib/logger';
import {
  removeAddress,
  setDefaultAddress,
} from '../../src/services/addresses';
import type { SavedAddress } from '../../src/types/address';

// ─── Helpers ────────────────────────────────────────────────────────────────

const LABEL_META: Record<
  string,
  { icon: keyof typeof Ionicons.glyphMap; tint: string }
> = {
  home: { icon: 'home', tint: Colors.foodAccent },
  work: { icon: 'briefcase', tint: '#3B82F6' },
  other: { icon: 'bookmark', tint: '#10B981' },
};

function formatAddressLines(a: SavedAddress): { primary: string; secondary: string } {
  const parts = [a.street, a.city, a.state, a.pincode].filter(Boolean);
  const primary = a.customLabel ?? (a.label.charAt(0).toUpperCase() + a.label.slice(1));
  const secondary = parts.join(', ') || 'No address details saved';
  return { primary, secondary };
}

// ─── Address Card ────────────────────────────────────────────────────────────

interface AddressCardProps {
  address: SavedAddress;
  isActive: boolean;
  onChoose: () => void;
  onDelete: () => void;
  onSetDefault: () => void;
  actionLoading: boolean;
}

function AddressCard({
  address,
  isActive,
  onChoose,
  onDelete,
  onSetDefault,
  actionLoading,
}: AddressCardProps) {
  const { primary, secondary } = formatAddressLines(address);
  const meta = LABEL_META[address.label] ?? LABEL_META.other;
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <Pressable
      style={[styles.card, isActive && styles.cardActive]}
      onPress={() => { setMenuOpen(false); onChoose(); }}
      android_ripple={{ color: Colors.foodAccentLight }}
    >
      {/* Left icon bubble */}
      <View style={[styles.iconBubble, { backgroundColor: meta.tint + '18' }]}>
        <Ionicons name={meta.icon} size={20} color={meta.tint} />
      </View>

      {/* Address text */}
      <View style={styles.cardText}>
        <View style={styles.cardTitleRow}>
          <Text style={styles.cardTitle}>{primary}</Text>
          {address.isDefault ? (
            <View style={styles.defaultBadge}>
              <Text style={styles.defaultBadgeText}>DEFAULT</Text>
            </View>
          ) : null}
        </View>
        <Text style={styles.cardSub} numberOfLines={2}>{secondary}</Text>
      </View>

      {/* Three-dot menu */}
      <View>
        <Pressable
          hitSlop={10}
          onPress={() => setMenuOpen((v) => !v)}
          style={styles.dotBtn}
        >
          {actionLoading ? (
            <ActivityIndicator size="small" color={Colors.foodAccent} />
          ) : (
            <Ionicons name="ellipsis-vertical" size={18} color={Colors.foodTextMuted} />
          )}
        </Pressable>

        {menuOpen ? (
          <View style={styles.dropMenu}>
            {!address.isDefault ? (
              <Pressable
                style={styles.dropItem}
                onPress={() => { setMenuOpen(false); onSetDefault(); }}
              >
                <Ionicons name="star-outline" size={15} color={Colors.foodText} />
                <Text style={styles.dropLabel}>Set as default</Text>
              </Pressable>
            ) : null}
            <Pressable
              style={[styles.dropItem, styles.dropItemDanger]}
              onPress={() => { setMenuOpen(false); onDelete(); }}
            >
              <Ionicons name="trash-outline" size={15} color={Colors.danger} />
              <Text style={[styles.dropLabel, { color: Colors.danger }]}>Delete</Text>
            </Pressable>
          </View>
        ) : null}
      </View>

      {/* Active indicator bar */}
      {isActive ? <View style={styles.activeBar} /> : null}
    </Pressable>
  );
}

// ─── Main Screen ─────────────────────────────────────────────────────────────

export default function SavedAddressesScreen() {
  const {
    savedAddresses,
    activeLocation,
    chooseSaved,
    refreshSaved,
    loadingSaved,
  } = useDeliveryLocation();

  const [actionId, setActionId] = useState<string | null>(null);

  const handleChoose = useCallback(
    (a: SavedAddress) => {
      chooseSaved(a);
    },
    [chooseSaved],
  );

  const handleSetDefault = useCallback(
    async (a: SavedAddress) => {
      setActionId(a._id);
      try {
        await setDefaultAddress(a._id);
        await refreshSaved();
      } catch (err) {
        reportError('address', 'Failed to set default address', err);
        Alert.alert('Error', 'Could not set as default. Please try again.');
      } finally {
        setActionId(null);
      }
    },
    [refreshSaved],
  );

  const handleDelete = useCallback(
    (a: SavedAddress) => {
      Alert.alert(
        'Delete address?',
        `Remove "${formatAddressLines(a).primary}" from your saved addresses?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: async () => {
              setActionId(a._id);
              try {
                await removeAddress(a._id);
                await refreshSaved();
              } catch (err) {
                reportError('address', 'Failed to delete address', err);
                Alert.alert('Error', 'Could not delete address. Please try again.');
              } finally {
                setActionId(null);
              }
            },
          },
        ],
      );
    },
    [refreshSaved],
  );

  const deliverHere = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };

  const isEmpty = savedAddresses.length === 0 && !loadingSaved;

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <StatusBar style="dark" />

      {/* ── Header ── */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={Colors.foodText} />
        </Pressable>
        <Text style={styles.headerTitle}>Delivery address</Text>
        <View style={{ width: 36 }} />
      </View>

      {/* ── Body ── */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled"
      >
        {/* Add new address button */}
        <Pressable
          style={styles.addBtn}
          onPress={() => router.push('/location')}
          android_ripple={{ color: Colors.foodAccentLight }}
        >
          <View style={styles.addIconWrap}>
            <Ionicons name="add" size={20} color={Colors.foodAccent} />
          </View>
          <Text style={styles.addBtnText}>Add a new address</Text>
          <Ionicons name="chevron-forward" size={16} color={Colors.foodAccent} />
        </Pressable>

        {/* Loading state */}
        {loadingSaved ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="large" color={Colors.foodAccent} />
            <Text style={styles.loadingText}>Loading your addresses…</Text>
          </View>
        ) : isEmpty ? (
          /* Empty state */
          <View style={styles.emptyWrap}>
            <LinearGradient
              colors={[Colors.foodAccentLight, '#FFF']}
              style={styles.emptyIllustration}
            >
              <Ionicons name="location-outline" size={56} color={Colors.foodAccent} />
            </LinearGradient>
            <Text style={styles.emptyTitle}>No saved addresses</Text>
            <Text style={styles.emptySub}>
              Add your home, work, or any other address to make ordering faster.
            </Text>
          </View>
        ) : (
          /* Address list */
          <View style={styles.list}>
            <Text style={styles.listHeading}>SAVED ADDRESSES</Text>
            {savedAddresses.map((a) => (
              <AddressCard
                key={a._id}
                address={a}
                isActive={activeLocation?.id === a._id}
                onChoose={() => handleChoose(a)}
                onDelete={() => handleDelete(a)}
                onSetDefault={() => handleSetDefault(a)}
                actionLoading={actionId === a._id}
              />
            ))}
          </View>
        )}
      </ScrollView>

      {/* ── Footer CTA ── */}
      {!isEmpty && !loadingSaved ? (
        <View style={styles.footer}>
          <Pressable style={styles.deliverBtn} onPress={deliverHere}>
            <Text style={styles.deliverBtnText}>Deliver here</Text>
          </Pressable>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.foodSurface },

  // Header
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
  backBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.foodText,
    letterSpacing: -0.3,
  },

  // Body
  body: {
    paddingBottom: Spacing['3xl'],
  },

  // Add button
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    marginHorizontal: Spacing.base,
    marginTop: Spacing.lg,
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.base,
    borderRadius: BorderRadius.xl,
    borderWidth: 1.5,
    borderColor: Colors.foodAccent,
    borderStyle: 'dashed',
    backgroundColor: Colors.foodAccentLight,
  },
  addIconWrap: {
    width: 32,
    height: 32,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.foodAccent + '20',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBtnText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
    color: Colors.foodAccent,
  },

  // Loading
  loadingWrap: {
    alignItems: 'center',
    paddingVertical: Spacing['3xl'],
    gap: Spacing.md,
  },
  loadingText: {
    fontSize: 14,
    color: Colors.foodTextSecondary,
  },

  // Empty state
  emptyWrap: {
    alignItems: 'center',
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing['3xl'],
    gap: Spacing.base,
  },
  emptyIllustration: {
    width: 120,
    height: 120,
    borderRadius: BorderRadius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.sm,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: Colors.foodText,
    textAlign: 'center',
  },
  emptySub: {
    fontSize: 14,
    lineHeight: 21,
    color: Colors.foodTextSecondary,
    textAlign: 'center',
  },

  // Address list
  list: {
    marginTop: Spacing.xl,
    paddingHorizontal: Spacing.base,
    gap: Spacing.md,
  },
  listHeading: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    color: Colors.foodTextMuted,
    marginBottom: Spacing.xs,
  },

  // Address card
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.md,
    backgroundColor: Colors.foodSurface,
    borderRadius: BorderRadius.lg,
    borderWidth: 1.5,
    borderColor: Colors.foodBorder,
    padding: Spacing.base,
    overflow: 'hidden',
    // Shadow
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  cardActive: {
    borderColor: Colors.foodAccent,
    backgroundColor: Colors.foodAccentLight,
  },
  activeBar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    backgroundColor: Colors.foodAccent,
    borderTopLeftRadius: BorderRadius.lg,
    borderBottomLeftRadius: BorderRadius.lg,
  },
  iconBubble: {
    width: 44,
    height: 44,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  cardText: { flex: 1 },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, flexWrap: 'wrap' },
  cardTitle: { fontSize: 15, fontWeight: '700', color: Colors.foodText },
  cardSub: {
    fontSize: 13,
    lineHeight: 18,
    color: Colors.foodTextSecondary,
    marginTop: 3,
  },
  defaultBadge: {
    backgroundColor: Colors.foodAccent + '18',
    borderRadius: BorderRadius.full,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  defaultBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: Colors.foodAccent,
    letterSpacing: 0.8,
  },

  // Three-dot menu
  dotBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dropMenu: {
    position: 'absolute',
    right: 0,
    top: 34,
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.foodBorder,
    minWidth: 160,
    zIndex: 99,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 10,
  },
  dropItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md - 2,
  },
  dropItemDanger: {
    borderTopWidth: 1,
    borderTopColor: Colors.foodBorder,
  },
  dropLabel: {
    fontSize: 13.5,
    fontWeight: '600',
    color: Colors.foodText,
  },

  // Footer
  footer: {
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.md,
    paddingBottom: Platform.OS === 'ios' ? Spacing.sm : Spacing.base,
    backgroundColor: Colors.foodSurface,
    borderTopWidth: 1,
    borderTopColor: Colors.foodBorder,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 8,
  },
  deliverBtn: {
    backgroundColor: Colors.foodAccent,
    borderRadius: BorderRadius.full,
    paddingVertical: Spacing.base,
    alignItems: 'center',
    shadowColor: Colors.foodAccent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 6,
  },
  deliverBtnText: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.white,
    letterSpacing: 0.3,
  },
});
