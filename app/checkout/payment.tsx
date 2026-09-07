/**
 * app/checkout/payment.tsx — the Payment screen.
 *
 * Everything on it is server data (src/hooks/useCheckout):
 *   • the delivery address  ← GET /api/checkout/summary  (account default)
 *   • every money figure    ← that call's `bill`  (computed server-side)
 *   • placing + paying      ← POST /api/orders/checkout, then the resolved
 *                             gateway (simulated now, Razorpay once wired —
 *                             see src/services/payments.ts)
 *
 * The method list (UPI apps, cards, net-banking, pay-on-delivery) is a
 * client-side catalogue; on the wire it is only ever `'online'` or `'cod'`.
 * A selected method shows an inline "Pay ₹…" button right under its row, the
 * way PhonePe / Paytm checkouts do.
 */

import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../../src/constants/Colors';
import { BorderRadius, Spacing } from '../../src/constants/Theme';
import { useAuth } from '../../src/context/AuthContext';
import { useCheckout } from '../../src/hooks/useCheckout';
import {
  getMethod,
  methodsForGroup,
  PAYMENT_GROUPS,
  type PaymentGroupId,
  type PaymentMethod,
  type PaymentMethodId,
} from '../../src/services/payments';
import type { SavedAddress } from '../../src/types/address';

const formatMoney = (n: number) =>
  '₹' +
  Math.max(0, n).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

function goBack() {
  if (router.canGoBack()) router.back();
  else router.navigate('/(tabs)/cart');
}

function addressLines(a: SavedAddress): { title: string; detail: string } {
  const label = a.customLabel ?? a.label.charAt(0).toUpperCase() + a.label.slice(1);
  const detail =
    [a.street, a.city, a.state, a.pincode].map((s) => s?.trim()).filter(Boolean).join(', ') ||
    'No address details';
  return { title: `Delivering to ${label}`, detail };
}

// ─── Pieces ─────────────────────────────────────────────────────────────────

function AddressCard({
  address,
  overrideLabel,
  overrideLine,
}: {
  address: SavedAddress | null;
  /** Address the customer picked on the review screen, passed as route params —
   *  wins over the summary default so both screens name the same place. */
  overrideLabel?: string;
  overrideLine?: string;
}) {
  if (!address && !overrideLabel) {
    return (
      <Pressable style={styles.addressCard} onPress={() => router.push('/location')}>
        <Ionicons name="location-outline" size={20} color={Colors.foodAccent} />
        <View style={styles.addressText}>
          <Text style={styles.addressTitle}>Add a delivery address</Text>
          <Text style={styles.addressDetail} numberOfLines={1}>
            We need somewhere to send this order
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={Colors.foodTextMuted} />
      </Pressable>
    );
  }
  const fromAddress = address ? addressLines(address) : null;
  const title = overrideLabel ? `Delivering to ${overrideLabel}` : fromAddress!.title;
  const detail = overrideLine ?? fromAddress!.detail;
  return (
    <Pressable style={styles.addressCard} onPress={() => router.push('/address')}>
      <Ionicons name="location-sharp" size={20} color={Colors.foodText} />
      <View style={styles.addressText}>
        <Text style={styles.addressTitle}>{title}</Text>
        <Text style={styles.addressDetail} numberOfLines={2}>
          {detail}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={Colors.foodTextMuted} />
    </Pressable>
  );
}

function BillBreakdown({
  bill,
  tip,
  grandTotal,
}: {
  bill: {
    itemTotal: number;
    deliveryFee: number;
    platformFee: number;
    tax: number;
    discountAmount: number;
    grandTotal: number;
  };
  /** Chosen on the review screen — not part of the server bill until placement. */
  tip: number;
  /** `bill.grandTotal + tip` — what the customer actually pays. */
  grandTotal: number;
}) {
  const [open, setOpen] = useState(false);
  return (
    <View style={styles.billWrap}>
      <Pressable style={styles.billToggle} onPress={() => setOpen((v) => !v)} hitSlop={6}>
        <Text style={styles.billToggleText}>{open ? 'Hide' : 'View'} bill breakdown</Text>
        <Ionicons
          name={open ? 'chevron-up' : 'chevron-down'}
          size={14}
          color={Colors.foodAccent}
        />
      </Pressable>
      {open && (
        <View style={styles.billRows}>
          <BillRow label="Item total" value={formatMoney(bill.itemTotal)} />
          <BillRow
            label="Delivery fee"
            value={bill.deliveryFee === 0 ? 'FREE' : formatMoney(bill.deliveryFee)}
            positive={bill.deliveryFee === 0}
          />
          <BillRow label="Platform fee" value={formatMoney(bill.platformFee)} />
          <BillRow label="GST & charges" value={formatMoney(bill.tax)} />
          {bill.discountAmount > 0 && (
            <BillRow label="Discount" value={'− ' + formatMoney(bill.discountAmount)} positive />
          )}
          {tip > 0 && <BillRow label="Delivery tip" value={formatMoney(tip)} />}
          <View style={styles.billDivider} />
          <BillRow label="Total payable" value={formatMoney(grandTotal)} strong />
        </View>
      )}
    </View>
  );
}

