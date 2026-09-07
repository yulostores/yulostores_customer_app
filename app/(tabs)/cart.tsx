/**
 * app/(tabs)/cart.tsx — the cart screen.
 *
 * Everything on it comes from `GET /api/cart` (src/hooks/useCartScreen):
 *   • the storefront name         ← cart.restaurant
 *   • each line + its picked options ← cart.items[].resolvedOptions
 *   • every money row + the total  ← bill  (computed server-side, never here)
 *
 * Quantity edits and removals PATCH / DELETE the line and swap in the fresh
 * `{ cart, bill }` the server returns. The checkout button is green only when
 * every line is vegetarian (`cart.isAllVeg`, derived from each line's snapshotted
 * `foodType`) and orange otherwise — the same veg/non-veg accent the Home
 * `CartBar` and the diet marks use.
 */

import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../../src/constants/Colors';
import { BorderRadius, Spacing } from '../../src/constants/Theme';
import { useAuth } from '../../src/context/AuthContext';
import {
  ORANGE_ACCENT,
  useAccentTheme,
  useThemedStyles,
  type AccentTheme,
} from '../../src/hooks/useAccentTheme';
import { useCartScreen } from '../../src/hooks/useCartScreen';
import { logger } from '../../src/lib/logger';
import { clearCart, type CartBill, type CartLine, type FoodType } from '../../src/services/cart';

const formatPrice = (n: number) => '₹' + Math.round(n).toLocaleString('en-IN');

/** Back out of the tab — falls back to Home when there's nothing to pop. */
function goBack() {
  if (router.canGoBack()) router.back();
  else router.navigate('/(tabs)');
}

// ─── Small shared pieces ─────────────────────────────────────────────────

/** The standard veg / non-veg mark — green for veg, maroon for everything else. */
function FoodTypeDot({ foodType }: { foodType: FoodType | null }) {
  const color = foodType === 'veg' ? Colors.foodVegGreen : Colors.foodNonVegRed;
  return (
    <View style={[styles.dietSquare, { borderColor: color }]}>
      <View style={[styles.dietDot, { backgroundColor: color }]} />
    </View>
  );
}

function Stepper({
  qty,
  busy,
  onChange,
}: {
  qty: number;
  busy: boolean;
  onChange: (next: number) => void;
}) {
  const styles = useThemedStyles(makeStyles);
  const { accent } = useAccentTheme();
  if (busy) {
    return (
      <View style={styles.stepper}>
        <ActivityIndicator size="small" color={accent} />
      </View>
    );
  }
  const atMin = qty <= 1;
  return (
    <View style={styles.stepper}>
      <Pressable
        style={styles.stepBtn}
        hitSlop={6}
        onPress={() => onChange(qty - 1)}
        accessibilityLabel={atMin ? 'Remove item' : 'Reduce quantity'}
      >
        <Ionicons
          name={atMin ? 'trash-outline' : 'remove'}
          size={atMin ? 14 : 16}
          color={accent}
        />
      </Pressable>
      <Text style={styles.stepValue}>{qty}</Text>
      <Pressable
        style={styles.stepBtn}
        hitSlop={6}
        onPress={() => onChange(qty + 1)}
        disabled={qty >= 20}
        accessibilityLabel="Increase quantity"
      >
        <Ionicons name="add" size={16} color={qty >= 20 ? Colors.foodTextMuted : accent} />
      </Pressable>
    </View>
  );
}

