/**
 * app/checkout/index.tsx — the checkout review screen.
 *
 * The step between the cart and the Payment screen (Swiggy / Zomato "Checkout").
 * Everything shown comes from `GET /api/checkout/summary` via `useCheckout()`:
 *   • delivery address ← the account default, or whichever saved address the
 *                         customer picked on `app/address` (DeliveryLocationContext)
 *   • the order lines  ← the same cart lines + options the cart screen renders
 *   • every money row  ← that call's server-computed `bill` (never summed here)
 *   • "you might also like" ← the summary's upsell picks
 *   • the veg-only-bag toggle ← only when `vegFleetEligible`
 *
 * Nothing is placed here. The CTA carries the picked address + tip + delivery
 * instructions + cutlery / cooking / veg-fleet choices to `app/checkout/payment`
 * as route params; that screen selects a payment method and does the one
 * `POST /api/orders/checkout` (see src/hooks/useCheckout + src/services/checkout).
 */

import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useMemo, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RemoteImage } from '../../src/components/RemoteImage';
import { Colors } from '../../src/constants/Colors';
import { BorderRadius, Spacing } from '../../src/constants/Theme';
import { useAuth } from '../../src/context/AuthContext';
import { useDeliveryLocation } from '../../src/context/DeliveryLocationContext';
import {
  ORANGE_ACCENT,
  useAccentTheme,
  useThemedStyles,
  type AccentTheme,
} from '../../src/hooks/useAccentTheme';
import { useCheckout } from '../../src/hooks/useCheckout';
import type { CartLine, FoodType } from '../../src/services/cart';
import type { CheckoutSummary, UpsellItem } from '../../src/services/checkout';
import type { SavedAddress } from '../../src/types/address';

const formatPrice = (n: number) => '₹' + Math.round(n).toLocaleString('en-IN');

/** Preset delivery-tip amounts, in rupees. Tapping the selected one clears it. */
const TIP_PRESETS = [10, 20, 30, 50];

function goBack() {
  if (router.canGoBack()) router.back();
  else router.navigate('/(tabs)/cart');
}

// ─── Small shared pieces ────────────────────────────────────────────────────

function FoodTypeDot({ foodType }: { foodType: FoodType | null }) {
  const color = foodType === 'veg' ? Colors.foodVegGreen : Colors.foodNonVegRed;
  return (
    <View style={[styles.dietSquare, { borderColor: color }]}>
      <View style={[styles.dietDot, { backgroundColor: color }]} />
    </View>
  );
}