function BillRow({
  label,
  value,
  strong,
  positive,
}: {
  label: string;
  value: string;
  strong?: boolean;
  positive?: boolean;
}) {
  return (
    <View style={styles.billRow}>
      <Text style={[styles.billLabel, strong && styles.billLabelStrong]}>{label}</Text>
      <Text
        style={[
          styles.billValue,
          strong && styles.billValueStrong,
          positive && styles.billValuePositive,
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

function MethodRow({
  method,
  selected,
  onSelect,
}: {
  method: PaymentMethod;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <Pressable style={styles.methodRow} onPress={onSelect}>
      <View style={[styles.methodBadge, { backgroundColor: method.tint + '18' }]}>
        <Ionicons name={method.icon as keyof typeof Ionicons.glyphMap} size={18} color={method.tint} />
      </View>
      <View style={styles.methodText}>
        <Text style={styles.methodLabel}>{method.label}</Text>
        {!!method.hint && <Text style={styles.methodHint}>{method.hint}</Text>}
      </View>
      <View style={[styles.radio, selected && styles.radioOn]}>
        {selected && <View style={styles.radioDot} />}
      </View>
    </Pressable>
  );
}

// ─── Screen ─────────────────────────────────────────────────────────────────

export default function PaymentScreen() {
  const insets = useSafeAreaInsets();
  const { signOut } = useAuth();

  // Choices carried over from the checkout review screen (app/checkout/index.tsx).
  const params = useLocalSearchParams<{
    addressId?: string;
    addrLabel?: string;
    addrLine?: string;
    tip?: string;
    deliveryInstructions?: string;
    cookingRequests?: string;
    extraCutlery?: string;
    vegFleetOptIn?: string;
  }>();
  const tip = Math.max(0, Number(params.tip) || 0);
  const overrides = useMemo(
    () => ({
      addressId: typeof params.addressId === 'string' && params.addressId ? params.addressId : undefined,
      tip,
      deliveryInstructions:
        typeof params.deliveryInstructions === 'string' ? params.deliveryInstructions : undefined,
      cookingRequests: params.cookingRequests === '1',
      extraCutlery: params.extraCutlery === '1',
      vegFleetOptIn: params.vegFleetOptIn === '1',
    }),
    [
      params.addressId,
      tip,
      params.deliveryInstructions,
      params.cookingRequests,
      params.extraCutlery,
      params.vegFleetOptIn,
    ],
  );

  const {
    summary,
    isLoading,
    error,
    notSignedIn,
    phase,
    selectedMethodId,
    selectMethod,
    actionError,
    placedOrderId,
    placedIsCod,
    refresh,
    pay,
  } = useCheckout(overrides);

  const selectedMethod = getMethod(selectedMethodId);
  const grandTotal = (summary?.bill.grandTotal ?? 0) + tip;
  const busy = phase === 'placing' || phase === 'paying';
  const hasAddress = !!summary?.address;

  // Groups the customer has expanded. The group holding the current selection is
  // always rendered open regardless, so the inline Pay button is never stranded.
  const [openGroups, setOpenGroups] = useState<Set<PaymentGroupId>>(
    () => new Set(PAYMENT_GROUPS.filter((g) => g.defaultOpen).map((g) => g.id)),
  );
  const toggleGroup = (id: PaymentGroupId) =>
    setOpenGroups((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  // Leave the payment screen for the confirmation the moment we're done.
  const doneOrderId = phase === 'done' ? placedOrderId : null;
  useEffect(() => {
    if (!doneOrderId) return;
    router.replace({
      pathname: '/checkout/success',
      params: {
        orderId: doneOrderId,
        cod: placedIsCod ? '1' : '0',
        total: String(grandTotal),
        method: selectedMethod.label,
      },
    });
  }, [doneOrderId, placedIsCod, grandTotal, selectedMethod.label]);

  const payLabel = selectedMethod.wire === 'cod' ? 'Place Order' : `Pay ${formatMoney(grandTotal)}`;

  const InlinePay = ({ methodId }: { methodId: PaymentMethodId }) =>
    methodId === selectedMethodId ? (
      <Pressable
        style={[styles.payBtn, busy && styles.payBtnBusy]}
        onPress={pay}
        disabled={busy}
        accessibilityRole="button"
        accessibilityLabel={payLabel}
      >
        {busy ? (
          <ActivityIndicator size="small" color={Colors.white} />
        ) : (
          <Text style={styles.payBtnText}>{payLabel}</Text>
        )}
      </Pressable>
    ) : null;

  // ── Body ──
  let body: ReactNode;
  if (isLoading) {
    body = (
      <View style={styles.skelWrap}>
        <View style={[styles.skel, { height: 74 }]} />
        <View style={[styles.skel, { height: 20, width: '55%' }]} />
        <View style={[styles.skel, { height: 150 }]} />
        <View style={[styles.skel, { height: 90 }]} />
      </View>
    );
  } else if (notSignedIn) {
    body = (
      <CenterState
        icon="lock-closed-outline"
        title="Sign in to check out"
        message="Your cart and addresses are tied to your account."
        actionLabel="Sign in"
        onAction={signOut}
      />
    );
  } else if (error) {
    body = (
      <CenterState
        icon="cloud-offline-outline"
        title="Couldn’t load your order"
        message={error}
        actionLabel="Try again"
        onAction={refresh}
      />
    );
  } else if (summary && !summary.hasItems) {
    body = (
      <CenterState
        icon="bag-handle-outline"
        title="Your cart is empty"
        message="Add items to a cart before checking out."
        actionLabel="Back to cart"
        onAction={() => router.replace('/(tabs)/cart')}
      />
    );
  } else if (summary) {
    body = (
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: Spacing.base, paddingBottom: insets.bottom + 40 }}
      >
        <AddressCard
          address={summary.address}
          overrideLabel={typeof params.addrLabel === 'string' ? params.addrLabel : undefined}
          overrideLine={typeof params.addrLine === 'string' ? params.addrLine : undefined}
        />

        <Text style={styles.payableLabel}>Total Payable amount</Text>
        <Text style={styles.payableAmount}>{formatMoney(grandTotal)}</Text>
        <BillBreakdown bill={summary.bill} tip={tip} grandTotal={grandTotal} />

        {!!actionError && (
          <View style={styles.errorBanner}>
            <Ionicons name="alert-circle" size={16} color={Colors.authDanger} />
            <Text style={styles.errorBannerText}>{actionError}</Text>
          </View>
        )}

        <View style={styles.groups}>
          {PAYMENT_GROUPS.map((group) => {
            const methods = methodsForGroup(group.id);
            const holdsSelection = methods.some((m) => m.id === selectedMethodId);
            const expanded = openGroups.has(group.id) || holdsSelection;
            return (
              <View key={group.id} style={styles.groupCard}>
                <Pressable
                  style={styles.groupHeader}
                  onPress={() => toggleGroup(group.id)}
                  hitSlop={4}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.groupTitle}>{group.title}</Text>
                    {!!group.subtitle && <Text style={styles.groupSubtitle}>{group.subtitle}</Text>}
                  </View>
                  <Ionicons
                    name={expanded ? 'chevron-up' : 'chevron-down'}
                    size={18}
                    color={Colors.foodTextSecondary}
                  />
                </Pressable>

                {expanded && (
                  <View>
                    {methods.map((m) => (
                      <View key={m.id}>
                        <View style={styles.methodDivider} />
                        <MethodRow
                          method={m}
                          selected={m.id === selectedMethodId}
                          onSelect={() => selectMethod(m.id)}
                        />
                        <InlinePay methodId={m.id} />
                      </View>
                    ))}
                  </View>
                )}
              </View>
            );
          })}
        </View>

        {!hasAddress && (
          <Text style={styles.addressHint}>
            Add a delivery address above to place this order.
          </Text>
        )}
      </ScrollView>
    );
  }

  return (
    <View style={styles.screen}>
      <StatusBar style="dark" />
      <View style={{ height: insets.top, backgroundColor: Colors.foodBg }} />

      <View style={styles.header}>
        <Pressable onPress={goBack} hitSlop={8} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={Colors.foodText} />
        </Pressable>
        <Text style={styles.title}>Payment</Text>
      </View>

      {body}

      {busy && (
        <View style={styles.overlay}>
          <View style={styles.overlayCard}>
            <ActivityIndicator size="large" color={Colors.foodAccent} />
            <Text style={styles.overlayText}>
              {phase === 'placing' ? 'Placing your order…' : 'Processing payment…'}
            </Text>
            <Text style={styles.overlaySub}>Please don’t close the app</Text>
          </View>
        </View>
      )}
    </View>
  );
}

function CenterState({
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
    <View style={styles.center}>
      <Ionicons name={icon} size={60} color={Colors.foodBorder} />
      <Text style={styles.centerTitle}>{title}</Text>
      <Text style={styles.centerMessage}>{message}</Text>
      {actionLabel && onAction && (
        <Pressable style={styles.centerBtn} onPress={onAction}>
          <Text style={styles.centerBtnText}>{actionLabel}</Text>
        </Pressable>
      )}
    </View>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Colors.foodBg },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.base,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.md,
  },
  backBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', marginLeft: -6 },
  title: { fontSize: 26, fontWeight: '800', color: Colors.foodText, letterSpacing: -0.5 },

  // Address
  addressCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: Colors.foodCardBg,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.foodBorder,
    padding: Spacing.base,
  },
  addressText: { flex: 1, gap: 2 },
  addressTitle: { fontSize: 15, fontWeight: '800', color: Colors.foodText },
  addressDetail: { fontSize: 13, color: Colors.foodTextSecondary, lineHeight: 18 },

  // Payable
  payableLabel: {
    fontSize: 14,
    color: Colors.foodTextSecondary,
    marginTop: Spacing.lg,
    marginBottom: 2,
  },
  payableAmount: { fontSize: 30, fontWeight: '800', color: Colors.foodText, letterSpacing: -0.5 },

  // Bill breakdown
  billWrap: { marginBottom: Spacing.xs },
  billToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    paddingVertical: Spacing.sm,
  },
  billToggleText: { fontSize: 13, fontWeight: '700', color: Colors.foodAccent },
  billRows: {
    backgroundColor: Colors.foodCardBg,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.foodBorder,
    padding: Spacing.base,
    marginBottom: Spacing.sm,
  },
  billRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  billLabel: { fontSize: 13, color: Colors.foodTextSecondary },
  billLabelStrong: { fontSize: 14.5, fontWeight: '800', color: Colors.foodText },
  billValue: { fontSize: 13, fontWeight: '600', color: Colors.foodText },
  billValueStrong: { fontSize: 14.5, fontWeight: '800' },
  billValuePositive: { color: Colors.foodVegGreen, fontWeight: '700' },
  billDivider: { height: 1, backgroundColor: Colors.foodBorder, marginVertical: Spacing.sm },

  // Error banner
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FDECEC',
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginTop: Spacing.sm,
  },
  errorBannerText: { flex: 1, fontSize: 13, fontWeight: '600', color: Colors.authDanger },

  // Groups
  groups: { marginTop: Spacing.md, gap: Spacing.md },
  groupCard: {
    backgroundColor: Colors.foodCardBg,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.foodBorder,
    overflow: 'hidden',
  },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.base,
  },
  groupTitle: { fontSize: 16, fontWeight: '800', color: Colors.foodText },
  groupSubtitle: { fontSize: 12, color: Colors.foodTextMuted, marginTop: 2 },

  methodDivider: { height: 1, backgroundColor: Colors.foodBorder },
  methodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
  },
  methodBadge: {
    width: 38,
    height: 38,
    borderRadius: BorderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  methodText: { flex: 1 },
  methodLabel: { fontSize: 14.5, fontWeight: '700', color: Colors.foodText },
  methodHint: { fontSize: 12, color: Colors.foodTextMuted, marginTop: 1 },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: Colors.foodBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOn: { borderColor: Colors.foodAccent },
  radioDot: { width: 11, height: 11, borderRadius: 6, backgroundColor: Colors.foodAccent },

  // Inline pay button
  payBtn: {
    height: 52,
    marginHorizontal: Spacing.base,
    marginTop: Spacing.xs,
    marginBottom: Spacing.md,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.foodAccent,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: Colors.foodAccent,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 14,
    elevation: 6,
  },
  payBtnBusy: { opacity: 0.7 },
  payBtnText: { fontSize: 16, fontWeight: '800', color: Colors.white, letterSpacing: 0.2 },

  addressHint: {
    fontSize: 12.5,
    color: Colors.foodTextMuted,
    textAlign: 'center',
    marginTop: Spacing.lg,
  },

  // Overlay
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  overlayCard: {
    backgroundColor: Colors.white,
    borderRadius: BorderRadius.lg,
    paddingVertical: Spacing.xl,
    paddingHorizontal: Spacing['2xl'],
    alignItems: 'center',
    gap: Spacing.sm,
    minWidth: 220,
  },
  overlayText: { fontSize: 15, fontWeight: '800', color: Colors.foodText, marginTop: Spacing.xs },
  overlaySub: { fontSize: 12.5, color: Colors.foodTextMuted },

  // Center states
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, padding: Spacing.xl },
  centerTitle: { fontSize: 18, fontWeight: '800', color: Colors.foodText, marginTop: 8 },
  centerMessage: { fontSize: 14, color: Colors.foodTextMuted, textAlign: 'center', lineHeight: 20 },
  centerBtn: {
    marginTop: Spacing.md,
    backgroundColor: Colors.foodAccent,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.full,
  },
  centerBtnText: { fontSize: 14, fontWeight: '800', color: Colors.white },

  // Skeleton
  skelWrap: { padding: Spacing.base, gap: Spacing.md },
  skel: { backgroundColor: Colors.foodSearchBg, borderRadius: BorderRadius.md },
});