function LineRow({
  line,
  busy,
  onChangeQty,
}: {
  line: CartLine;
  busy: boolean;
  onChangeQty: (qty: number) => void;
}) {
  const styles = useThemedStyles(makeStyles);
  const optionText = line.options
    .map((o) => o.name)
    .filter((n): n is string => !!n)
    .join(', ');

  return (
    <View style={[styles.line, busy && styles.lineBusy]}>
      <View style={styles.qtyBadge}>
        <Text style={styles.qtyBadgeText}>{line.qty}×</Text>
      </View>

      <View style={styles.lineMain}>
        <View style={styles.lineNameRow}>
          <FoodTypeDot foodType={line.foodType} />
          <Text style={styles.lineName} numberOfLines={2}>
            {line.name}
          </Text>
        </View>
        {!!optionText && (
          <Text style={styles.lineOptions} numberOfLines={2}>
            {optionText}
          </Text>
        )}
      </View>

      <View style={styles.lineRight}>
        <Text style={styles.linePrice}>{formatPrice(line.unitPrice * line.qty)}</Text>
        <Stepper qty={line.qty} busy={busy} onChange={onChangeQty} />
      </View>
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

/**
 * "Apply coupon" — a collapsed link that opens an inline code field. Once a code
 * takes (the server fills in `bill.discountAmount`), it flips to a confirmed
 * state. There is no "remove": the backend keeps the discount on the cart and
 * re-validates it per read — see `applyPromo` in src/services/cart.ts.
 */
function CouponRow({
  appliedCode,
  discountAmount,
  pending,
  accent,
  onApply,
}: {
  appliedCode: string | null;
  discountAmount: number;
  pending: boolean;
  accent: string;
  onApply: (code: string) => Promise<boolean>;
}) {
  const styles = useThemedStyles(makeStyles);
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState('');
  const applied = !!appliedCode && discountAmount > 0;

  if (applied) {
    return (
      <View style={[styles.card, styles.couponCard, styles.couponApplied]}>
        <Ionicons name="pricetag" size={16} color={Colors.foodVegGreen} />
        <Text style={styles.couponAppliedText} numberOfLines={1}>
          <Text style={styles.couponCode}>{appliedCode}</Text> applied — you saved{' '}
          {formatPrice(discountAmount)}
        </Text>
      </View>
    );
  }

  if (!open) {
    return (
      <Pressable
        style={[styles.card, styles.couponCard]}
        onPress={() => setOpen(true)}
        hitSlop={6}
      >
        <Ionicons name="pricetag-outline" size={16} color={accent} />
        <Text style={[styles.couponLink, { color: accent }]}>Apply coupon</Text>
        <Ionicons name="chevron-forward" size={16} color={Colors.foodTextMuted} />
      </Pressable>
    );
  }

  const submit = async () => {
    const ok = await onApply(code);
    if (ok) {
      setCode('');
      setOpen(false);
    }
  };

  return (
    <View style={[styles.card, styles.couponCard, styles.couponOpen]}>
      <Ionicons name="pricetag-outline" size={16} color={accent} />
      <TextInput
        style={styles.couponInput}
        value={code}
        onChangeText={(t) => setCode(t.toUpperCase())}
        placeholder="Enter coupon code"
        placeholderTextColor={Colors.foodTextMuted}
        autoCapitalize="characters"
        autoCorrect={false}
        editable={!pending}
        returnKeyType="done"
        onSubmitEditing={submit}
      />
      <Pressable
        onPress={submit}
        disabled={pending || code.trim().length === 0}
        hitSlop={6}
        style={styles.couponApplyBtn}
      >
        {pending ? (
          <ActivityIndicator size="small" color={accent} />
        ) : (
          <Text
            style={[
              styles.couponApplyText,
              { color: code.trim().length === 0 ? Colors.foodTextMuted : accent },
            ]}
          >
            APPLY
          </Text>
        )}
      </Pressable>
    </View>
  );
}

function BillDetails({ bill, stale }: { bill: CartBill; stale: boolean }) {
  return (
    <View style={[styles.card, styles.billCard, stale && styles.billStale]}>
      <View style={styles.billHeader}>
        <Text style={styles.cardTitle}>Bill details</Text>
        {stale && <ActivityIndicator size="small" color={Colors.foodTextMuted} />}
      </View>

      <BillRow label="Item total" value={formatPrice(bill.itemTotal)} />
      <BillRow
        label="Delivery fee"
        value={bill.deliveryFee === 0 ? 'FREE' : formatPrice(bill.deliveryFee)}
        positive={bill.deliveryFee === 0}
      />
      <BillRow label="Platform fee" value={formatPrice(bill.platformFee)} />
      <BillRow label="GST & charges" value={formatPrice(bill.tax)} />
      {bill.discountAmount > 0 && (
        <BillRow
          label="Item discount"
          value={'− ' + formatPrice(bill.discountAmount)}
          positive
        />
      )}

      <View style={styles.billDivider} />
      <BillRow label="To pay" value={formatPrice(bill.grandTotal)} strong />
    </View>
  );
}

// ─── Full-screen states ──────────────────────────────────────────────────

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
      <Ionicons name={icon} size={64} color={Colors.foodBorder} />
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
      <View style={[styles.skel, { width: '45%', height: 16 }]} />
      <View style={[styles.skel, styles.skelCard]} />
      <View style={[styles.skel, styles.skelCard, { height: 180 }]} />
    </View>
  );
}

// ─── Screen ──────────────────────────────────────────────────────────────