function SectionCard({ children, style }: { children: ReactNode; style?: object }) {
  return <View style={[styles.card, style]}>{children}</View>;
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

function Chip({
  label,
  icon,
  active,
  onPress,
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  active: boolean;
  onPress: () => void;
}) {
  const styles = useThemedStyles(makeStyles);
  const { accentDark } = useAccentTheme();
  return (
    <Pressable
      style={[styles.chip, active && styles.chipActive]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
    >
      <Ionicons
        name={icon}
        size={14}
        color={active ? accentDark : Colors.foodTextSecondary}
      />
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

// ─── Address ───────────────────────────────────────────────────────────────

function addressBits(a: SavedAddress): { label: string; line: string } {
  const label = a.customLabel ?? a.label.charAt(0).toUpperCase() + a.label.slice(1);
  const line =
    [a.street, a.city, a.state, a.pincode].map((s) => s?.trim()).filter(Boolean).join(', ') ||
    'No address details saved';
  return { label, line };
}

function AddressBlock({ address }: { address: SavedAddress | null }) {
  const styles = useThemedStyles(makeStyles);
  const { accent } = useAccentTheme();
  if (!address) {
    return (
      <Pressable style={styles.addressCard} onPress={() => router.push('/location')}>
        <View style={styles.addrIcon}>
          <Ionicons name="location-outline" size={20} color={accent} />
        </View>
        <View style={styles.addrText}>
          <Text style={styles.addrTitle}>Add a delivery address</Text>
          <Text style={styles.addrLine} numberOfLines={1}>
            We need somewhere to send this order
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={Colors.foodTextMuted} />
      </Pressable>
    );
  }
  const { label, line } = addressBits(address);
  return (
    <Pressable style={styles.addressCard} onPress={() => router.push('/address')}>
      <View style={styles.addrIcon}>
        <Ionicons name="location-sharp" size={20} color={accent} />
      </View>
      <View style={styles.addrText}>
        <View style={styles.addrTitleRow}>
          <Text style={styles.addrTitle}>Delivering to {label}</Text>
        </View>
        <Text style={styles.addrLine} numberOfLines={2}>
          {line}
        </Text>
      </View>
      <Text style={styles.addrChange}>CHANGE</Text>
    </Pressable>
  );
}

// ─── Order lines ───────────────────────────────────────────────────────────

function OrderLine({ line }: { line: CartLine }) {
  const optionText = line.options
    .map((o) => o.name)
    .filter((n): n is string => !!n)
    .join(', ');
  return (
    <View style={styles.line}>
      <FoodTypeDot foodType={line.foodType} />
      <View style={styles.lineMain}>
        <Text style={styles.lineName} numberOfLines={2}>
          {line.qty} × {line.name}
        </Text>
        {!!optionText && (
          <Text style={styles.lineOptions} numberOfLines={2}>
            {optionText}
          </Text>
        )}
      </View>
      <Text style={styles.linePrice}>{formatPrice(line.unitPrice * line.qty)}</Text>
    </View>
  );
}

function UpsellStrip({ items }: { items: UpsellItem[] }) {
  const styles = useThemedStyles(makeStyles);
  const { accent } = useAccentTheme();
  return (
    <View>
      <Text style={styles.sectionLabel}>You might also like</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.upsellRow}
      >
        {items.map((it) => (
          <Pressable
            key={it.id}
            style={styles.upsellCard}
            onPress={() => router.push(`/item/${it.id}`)}
          >
            <View style={styles.upsellImgWrap}>
              <RemoteImage
                uri={it.image ?? undefined}
                style={styles.upsellImg}
                icon="fast-food-outline"
                iconSize={22}
              />
            </View>
            <Text style={styles.upsellName} numberOfLines={2}>
              {it.name}
            </Text>
            <View style={styles.upsellFooter}>
              <Text style={styles.upsellPrice}>{formatPrice(it.price)}</Text>
              <View style={styles.upsellAdd}>
                <Ionicons name="add" size={14} color={accent} />
              </View>
            </View>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

// ─── Full-screen states ────────────────────────────────────────────────────

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
  const styles = useThemedStyles(makeStyles);
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

function Skeleton() {
  return (
    <View style={styles.skelWrap}>
      <View style={[styles.skel, { height: 78 }]} />
      <View style={[styles.skel, { height: 140 }]} />
      <View style={[styles.skel, { height: 96 }]} />
      <View style={[styles.skel, { height: 170 }]} />
    </View>
  );
}

// ─── Screen ────────────────────────────────────────────────────────────────

export default function CheckoutReviewScreen() {
  const styles = useThemedStyles(makeStyles);
  const insets = useSafeAreaInsets();
  const { signOut } = useAuth();
  const { summary, isLoading, error, notSignedIn, refresh } = useCheckout();
  const { savedAddresses, activeLocation } = useDeliveryLocation();

  const [tip, setTip] = useState(0);
  const [instructions, setInstructions] = useState('');
  const [extraCutlery, setExtraCutlery] = useState(false);
  const [cookingRequests, setCookingRequests] = useState(false);
  const [vegBag, setVegBag] = useState(false);

  // A saved address the customer picked on app/address wins over the summary
  // default; an unsaved map pin (activeLocation.id === null) can't be billed to.
  const address = useMemo<SavedAddress | null>(() => {
    const picked =
      activeLocation?.id != null
        ? savedAddresses.find((a) => a._id === activeLocation.id) ?? null
        : null;
    return picked ?? summary?.address ?? null;
  }, [activeLocation?.id, savedAddresses, summary?.address]);

  const bill = summary?.bill ?? null;
  const hasItems = !!summary?.hasItems;
  const grandTotal = (bill?.grandTotal ?? 0) + tip;
  const canProceed = hasItems && !!address && !isLoading;

  const proceed = () => {
    if (!canProceed || !address) return;
    const { label, line } = addressBits(address);
    router.push({
      pathname: '/checkout/payment',
      params: {
        addressId: address._id,
        addrLabel: label,
        addrLine: line,
        tip: String(tip),
        deliveryInstructions: instructions.trim(),
        cookingRequests: cookingRequests ? '1' : '0',
        extraCutlery: extraCutlery ? '1' : '0',
        vegFleetOptIn: vegBag && summary?.vegFleetEligible ? '1' : '0',
      },
    });
  };

  // ── Body ──
  let body: ReactNode;
  if (isLoading) {
    body = <Skeleton />;
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
        title="Couldn’t load checkout"
        message={error}
        actionLabel="Try again"
        onAction={refresh}
      />
    );
  } else if (!hasItems) {
    body = (
      <CenterState
        icon="bag-handle-outline"
        title="Your cart is empty"
        message="Add dishes from a restaurant before checking out."
        actionLabel="Back to cart"
        onAction={() => router.replace('/(tabs)/cart')}
      />
    );
  } else if (summary && bill) {
    body = (
      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: Spacing.base, paddingBottom: insets.bottom + 130 }}
      >
        {/* Delivery address */}
        <Text style={styles.sectionLabel}>Delivery address</Text>
        <AddressBlock address={address} />

        {/* Order summary */}
        <View style={styles.summaryHeader}>
          <Text style={styles.sectionLabel}>
            {summary.restaurantName ?? 'Your order'}
          </Text>
          <Pressable onPress={() => router.push('/(tabs)/cart')} hitSlop={8}>
            <Text style={styles.editLink}>EDIT</Text>
          </Pressable>
        </View>
        <SectionCard>
          {summary.lines.map((line, i) => (
            <View key={line.id}>
              {i > 0 && <View style={styles.lineDivider} />}
              <OrderLine line={line} />
            </View>
          ))}
        </SectionCard>

        {/* Upsell */}
        {summary.upsellItems.length > 0 && <UpsellStrip items={summary.upsellItems} />}

        {/* Delivery instructions */}
        <Text style={styles.sectionLabel}>Delivery instructions</Text>
        <SectionCard>
          <TextInput
            style={styles.notesInput}
            placeholder="Add a note for the delivery partner (optional)"
            placeholderTextColor={Colors.foodTextMuted}
            value={instructions}
            onChangeText={setInstructions}
            multiline
            maxLength={200}
          />
          <View style={styles.chipRow}>
            <Chip
              label="Send cutlery"
              icon="restaurant-outline"
              active={extraCutlery}
              onPress={() => setExtraCutlery((v) => !v)}
            />
            <Chip
              label="Cooking requests"
              icon="flame-outline"
              active={cookingRequests}
              onPress={() => setCookingRequests((v) => !v)}
            />
          </View>
        </SectionCard>

        {/* Tip */}
        <Text style={styles.sectionLabel}>Tip your delivery partner</Text>
        <SectionCard style={styles.tipCard}>
          {TIP_PRESETS.map((amount) => {
            const active = tip === amount;
            return (
              <Pressable
                key={amount}
                style={[styles.tipBtn, active && styles.tipBtnActive]}
                onPress={() => setTip(active ? 0 : amount)}
              >
                <Text style={[styles.tipBtnText, active && styles.tipBtnTextActive]}>
                  {formatPrice(amount)}
                </Text>
              </Pressable>
            );
          })}
        </SectionCard>

        {/* Veg-only delivery */}
        {summary.vegFleetEligible && (
          <Pressable
            style={[styles.vegRow, vegBag && styles.vegRowActive]}
            onPress={() => setVegBag((v) => !v)}
          >
            <View style={[styles.dietSquare, { borderColor: Colors.foodVegGreen }]}>
              <View style={[styles.dietDot, { backgroundColor: Colors.foodVegGreen }]} />
            </View>
            <View style={styles.vegText}>
              <Text style={styles.vegTitle}>Deliver in a separate veg-only bag</Text>
              <Text style={styles.vegSub}>We’ll match a veg-only delivery partner for this order.</Text>
            </View>
            <View style={[styles.checkbox, vegBag && styles.checkboxOn]}>
              {vegBag && <Ionicons name="checkmark" size={14} color={Colors.white} />}
            </View>
          </Pressable>
        )}

        {/* Bill details */}
        <Text style={styles.sectionLabel}>Bill details</Text>
        <SectionCard style={styles.billCard}>
          <BillRow label="Item total" value={formatPrice(bill.itemTotal)} />
          <BillRow
            label="Delivery fee"
            value={bill.deliveryFee === 0 ? 'FREE' : formatPrice(bill.deliveryFee)}
            positive={bill.deliveryFee === 0}
          />
          <BillRow label="Platform fee" value={formatPrice(bill.platformFee)} />
          <BillRow label="GST & charges" value={formatPrice(bill.tax)} />
          {bill.discountAmount > 0 && (
            <BillRow label="Item discount" value={'− ' + formatPrice(bill.discountAmount)} positive />
          )}
          {tip > 0 && <BillRow label="Delivery tip" value={formatPrice(tip)} />}
          <View style={styles.billDivider} />
          <BillRow label="To pay" value={formatPrice(grandTotal)} strong />
        </SectionCard>
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
        <Text style={styles.title}>Checkout</Text>
      </View>

      {body}

      {hasItems && bill && (
        <View style={[styles.footer, { paddingBottom: insets.bottom + Spacing.md }]}>
          {!address && (
            <Text style={styles.footerHint}>Add a delivery address to continue</Text>
          )}
          <Pressable
            style={[styles.cta, !canProceed && styles.ctaOff]}
            onPress={proceed}
            disabled={!canProceed}
            accessibilityRole="button"
            accessibilityLabel={`Proceed to pay ${formatPrice(grandTotal)}`}
          >
            {isLoading ? (
              <ActivityIndicator size="small" color={Colors.white} />
            ) : (
              <>
                <View>
                  <Text style={styles.ctaAmount}>{formatPrice(grandTotal)}</Text>
                  <Text style={styles.ctaAmountSub}>TOTAL</Text>
                </View>
                <View style={styles.ctaMain}>
                  <Text style={styles.ctaText}>Proceed to Pay</Text>
                  <Ionicons name="arrow-forward" size={18} color={Colors.white} />
                </View>
              </>
            )}
          </Pressable>
        </View>
      )}
    </View>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────

const makeStyles = (t: AccentTheme) =>
  StyleSheet.create({
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
  title: { fontSize: 22, fontWeight: '800', color: Colors.foodText },

  sectionLabel: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.6,
    color: Colors.foodTextMuted,
    textTransform: 'uppercase',
    marginTop: Spacing.lg,
    marginBottom: Spacing.sm,
  },

  card: {
    backgroundColor: Colors.foodCardBg,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.foodBorder,
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.sm,
  },

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
  addrIcon: {
    width: 40,
    height: 40,
    borderRadius: BorderRadius.md,
    backgroundColor: t.accentLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addrText: { flex: 1, gap: 2 },
  addrTitleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  addrTitle: { fontSize: 14.5, fontWeight: '800', color: Colors.foodText },
  addrLine: { fontSize: 13, color: Colors.foodTextSecondary, lineHeight: 18 },
  addrChange: { fontSize: 12, fontWeight: '800', color: t.accent, letterSpacing: 0.5 },

  // Order summary
  summaryHeader: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  editLink: {
    fontSize: 12,
    fontWeight: '800',
    color: t.accent,
    letterSpacing: 0.5,
    marginBottom: Spacing.sm,
  },
  line: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm, paddingVertical: Spacing.md },
  lineDivider: { height: 1, backgroundColor: Colors.foodBorder },
  lineMain: { flex: 1, gap: 3 },
  lineName: { fontSize: 14, fontWeight: '600', color: Colors.foodText, lineHeight: 19 },
  lineOptions: { fontSize: 12, color: Colors.foodTextMuted, lineHeight: 16 },
  linePrice: { fontSize: 13.5, fontWeight: '700', color: Colors.foodText, marginTop: 1 },

  // Upsell
  upsellRow: { gap: Spacing.md, paddingVertical: Spacing.xs, paddingRight: Spacing.base },
  upsellCard: {
    width: 128,
    backgroundColor: Colors.foodCardBg,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.foodBorder,
    padding: Spacing.sm,
    gap: 6,
  },
  upsellImgWrap: { borderRadius: BorderRadius.sm, overflow: 'hidden' },
  upsellImg: { width: '100%', height: 76, borderRadius: BorderRadius.sm },
  upsellName: { fontSize: 12, fontWeight: '600', color: Colors.foodText, lineHeight: 15, minHeight: 30 },
  upsellFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  upsellPrice: { fontSize: 12.5, fontWeight: '800', color: Colors.foodText },
  upsellAdd: {
    width: 22,
    height: 22,
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    borderColor: t.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Notes + chips
  notesInput: {
    fontSize: 13.5,
    color: Colors.foodText,
    paddingVertical: Spacing.sm,
    minHeight: 40,
    textAlignVertical: 'top',
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.xs,
    borderTopWidth: 1,
    borderTopColor: Colors.foodBorder,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: Spacing.md,
    paddingVertical: 7,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: Colors.foodBorder,
    backgroundColor: Colors.foodBg,
  },
  chipActive: { borderColor: t.accent, backgroundColor: t.accentLight },
  chipText: { fontSize: 12.5, fontWeight: '700', color: Colors.foodTextSecondary },
  chipTextActive: { color: t.accentDark },

  // Tip
  tipCard: { flexDirection: 'row', gap: Spacing.sm, paddingVertical: Spacing.md },
  tipBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.foodBorder,
    backgroundColor: Colors.foodBg,
  },
  tipBtnActive: { borderColor: t.accent, backgroundColor: t.accentLight },
  tipBtnText: { fontSize: 13.5, fontWeight: '800', color: Colors.foodTextSecondary },
  tipBtnTextActive: { color: t.accentDark },

  // Veg-only bag
  vegRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    marginTop: Spacing.md,
    padding: Spacing.base,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.foodBorder,
    backgroundColor: Colors.foodCardBg,
  },
  vegRowActive: { borderColor: Colors.foodVegGreen, backgroundColor: Colors.foodPureVegBg },
  vegText: { flex: 1, gap: 2 },
  vegTitle: { fontSize: 13.5, fontWeight: '700', color: Colors.foodText },
  vegSub: { fontSize: 11.5, color: Colors.foodTextSecondary, lineHeight: 15 },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: BorderRadius.sm,
    borderWidth: 2,
    borderColor: Colors.foodBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxOn: { borderColor: Colors.foodVegGreen, backgroundColor: Colors.foodVegGreen },

  // Bill
  billCard: { paddingVertical: Spacing.base },
  billRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 5,
  },
  billLabel: { fontSize: 13.5, color: Colors.foodTextSecondary },
  billLabelStrong: { fontSize: 15, fontWeight: '800', color: Colors.foodText },
  billValue: { fontSize: 13.5, fontWeight: '600', color: Colors.foodText },
  billValueStrong: { fontSize: 15, fontWeight: '800' },
  billValuePositive: { color: Colors.foodVegGreen, fontWeight: '700' },
  billDivider: { height: 1, backgroundColor: Colors.foodBorder, marginVertical: Spacing.sm },

  // Diet mark
  dietSquare: {
    width: 14,
    height: 14,
    borderRadius: 3,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 3,
  },
  dietDot: { width: 6, height: 6, borderRadius: 3 },

  // Footer CTA
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: Colors.foodSurface,
    borderTopWidth: 1,
    borderTopColor: Colors.foodBorder,
    paddingHorizontal: Spacing.base,
    paddingTop: Spacing.md,
  },
  footerHint: {
    fontSize: 12,
    color: t.accentDark,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: Spacing.sm,
  },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 54,
    paddingHorizontal: Spacing.lg,
    borderRadius: BorderRadius.full,
    backgroundColor: t.accent,
  },
  ctaOff: { opacity: 0.5 },
  ctaAmount: { fontSize: 16, fontWeight: '800', color: Colors.white },
  ctaAmountSub: { fontSize: 9, fontWeight: '700', color: Colors.white, opacity: 0.8, letterSpacing: 0.5 },
  ctaMain: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  ctaText: { fontSize: 15.5, fontWeight: '800', color: Colors.white },

  // Center states
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, padding: Spacing.xl },
  centerTitle: { fontSize: 18, fontWeight: '800', color: Colors.foodText, marginTop: 8 },
  centerMessage: { fontSize: 14, color: Colors.foodTextMuted, textAlign: 'center', lineHeight: 20 },
  centerBtn: {
    marginTop: Spacing.md,
    backgroundColor: t.accent,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.full,
  },
  centerBtnText: { fontSize: 14, fontWeight: '800', color: Colors.white },

  // Skeleton
  skelWrap: { padding: Spacing.base, gap: Spacing.md },
  skel: { backgroundColor: Colors.foodSearchBg, borderRadius: BorderRadius.lg },
  });

const styles = makeStyles(ORANGE_ACCENT);