export default function CartScreen() {
  const styles = useThemedStyles(makeStyles);
  const theme = useAccentTheme();
  const insets = useSafeAreaInsets();
  const { signOut } = useAuth();
  const {
    snapshot,
    isLoading,
    error,
    notSignedIn,
    billStale,
    pendingLineIds,
    actionError,
    appliedCode,
    promoPending,
    refresh,
    setLineQty,
    applyPromo,
    dismissActionError,
  } = useCartScreen();

  const cart = snapshot?.cart ?? null;
  const bill = snapshot?.bill ?? null;
  const hasItems = !!cart && cart.lines.length > 0;
  // Green when the app-wide "Pure veg" theme is on, or when every line in this
  // cart is vegetarian (`cart.isAllVeg`); the brand accent otherwise.
  const accent = theme.isPureVeg || cart?.isAllVeg ? Colors.foodVegGreen : theme.accent;
  const checkoutDisabled = !hasItems || billStale || isLoading;

  const handleCheckout = () => {
    if (!cart || !bill) return;
    logger.info('cart', 'Proceeding to checkout', {
      restaurantId: cart.restaurantId,
      itemCount: cart.itemCount,
      grandTotal: bill.grandTotal,
    });
    router.push('/checkout');
  };

  const handleAddMore = () => {
    if (cart?.restaurantId) router.push(`/restaurant/${cart.restaurantId}`);
    else router.navigate('/(tabs)');
  };

  const handleEmptyCart = () => {
    Alert.alert(
      'Empty cart?',
      'Are you sure you want to remove all items from your cart?',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Empty', 
          style: 'destructive',
          onPress: async () => {
            try {
              await clearCart();
              refresh();
            } catch (err) {
              logger.warn('cart', 'Failed to empty cart', {
                reason: err instanceof Error ? err.message : String(err),
              });
            }
          }
        }
      ]
    );
  };

  // ── Body ──
  let body: ReactNode;
  if (isLoading) {
    body = <Skeleton />;
  } else if (notSignedIn) {
    body = (
      <CenterState
        icon="lock-closed-outline"
        title="Sign in to view your cart"
        message="Your cart is tied to your account. Sign in again to pick up where you left off."
        actionLabel="Sign in"
        onAction={signOut}
      />
    );
  } else if (error) {
    body = (
      <CenterState
        icon="cloud-offline-outline"
        title="Couldn’t load your cart"
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
        message="Add dishes from a restaurant and they’ll show up here."
        actionLabel="Browse restaurants"
        onAction={() => router.navigate('/(tabs)')}
      />
    );
  } else if (cart && bill) {
    body = (
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 120 }}
      >
        {!!cart.restaurant && (
          <Pressable
            style={styles.storefront}
            onPress={() => router.push(`/restaurant/${cart.restaurant!.id}`)}
          >
            <Text style={styles.storefrontName} numberOfLines={1}>
              {cart.restaurant.name}
            </Text>
            <Ionicons name="chevron-forward" size={16} color={Colors.foodTextMuted} />
          </Pressable>
        )}

        <View style={styles.card}>
          {cart.lines.map((line, i) => (
            <View key={line.id}>
              {i > 0 && <View style={styles.lineDivider} />}
              <LineRow
                line={line}
                busy={pendingLineIds.has(line.id)}
                onChangeQty={(qty) => setLineQty(line.id, qty)}
              />
            </View>
          ))}
        </View>

        <Pressable style={styles.addMore} onPress={handleAddMore} hitSlop={6}>
          <Ionicons name="add" size={16} color={accent} />
          <Text style={[styles.addMoreText, { color: accent }]}>Add more items</Text>
        </Pressable>

        <CouponRow
          appliedCode={appliedCode}
          discountAmount={bill.discountAmount}
          pending={promoPending}
          accent={accent}
          onApply={applyPromo}
        />

        <BillDetails bill={bill} stale={billStale} />

        {!!actionError && (
          <Pressable style={styles.actionError} onPress={dismissActionError}>
            <Ionicons name="alert-circle" size={15} color={Colors.authDanger} />
            <Text style={styles.actionErrorText}>{actionError}</Text>
          </Pressable>
        )}
      </ScrollView>
    );
  }

  return (
    <View style={styles.screen}>
      <StatusBar style="dark" />
      <View style={{ height: insets.top, backgroundColor: Colors.foodBg }} />

      <View style={[styles.header, { justifyContent: 'space-between' }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm }}>
          <Pressable onPress={goBack} hitSlop={8} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={24} color={Colors.foodText} />
          </Pressable>
          <Text style={styles.title}>Your cart</Text>
        </View>
        {hasItems && (
          <Pressable onPress={handleEmptyCart} hitSlop={8} style={{ padding: 4 }}>
            <Ionicons name="trash-outline" size={22} color={Colors.foodTextMuted} />
          </Pressable>
        )}
      </View>

      {body}

      {hasItems && bill && (
        <View style={[styles.footer, { paddingBottom: insets.bottom + Spacing.md }]}>
          <Pressable
            style={[
              styles.cta,
              { backgroundColor: accent },
              checkoutDisabled && styles.ctaOff,
            ]}
            onPress={handleCheckout}
            disabled={checkoutDisabled}
            accessibilityRole="button"
            accessibilityLabel={`Proceed to checkout, ${formatPrice(bill.grandTotal)}`}
          >
            <Text style={styles.ctaText}>Proceed to checkout</Text>
            <Text style={styles.ctaDot}>·</Text>
            <Text style={styles.ctaText}>{formatPrice(bill.grandTotal)}</Text>
            <Ionicons name="arrow-forward" size={18} color={Colors.white} style={styles.ctaIcon} />
          </Pressable>
        </View>
      )}
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────

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

  // Storefront
  storefront: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: Spacing.base,
    paddingBottom: Spacing.md,
  },
  storefrontName: { fontSize: 14, fontWeight: '600', color: Colors.foodTextSecondary },

  // Card shell
  card: {
    backgroundColor: Colors.foodCardBg,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.foodBorder,
    marginHorizontal: Spacing.base,
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.sm,
  },
  cardTitle: { fontSize: 16, fontWeight: '800', color: Colors.foodText },

  // Coupon row
  couponCard: {
    marginTop: Spacing.xs,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  couponApplied: { borderColor: Colors.foodVegGreen, backgroundColor: Colors.foodPureVegBg },
  couponAppliedText: { flex: 1, fontSize: 13, color: Colors.foodText },
  couponCode: { fontWeight: '800', color: Colors.foodText },
  couponLink: { flex: 1, fontSize: 14, fontWeight: '700' },
  couponOpen: { paddingVertical: Spacing.xs },
  couponInput: { flex: 1, fontSize: 14, color: Colors.foodText, paddingVertical: Spacing.sm },
  couponApplyBtn: { paddingHorizontal: Spacing.sm, paddingVertical: Spacing.sm },
  couponApplyText: { fontSize: 13, fontWeight: '800', letterSpacing: 0.3 },

  // Line item
  line: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.md,
    paddingVertical: Spacing.md,
  },
  lineBusy: { opacity: 0.55 },
  lineDivider: { height: 1, backgroundColor: Colors.foodBorder },
  qtyBadge: {
    minWidth: 30,
    height: 30,
    paddingHorizontal: 6,
    borderRadius: BorderRadius.sm,
    backgroundColor: t.accentLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  qtyBadgeText: { fontSize: 12.5, fontWeight: '800', color: t.accentDark },
  lineMain: { flex: 1, gap: 3 },
  lineNameRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 7 },
  lineName: { flex: 1, fontSize: 14.5, fontWeight: '600', color: Colors.foodText, lineHeight: 19 },
  lineOptions: { fontSize: 12, color: Colors.foodTextMuted, lineHeight: 16, marginLeft: 21 },
  lineRight: { alignItems: 'flex-end', gap: 8 },
  linePrice: { fontSize: 14, fontWeight: '700', color: Colors.foodText },

  // Stepper
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 92,
    height: 32,
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.foodBorder,
    borderRadius: BorderRadius.md,
  },
  stepBtn: { width: 28, height: 30, alignItems: 'center', justifyContent: 'center' },
  stepValue: {
    minWidth: 18,
    textAlign: 'center',
    fontSize: 13.5,
    fontWeight: '800',
    color: t.accent,
  },

  // Add more
  addMore: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
  },
  addMoreText: { fontSize: 13.5, fontWeight: '800' },

  // Bill
  billCard: { marginTop: Spacing.xs, paddingVertical: Spacing.base },
  billStale: { opacity: 0.6 },
  billHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.sm,
  },
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
  billDivider: {
    height: 1,
    backgroundColor: Colors.foodBorder,
    marginVertical: Spacing.sm,
  },

  // Inline action error
  actionError: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginHorizontal: Spacing.base,
    marginTop: Spacing.md,
    padding: Spacing.sm,
    borderRadius: BorderRadius.sm,
    backgroundColor: '#FDECEC',
  },
  actionErrorText: { flex: 1, fontSize: 12.5, fontWeight: '600', color: Colors.authDanger },

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
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 52,
    borderRadius: BorderRadius.full,
  },
  ctaOff: { opacity: 0.5 },
  ctaText: { fontSize: 15.5, fontWeight: '800', color: Colors.white },
  ctaDot: { fontSize: 15.5, fontWeight: '800', color: Colors.white, opacity: 0.85 },
  ctaIcon: { marginLeft: 2 },

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
  skel: { backgroundColor: Colors.foodSearchBg, borderRadius: BorderRadius.md },
  skelCard: { height: 150, borderRadius: BorderRadius.lg },
  });

const styles = makeStyles(ORANGE_ACCENT);
