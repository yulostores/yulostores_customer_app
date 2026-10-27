/**
 * app/checkout/index.tsx — the checkout screen.
 *
 * One screen, cart to placed order — everything on it comes from
 * `GET /api/checkout/summary` (src/hooks/useCheckout) or the live cart mutation
 * endpoints it wraps:
 *   • delivery address      ← the account default, or whichever saved address the
 *                              customer picked on `app/address` (DeliveryLocationContext)
 *   • the order lines       ← the server cart, with each line's live dish photo;
 *                              the qty stepper PATCHes/DELETEs the real line
 *   • "Complete your meal"  ← real menu categories (+ a bestseller-first "Popular"
 *                              bucket) scoped to the cart's restaurant, already
 *                              excluding what's in the cart; "+" posts straight
 *                              to the cart the same as the restaurant page's ADD
 *   • every money row       ← the server's `bill.charges.lines`, in order (item
 *                              total, discount, GST on food, delivery fee — "Free
 *                              delivery" when the restaurant pays it — platform fee,
 *                              tip, round off, To pay). Nothing is summed here: the
 *                              tip re-prices the summary on the server, and "To pay"
 *                              is `charges.grandTotal`, the exact amount charged.
 *   • the tip presets       ← server config, not a client list
 *   • placing + paying      ← POST /api/orders/checkout, then Razorpay Checkout (or
 *                              the dev simulation) — see src/services/payments.ts.
 *                              A payment that doesn't confirm leaves the order placed
 *                              with "Retry payment"; it is never cancelled from here.
 *                              "Pay on delivery" only shows while COD is switched on.
 *                              The payment-method catalogue (icons/labels) is the
 *                              documented client twin of the backend's config, same
 *                              as the read-only Settings → "Payment methods" screen
 */

import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect, useNavigation } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
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
import { useVegMode } from '../../src/context/VegModeContext';
import { RemoteImage } from '../../src/components/RemoteImage';
import { Colors } from '../../src/constants/Colors';
import { BorderRadius, Elevation, Spacing } from '../../src/constants/Theme';
import { useAuth } from '../../src/context/AuthContext';
import { useDeliveryLocation } from '../../src/context/DeliveryLocationContext';
import { hasUsablePoint } from '../../src/lib/address';
import { changeQtyWithConfirm, confirmAction, confirmCopy } from '../../src/lib/confirm';
import {
  ORANGE_ACCENT,
  useAccentTheme,
  useThemedStyles,
  type AccentTheme,
} from '../../src/hooks/useAccentTheme';
import { useCheckout } from '../../src/hooks/useCheckout';
import type { CartBill, CartLine, ChargeLine, FoodType } from '../../src/services/cart';
import type { MealItem, MealSection } from '../../src/services/checkout';
import {
  getMethod,
  methodsForGroup,
  PAYMENT_GROUPS,
  type PaymentGroupId,
  type PaymentMethod,
  type PaymentMethodId,
} from '../../src/services/payments';
import type { SavedAddress } from '../../src/types/address';

const formatPrice = (n: number) => '₹' + Math.max(0, Math.round(n)).toLocaleString('en-IN');

/** Exact paise → "₹357" / "₹10.17" — bill lines are shown to the paisa, never rounded here. */
const formatPaise = (paise: number) =>
  '₹' +
  (Math.abs(paise) / 100).toLocaleString('en-IN', {
    minimumFractionDigits: Math.abs(paise) % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  });

function goBack() {
  if (router.canGoBack()) router.back();
  else router.navigate('/(tabs)/cart');
}

function addressBits(a: SavedAddress): { label: string; line: string } {
  const label = a.customLabel ?? a.label.charAt(0).toUpperCase() + a.label.slice(1);
  const line =
    [a.street, a.city, a.state, a.pincode].map((s) => s?.trim()).filter(Boolean).join(', ') ||
    'No address details saved';
  return { label, line };
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
  sublabel,
  value,
  strong,
  positive,
}: {
  label: string;
  sublabel?: string | null;
  value: string;
  strong?: boolean;
  positive?: boolean;
}) {
  return (
    <View style={styles.billRow}>
      <View style={{ flex: 1, paddingRight: Spacing.sm }}>
        <Text style={[styles.billLabel, strong && styles.billLabelStrong]}>{label}</Text>
        {!!sublabel && <Text style={styles.billSublabel}>{sublabel}</Text>}
      </View>
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
      <Ionicons name={icon} size={14} color={active ? accentDark : Colors.foodTextSecondary} />
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

// ─── Address ───────────────────────────────────────────────────────────────

function AddressBlock({ address, locked }: { address: SavedAddress | null; locked?: boolean }) {
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
  // An address the server could not place on the map even after the retry it runs while
  // building this summary (yulo_backend services/user.service.js `ensureAddressLocated`).
  // The order is still allowed through — a postal address the customer knows is real is
  // not a reason to refuse them dinner — but it is the last moment anyone can cheaply fix
  // it, and it is worth saying what it costs: the drop distance, the partner matching that
  // ranks on it, and the live map on the tracking screen all need a point.
  const located = hasUsablePoint(address);
  return (
    <View style={styles.addressGroup}>
      <Pressable
        style={styles.addressCard}
        onPress={() => router.push('/address')}
        // The order is placed — its address can't change any more.
        disabled={locked}
      >
        <View style={styles.addrIcon}>
          <Ionicons name="location-sharp" size={20} color={accent} />
        </View>
        <View style={styles.addrText}>
          <Text style={styles.addrTitle}>Delivering to {label}</Text>
          <Text style={styles.addrLine} numberOfLines={2}>
            {line}
          </Text>
        </View>
        {!locked && <Ionicons name="chevron-forward" size={18} color={Colors.foodTextMuted} />}
      </Pressable>

      {!located && !locked && (
        <Pressable
          style={styles.addrUnlocated}
          onPress={() =>
            router.push({
              pathname: '/location/map',
              params: { editId: address._id, from: 'checkout' },
            })
          }
          accessibilityRole="button"
          accessibilityLabel="Pin this address on the map"
        >
          <Ionicons name="warning-outline" size={16} color={Colors.warning} />
          <Text style={styles.addrUnlocatedText}>
            We couldn&apos;t find this address on the map. Drop a pin so your order can be
            tracked and reach you faster.
          </Text>
          <Text style={[styles.addrUnlocatedAction, { color: accent }]}>Pin</Text>
        </Pressable>
      )}
    </View>
  );
}

// ─── Delivery instructions ──────────────────────────────────────────────────

function InstructionsRow({
  value,
  onChange,
}: {
  value: string;
  onChange: (next: string) => void;
}) {
  const styles = useThemedStyles(makeStyles);
  const { accent } = useAccentTheme();
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <Pressable style={styles.instructionsLink} onPress={() => setOpen(true)} hitSlop={6}>
        <Ionicons name="create-outline" size={15} color={accent} />
        <Text style={styles.instructionsLinkText} numberOfLines={1}>
          {value.trim() || 'Add instructions for delivery partner'}
        </Text>
      </Pressable>
    );
  }
  return (
    <View style={styles.instructionsOpen}>
      <TextInput
        style={styles.instructionsInput}
        placeholder="E.g. Leave at the door, ring the bell…"
        placeholderTextColor={Colors.foodTextMuted}
        value={value}
        onChangeText={onChange}
        multiline
        maxLength={200}
        autoFocus
      />
      <Pressable style={styles.instructionsDone} onPress={() => setOpen(false)} hitSlop={6}>
        <Text style={[styles.instructionsDoneText, { color: accent }]}>Done</Text>
      </Pressable>
    </View>
  );
}

// ─── Cart line ──────────────────────────────────────────────────────────────

function LineCard({
  line,
  busy,
  locked,
  onChangeQty,
}: {
  line: CartLine;
  busy: boolean;
  /** The order is placed — show the quantity, not a stepper. */
  locked?: boolean;
  onChangeQty: (qty: number) => void;
}) {
  const styles = useThemedStyles(makeStyles);
  const { accent } = useAccentTheme();
  const optionText = line.options
    .map((o) => o.name)
    .filter((n): n is string => !!n)
    .join(', ');
  const atMin = line.qty <= 1;

  return (
    <View style={styles.lineCard}>
      <View style={styles.lineImageWrap}>
        <RemoteImage
          uri={line.image ?? undefined}
          style={styles.lineImage}
          icon="fast-food-outline"
          iconSize={22}
        />
        <View style={styles.lineImageDiet}>
          <FoodTypeDot foodType={line.foodType} />
        </View>
      </View>

      <View style={styles.lineMain}>
        <Text style={styles.lineName} numberOfLines={2}>
          {line.name}
        </Text>
        {!!optionText && (
          <Text style={styles.lineOptions} numberOfLines={1}>
            {optionText}
          </Text>
        )}
        {!!optionText && !locked && (
          <Pressable
            onPress={() =>
              router.push({
                pathname: '/item/[id]',
                params: {
                  id: line.menuItemId,
                  editLineId: line.id,
                  editQty: String(line.qty),
                  editOptions: JSON.stringify(line.selectedOptions),
                },
              })
            }
            hitSlop={6}
            style={styles.lineEditBtn}
          >
            <Text style={[styles.lineEditText, { color: accent }]}>Edit</Text>
            <Ionicons name="chevron-forward" size={12} color={accent} />
          </Pressable>
        )}
      </View>

      <View style={styles.lineRight}>
        {locked ? (
          <Text style={styles.stepValue}>× {line.qty}</Text>
        ) : busy ? (
          <View style={styles.stepper}>
            <ActivityIndicator size="small" color={accent} />
          </View>
        ) : (
          <View style={styles.stepper}>
            <Pressable
              style={styles.stepBtn}
              hitSlop={6}
              onPress={() => onChangeQty(line.qty - 1)}
              accessibilityLabel={atMin ? 'Remove item' : 'Reduce quantity'}
            >
              <Ionicons name={atMin ? 'trash-outline' : 'remove'} size={atMin ? 13 : 15} color={accent} />
            </Pressable>
            <Text style={styles.stepValue}>{line.qty}</Text>
            <Pressable
              style={styles.stepBtn}
              hitSlop={6}
              onPress={() => onChangeQty(line.qty + 1)}
              disabled={line.qty >= 20}
              accessibilityLabel="Increase quantity"
            >
              <Ionicons name="add" size={15} color={line.qty >= 20 ? Colors.foodTextMuted : accent} />
            </Pressable>
          </View>
        )}
        <Text style={styles.linePrice}>{formatPrice(line.unitPrice * line.qty)}</Text>
      </View>
    </View>
  );
}

// ─── Complete your meal ─────────────────────────────────────────────────────

function MealCard({
  item,
  adding,
  onAdd,
}: {
  item: MealItem;
  adding: boolean;
  onAdd: () => void;
}) {
  const styles = useThemedStyles(makeStyles);
  const { accent } = useAccentTheme();
  const isBestseller = item.badges.some((b) => b.toLowerCase().includes('best'));

  return (
    <Pressable style={styles.mealCard} onPress={() => router.push(`/item/${item.id}`)}>
      <View style={styles.mealImageWrap}>
        <RemoteImage
          uri={item.image ?? undefined}
          style={styles.mealImage}
          icon="fast-food-outline"
          iconSize={26}
        />
        <View style={styles.mealBadges}>
          {item.foodType === 'veg' && (
            <View style={[styles.mealBadge, styles.mealBadgeVeg]}>
              <FoodTypeDot foodType="veg" />
              <Text style={styles.mealBadgeVegText}>Veg</Text>
            </View>
          )}
          {isBestseller && (
            <View style={[styles.mealBadge, styles.mealBadgeBest]}>
              <Text style={styles.mealBadgeBestText}>Bestseller</Text>
            </View>
          )}
        </View>
      </View>

      <Text style={styles.mealName} numberOfLines={1}>
        {item.name}
      </Text>
      {!!item.description && (
        <Text style={styles.mealDesc} numberOfLines={2}>
          {item.description}
        </Text>
      )}

      <View style={styles.mealFooter}>
        <View style={styles.mealPriceRow}>
          <Text style={styles.mealPrice}>{formatPrice(item.price)}</Text>
          {item.mrpPrice != null && (
            <Text style={styles.mealPriceStrike}>{formatPrice(item.mrpPrice)}</Text>
          )}
        </View>
        <Pressable
          style={styles.mealAddBtn}
          onPress={(e) => {
            e.stopPropagation();
            onAdd();
          }}
          disabled={adding}
          accessibilityRole="button"
          accessibilityLabel={`Add ${item.name}`}
        >
          {adding ? (
            <ActivityIndicator size="small" color={accent} />
          ) : (
            <>
              <Ionicons name="add" size={14} color={accent} />
              <Text style={[styles.mealAddText, { color: accent }]}>Add</Text>
            </>
          )}
        </Pressable>
      </View>
    </Pressable>
  );
}

function CompleteYourMeal({
  sections,
  addingMealItemId,
  onAdd,
}: {
  sections: MealSection[];
  addingMealItemId: string | null;
  onAdd: (menuItemId: string) => void;
}) {
  const styles = useThemedStyles(makeStyles);
  const { accent } = useAccentTheme();
  const [activeIndex, setActiveIndex] = useState(0);
  const active = sections[Math.min(activeIndex, sections.length - 1)];

  if (sections.length === 0 || !active) return null;

  return (
    <View>
      <Text style={styles.sectionLabel}>Complete your meal</Text>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tabRow}
      >
        {sections.map((section, i) => {
          const isActive = i === activeIndex;
          return (
            <Pressable
              key={section.id}
              style={[styles.tabPill, isActive && { backgroundColor: accent, borderColor: accent }]}
              onPress={() => setActiveIndex(i)}
            >
              <Text style={[styles.tabPillText, isActive && styles.tabPillTextActive]}>
                {section.name}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={styles.mealGrid}>
        {active.items.map((item) => (
          <MealCard
            key={item.id}
            item={item}
            adding={addingMealItemId === item.id}
            onAdd={() => (item.optionGroupCount > 0 ? router.push(`/item/${item.id}`) : onAdd(item.id))}
          />
        ))}
      </View>
    </View>
  );
}

// ─── Payment method picker (inline, in the footer) ─────────────────────────

function MethodRow({
  method,
  selected,
  onSelect,
}: {
  method: PaymentMethod;
  selected: boolean;
  onSelect: () => void;
}) {
  const styles = useThemedStyles(makeStyles);
  return (
    <Pressable style={styles.methodRow} onPress={onSelect}>
      <View style={[styles.methodBadge, { backgroundColor: method.tint + '18' }]}>
        <Ionicons name={method.icon as keyof typeof Ionicons.glyphMap} size={16} color={method.tint} />
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

function PaymentPicker({
  selectedMethodId,
  onSelect,
  showCod,
}: {
  selectedMethodId: PaymentMethodId;
  onSelect: (id: PaymentMethodId) => void;
  /** Cash on delivery is switched on (and no online order is waiting to be paid). */
  showCod: boolean;
}) {
  const styles = useThemedStyles(makeStyles);
  const [openGroups, setOpenGroups] = useState<Set<PaymentGroupId>>(
    () => new Set(PAYMENT_GROUPS.filter((g) => g.defaultOpen).map((g) => g.id)),
  );
  const toggleGroup = (id: PaymentGroupId) =>
    setOpenGroups((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  return (
    <ScrollView style={styles.pickerScroll} nestedScrollEnabled showsVerticalScrollIndicator={false}>
      {PAYMENT_GROUPS.filter((g) => showCod || g.id !== 'cod').map((group) => {
        const methods = methodsForGroup(group.id);
        const holdsSelection = methods.some((m) => m.id === selectedMethodId);
        const expanded = openGroups.has(group.id) || holdsSelection;
        return (
          <View key={group.id} style={styles.pickerGroup}>
            <Pressable style={styles.pickerGroupHeader} onPress={() => toggleGroup(group.id)} hitSlop={4}>
              <Text style={styles.pickerGroupTitle}>{group.title}</Text>
              <Ionicons
                name={expanded ? 'chevron-up' : 'chevron-down'}
                size={16}
                color={Colors.foodTextSecondary}
              />
            </Pressable>
            {expanded &&
              methods.map((m) => (
                <View key={m.id}>
                  <View style={styles.methodDivider} />
                  <MethodRow method={m} selected={m.id === selectedMethodId} onSelect={() => onSelect(m.id)} />
                </View>
              ))}
          </View>
        );
      })}
    </ScrollView>
  );
}

// ─── Bill ───────────────────────────────────────────────────────────────────

function lineValue(line: ChargeLine): { value: string; positive: boolean } {
  if (line.amountPaise == null) return { value: '—', positive: false };
  // Free delivery: the restaurant pays it — the one line that is genuinely "FREE".
  if (line.key === 'delivery_fee' && line.amountPaise === 0) return { value: 'FREE', positive: true };
  if (line.amountPaise < 0) return { value: '− ' + formatPaise(line.amountPaise), positive: line.key === 'discount' };
  return { value: formatPaise(line.amountPaise), positive: false };
}

/**
 * The bill exactly as the server priced it (`bill.charges.lines`), with the tip row
 * interactive in its place. Changing the tip re-prices on the server — the "To pay"
 * here is always `charges.grandTotal`.
 */
function BillBlock({
  bill,
  tip,
  tipPresets,
  locked,
  repricing,
  onPickTip,
}: {
  bill: CartBill;
  tip: number;
  tipPresets: number[];
  locked: boolean;
  repricing: boolean;
  onPickTip: (amount: number) => void;
}) {
  const styles = useThemedStyles(makeStyles);
  const { accent } = useAccentTheme();
  const [tipPickerOpen, setTipPickerOpen] = useState(false);

  const tipRow = (
    <View key="tip">
      <View style={styles.billRow}>
        <Text style={styles.billLabel}>Delivery partner tip</Text>
        {locked ? (
          <Text style={styles.billValue}>{tip > 0 ? formatPrice(tip) : '—'}</Text>
        ) : (
          <Pressable onPress={() => setTipPickerOpen((v) => !v)} hitSlop={6}>
            {tip > 0 ? (
              <Text style={[styles.billValue, { color: accent, fontWeight: '800' }]}>{formatPrice(tip)}</Text>
            ) : (
              <Text style={[styles.addTipLink, { color: accent }]}>Add tip</Text>
            )}
          </Pressable>
        )}
      </View>
      {!locked && tipPickerOpen && tipPresets.length > 0 && (
        <View style={styles.tipRow}>
          {tipPresets.map((amount) => {
            const active = tip === amount;
            return (
              <Pressable
                key={amount}
                style={[styles.tipBtn, active && styles.tipBtnActive]}
                onPress={() => {
                  onPickTip(active ? 0 : amount);
                  setTipPickerOpen(false);
                }}
              >
                <Text style={[styles.tipBtnText, active && styles.tipBtnTextActive]}>{formatPrice(amount)}</Text>
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );

  const charges = bill.charges;
  if (!charges) {
    // An older backend without the line breakdown — its rupee totals, tip excluded.
    return (
      <SectionCard style={styles.billCard}>
        <BillRow label="Item Total" value={formatPrice(bill.itemTotal)} />
        {bill.deliveryFee > 0 && <BillRow label="Delivery Fee" value={formatPrice(bill.deliveryFee)} />}
        <BillRow label="GST & Other Charges" value={formatPrice(bill.tax + bill.platformFee)} />
        <View style={styles.billDivider} />
        <BillRow label="To Pay" value={formatPrice(bill.grandTotal)} strong />
      </SectionCard>
    );
  }

  const rows: ReactNode[] = [];
  let tipPlaced = false;
  for (const line of charges.lines) {
    if (line.key === 'grand_total') continue;
    if (line.key === 'tip') {
      rows.push(tipRow);
      tipPlaced = true;
      continue;
    }
    // No tip yet: its row goes where the server puts one — just before round off.
    if (line.key === 'round_off' && !tipPlaced) {
      rows.push(tipRow);
      tipPlaced = true;
    }
    const { value, positive } = lineValue(line);
    rows.push(<BillRow key={line.key} label={line.label} sublabel={line.sublabel} value={value} positive={positive} />);
  }
  if (!tipPlaced) rows.push(tipRow);

  return (
    <SectionCard style={[styles.billCard, repricing && styles.billStale]}>
      {rows}
      <View style={styles.billDivider} />
      <View style={styles.billRow}>
        <Text style={[styles.billLabel, styles.billLabelStrong]}>To Pay</Text>
        {repricing ? (
          <ActivityIndicator size="small" color={accent} />
        ) : (
          <Text style={[styles.billValue, styles.billValueStrong]}>{formatPaise(charges.grandTotalPaise)}</Text>
        )}
      </View>
    </SectionCard>
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
      <View style={[styles.skel, { height: 110 }]} />
      <View style={[styles.skel, { height: 96 }]} />
      <View style={[styles.skel, { height: 170 }]} />
    </View>
  );
}

// ─── Screen ────────────────────────────────────────────────────────────────

export default function CheckoutScreen() {
  const styles = useThemedStyles(makeStyles);
  const { accent } = useAccentTheme();
  const insets = useSafeAreaInsets();
  const { signOut } = useAuth();
  const { savedAddresses, activeLocation } = useDeliveryLocation();

  const [tip, setTip] = useState(0);
  const [instructions, setInstructions] = useState('');
  const [extraCutlery, setExtraCutlery] = useState(false);
  const [cookingRequests, setCookingRequests] = useState(false);
  const [vegBag, setVegBag] = useState(false);
  const [methodPickerOpen, setMethodPickerOpen] = useState(false);

  // Only set when the customer explicitly picked a different saved address on
  // app/address — otherwise the backend bills the account default, which is
  // exactly what `displayAddress` below falls back to showing anyway.
  const pickedAddressId =
    activeLocation?.id != null
      ? savedAddresses.find((a) => a._id === activeLocation.id)?._id
      : undefined;

  const {
    summary,
    isLoading,
    isRepricing,
    error,
    notSignedIn,
    phase,
    selectedMethodId,
    selectMethod,
    codEnabled,
    actionError,
    pendingPayment,
    orderPlaced,
    placedOrderId,
    placedIsCod,
    placedTotalPaise,
    refresh,
    reloadQuietly,
    pay,
    retryPayment,
    pendingLineIds,
    lineError,
    setLineQty,
    removeLine,
    addingMealItemId,
    addMealItem,
  } = useCheckout({
    addressId: pickedAddressId,
    tip,
    deliveryInstructions: instructions,
    cookingRequests,
    extraCutlery,
    vegFleetOptIn: vegBag,
  });

  const displayAddress = useMemo<SavedAddress | null>(() => {
    // The summary's address is a snapshot taken when the page loaded; the context's copy is
    // refetched whenever an address is written. Prefer the live copy of whichever address
    // this order is going to — otherwise a customer who just dropped a pin comes back to
    // the same "we couldn't find this address on the map" notice they went to fix.
    const chosenId = activeLocation?.id ?? summary?.address?._id ?? null;
    const fresh =
      chosenId != null ? savedAddresses.find((a) => a._id === chosenId) ?? null : null;
    return fresh ?? summary?.address ?? null;
  }, [activeLocation?.id, savedAddresses, summary?.address]);

  const bill = summary?.bill ?? null;
  const hasItems = !!summary?.hasItems;
  // The server's total for this address + tip — tip included, never added here.
  const grandTotalPaise = bill?.charges ? bill.charges.grandTotalPaise : Math.round((bill?.grandTotal ?? 0) * 100);
  const busy = phase === 'placing' || phase === 'paying';
  const deliveryIssue = orderPlaced ? null : summary?.deliveryIssue ?? null;
  const awaitingPayment = phase === 'pending' && !!pendingPayment;
  const canPay = awaitingPayment
    ? pendingPayment!.canRetry && !busy
    : hasItems && !!displayAddress && !isLoading && !busy && !isRepricing && !deliveryIssue;
  const selectedMethod = getMethod(selectedMethodId);

  // Veg Mode hides non-veg dishes everywhere else in the app; "Complete your meal" must not
  // offer them one tap away from the cart.
  const { enabled: vegModeOn } = useVegMode();
  const mealSections = useMemo(() => {
    const sections = summary?.mealSections ?? [];
    if (!vegModeOn) return sections;
    return sections
      .map((sec) => ({ ...sec, items: sec.items.filter((i) => i.foodType === 'veg') }))
      .filter((sec) => sec.items.length > 0);
  }, [summary?.mealSections, vegModeOn]);

  // Re-read the cart and bill on coming back here — after "Add Items" on the restaurant page or
  // editing a line on the item screen. It loaded only once before, so the lines and total on
  // screen were stale and Pay then failed on the changed total.
  const focusedOnceRef = useRef(false);
  const reloadRef = useRef(reloadQuietly);
  reloadRef.current = reloadQuietly;
  useFocusEffect(
    useCallback(() => {
      if (focusedOnceRef.current) reloadRef.current();
      else focusedOnceRef.current = true;
    }, []),
  );

  // No leaving mid-placement or mid-payment (Android back, swipe): the screen unmounting there
  // stopped Razorpay from ever opening, leaving an unpaid order behind.
  const navigation = useNavigation();
  useEffect(() => {
    navigation.setOptions({ gestureEnabled: !busy });
    if (!busy) return;
    return navigation.addListener('beforeRemove', (e) => {
      e.preventDefault();
    });
  }, [navigation, busy]);

  // Leave for the confirmation screen the moment the order is placed (and paid,
  // for an online method).
  const doneOrderId = phase === 'done' ? placedOrderId : null;
  useEffect(() => {
    if (!doneOrderId) return;
    router.replace({
      pathname: '/checkout/success',
      params: {
        orderId: doneOrderId,
        cod: placedIsCod ? '1' : '0',
        total: String((placedTotalPaise ?? grandTotalPaise) / 100),
        method: selectedMethod?.label ?? 'Pay on delivery',
      },
    });
  }, [doneOrderId, placedIsCod, placedTotalPaise, grandTotalPaise, selectedMethod?.label]);

  const changeLineQty = (line: CartLine, next: number) =>
    // Down to 0 (the trash icon) removes the line — ask first; other steps are one tap.
    changeQtyWithConfirm(confirmAction, line.name, next, (q) =>
      q <= 0 ? removeLine(line.id) : setLineQty(line.id, q),
    );

  // Money moves only after an explicit confirm naming the amount and the method. The ref
  // keeps a second tap from stacking a second dialog while the first one is open.
  const confirmingPayRef = useRef(false);
  const confirmThenPay = async (run: () => Promise<unknown>) => {
    if (confirmingPayRef.current || busy) return;
    confirmingPayRef.current = true;
    try {
      const amount = formatPaise(placedTotalPaise ?? grandTotalPaise);
      const ok = await confirmAction(
        awaitingPayment
          ? confirmCopy.retryPayment(amount)
          : confirmCopy.payOrder({
              amount,
              methodLabel: selectedMethod?.label ?? 'your selected method',
              cod: selectedMethod?.wire === 'cod',
              restaurantName: summary?.restaurantName,
            }),
      );
      if (!ok) return;
    } finally {
      confirmingPayRef.current = false;
    }
    await run();
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
        contentContainerStyle={{
          padding: Spacing.base,
          paddingBottom: insets.bottom + (methodPickerOpen ? 360 : 190) + (awaitingPayment ? 110 : 0),
        }}
      >
        <AddressBlock address={displayAddress} locked={orderPlaced} />

        {!!deliveryIssue && (
          <Pressable
            style={styles.issueBanner}
            onPress={() => router.push('/address')}
            accessibilityRole="button"
          >
            <Ionicons name="warning-outline" size={16} color={Colors.warning} />
            <Text style={styles.issueBannerText}>
              {summary.deliveryIssueMessage ?? 'Delivery to this address isn’t available.'}
            </Text>
            <Text style={[styles.issueBannerAction, { color: accent }]}>Change</Text>
          </Pressable>
        )}

        {!orderPlaced && <InstructionsRow value={instructions} onChange={setInstructions} />}

        <View style={{ gap: Spacing.sm, marginTop: Spacing.md }}>
          {summary.lines.map((line) => (
            <LineCard
              key={line.id}
              line={line}
              busy={pendingLineIds.has(line.id)}
              locked={orderPlaced}
              onChangeQty={(qty) => changeLineQty(line, qty)}
            />
          ))}
        </View>

        {!!summary.restaurant && !orderPlaced && (
          <Pressable
            style={styles.addItemsLink}
            onPress={() => router.push(`/restaurant/${summary.restaurant!.id}`)}
            hitSlop={6}
          >
            <Ionicons name="add" size={16} color={accent} />
            <Text style={[styles.addItemsText, { color: accent }]}>Add Items</Text>
          </Pressable>
        )}

        <View style={styles.chipRow}>
          <Chip
            label="Cooking requests"
            icon="reader-outline"
            active={cookingRequests}
            onPress={() => setCookingRequests((v) => !v)}
          />
          <Chip
            label="Extra Cutlery Needed"
            icon="restaurant-outline"
            active={extraCutlery}
            onPress={() => setExtraCutlery((v) => !v)}
          />
        </View>

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

        {!orderPlaced && (
          <CompleteYourMeal
            sections={mealSections}
            addingMealItemId={addingMealItemId}
            onAdd={addMealItem}
          />
        )}

        {!!lineError && (
          <View style={styles.errorBanner}>
            <Ionicons name="alert-circle" size={16} color={Colors.authDanger} />
            <Text style={styles.errorBannerText}>{lineError}</Text>
          </View>
        )}

        <Text style={styles.sectionLabel}>Bill details</Text>
        <BillBlock
          bill={bill}
          tip={tip}
          tipPresets={summary.tipPresets}
          locked={orderPlaced}
          repricing={isRepricing}
          onPickTip={setTip}
        />

        <Pressable
          style={styles.cancellationRow}
          onPress={() => router.push('/settings/legal/terms')}
          hitSlop={6}
        >
          <View style={{ flex: 1 }}>
            <Text style={styles.cancellationTitle}>Cancellation Policy</Text>
            <Text style={styles.cancellationSub}>
              Please double-check your order and address details before paying.
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={Colors.foodTextMuted} />
        </Pressable>
      </ScrollView>
    );
  }

  return (
    <View style={styles.screen}>
      <StatusBar style="dark" />
      <View style={{ height: insets.top, backgroundColor: Colors.foodSurface }} />

      <View style={styles.header}>
        <Pressable onPress={goBack} hitSlop={8} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={Colors.foodText} />
        </Pressable>
        <Text style={styles.title}>Checkout</Text>
      </View>

      {body}

      {hasItems && bill && (
        <View style={[styles.footer, { paddingBottom: insets.bottom + Spacing.md }]}>
          {!displayAddress && (
            <Text style={styles.footerHint}>Add a delivery address to continue</Text>
          )}
          {awaitingPayment && (
            <View style={styles.pendingCard}>
              <Text style={styles.pendingTitle}>Payment pending — your order is saved</Text>
              <Text style={styles.pendingText}>{pendingPayment!.message}</Text>
            </View>
          )}
          {!!actionError && (
            <View style={[styles.errorBanner, { marginBottom: Spacing.sm }]}>
              <Ionicons name="alert-circle" size={16} color={Colors.authDanger} />
              <Text style={styles.errorBannerText}>{actionError}</Text>
            </View>
          )}

          <View style={styles.payUsingLabelRow}>
            <Ionicons name="receipt-outline" size={13} color={Colors.foodTextMuted} />
            <Text style={styles.payUsingLabel}>Pay Using</Text>
          </View>
          <Pressable
            style={styles.methodSummaryRow}
            onPress={() => setMethodPickerOpen((v) => !v)}
            hitSlop={4}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.methodSummaryTitle}>{selectedMethod?.label ?? 'Choose a payment method'}</Text>
              {!!selectedMethod?.hint && (
                <Text style={styles.methodSummarySub}>{selectedMethod.hint}</Text>
              )}
            </View>
            <Ionicons
              name={methodPickerOpen ? 'chevron-up' : 'chevron-down'}
              size={18}
              color={Colors.foodTextSecondary}
            />
          </Pressable>

          {methodPickerOpen && (
            <PaymentPicker
              selectedMethodId={selectedMethodId}
              showCod={codEnabled && !orderPlaced}
              onSelect={(id) => {
                selectMethod(id);
                setMethodPickerOpen(false);
              }}
            />
          )}

          <Pressable
            style={[styles.cta, !canPay && styles.ctaOff]}
            onPress={() => confirmThenPay(awaitingPayment ? retryPayment : pay)}
            disabled={!canPay}
            accessibilityRole="button"
            accessibilityLabel={
              awaitingPayment ? 'Retry payment' : `Pay ${formatPaise(placedTotalPaise ?? grandTotalPaise)}`
            }
          >
            {busy ? (
              <ActivityIndicator size="small" color={Colors.white} />
            ) : awaitingPayment ? (
              <Text style={styles.ctaText}>Retry payment</Text>
            ) : (
              <Text style={styles.ctaText}>Pay {formatPaise(placedTotalPaise ?? grandTotalPaise)}</Text>
            )}
          </Pressable>
          {awaitingPayment && (
            <Pressable
              style={styles.secondaryCta}
              onPress={() => router.replace(`/order/${pendingPayment!.orderId}/track`)}
              accessibilityRole="button"
            >
              <Text style={[styles.secondaryCtaText, { color: accent }]}>View order</Text>
            </Pressable>
          )}
        </View>
      )}

      {busy && (
        <View style={styles.overlay}>
          <View style={styles.overlayCard}>
            <ActivityIndicator size="large" color={accent} />
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
    backgroundColor: Colors.foodSurface,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.foodBorder,
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.sm,
    ...Elevation.card,
  },

  // Address
  addressGroup: { gap: Spacing.sm },
  addressCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: Colors.foodSurface,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.foodBorder,
    padding: Spacing.base,
    ...Elevation.card,
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
  addrTitle: { fontSize: 14.5, fontWeight: '800', color: Colors.foodText },
  addrLine: { fontSize: 13, color: Colors.foodTextSecondary, lineHeight: 18 },
  // A well inside the address block rather than a second card: it belongs to the address
  // above it, and it must not compete with it for the first look.
  addrUnlocated: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.foodBgSecondary,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.base,
  },
  addrUnlocatedText: { flex: 1, fontSize: 12.5, color: Colors.foodTextSecondary, lineHeight: 17 },
  addrUnlocatedAction: { fontSize: 13, fontWeight: '800' },

  // Delivery instructions
  instructionsLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: Spacing.md,
    paddingHorizontal: 2,
  },
  instructionsLinkText: { flex: 1, fontSize: 13.5, fontWeight: '600', color: Colors.foodTextSecondary },
  instructionsOpen: {
    backgroundColor: Colors.foodSurface,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.foodBorder,
    padding: Spacing.base,
    marginTop: Spacing.sm,
    ...Elevation.card,
  },
  instructionsInput: {
    fontSize: 13.5,
    color: Colors.foodText,
    minHeight: 44,
    textAlignVertical: 'top',
  },
  instructionsDone: { alignSelf: 'flex-end', paddingTop: Spacing.sm },
  instructionsDoneText: { fontSize: 13, fontWeight: '800' },

  // Cart line card
  lineCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.md,
    backgroundColor: Colors.foodSurface,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.foodBorder,
    padding: Spacing.md,
    ...Elevation.card,
  },
  lineImageWrap: { width: 56, height: 56, borderRadius: BorderRadius.md, overflow: 'hidden' },
  lineImage: { width: 56, height: 56, borderRadius: BorderRadius.md },
  lineImageDiet: { position: 'absolute', top: -3, left: -3 },
  lineMain: { flex: 1, gap: 3, paddingTop: 1 },
  lineName: { fontSize: 14.5, fontWeight: '700', color: Colors.foodText, lineHeight: 19 },
  lineOptions: { fontSize: 12, color: Colors.foodTextMuted },
  lineEditBtn: { flexDirection: 'row', alignItems: 'center', gap: 1, marginTop: 2 },
  lineEditText: { fontSize: 12.5, fontWeight: '800' },
  lineRight: { alignItems: 'flex-end', gap: Spacing.sm },
  linePrice: { fontSize: 13.5, fontWeight: '800', color: Colors.foodText },

  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: t.accentLight,
    borderRadius: BorderRadius.sm,
    paddingHorizontal: 2,
    height: 30,
    minWidth: 76,
    justifyContent: 'space-between',
  },
  stepBtn: { width: 26, height: 26, alignItems: 'center', justifyContent: 'center' },
  stepValue: { fontSize: 13, fontWeight: '800', color: Colors.foodText, minWidth: 16, textAlign: 'center' },

  // Add items link
  addItemsLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: Spacing.md,
  },
  addItemsText: { fontSize: 14, fontWeight: '800' },

  // Notes + chips
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: Spacing.md,
    paddingVertical: 8,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: Colors.foodBorderStrong,
    backgroundColor: Colors.foodSurface,
  },
  chipActive: { borderColor: t.accent, backgroundColor: t.accentLight },
  chipText: { fontSize: 12.5, fontWeight: '700', color: Colors.foodTextSecondary },
  chipTextActive: { color: t.accentDark },

  // Veg-only bag
  vegRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    marginTop: Spacing.sm,
    padding: Spacing.base,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.foodBorder,
    backgroundColor: Colors.foodSurface,
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
    borderColor: Colors.foodBorderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxOn: { borderColor: Colors.foodVegGreen, backgroundColor: Colors.foodVegGreen },

  // Complete your meal
  tabRow: { gap: Spacing.sm, paddingBottom: Spacing.sm, paddingRight: Spacing.base },
  tabPill: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 8,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: Colors.foodBorderStrong,
    backgroundColor: Colors.foodSurface,
  },
  tabPillText: { fontSize: 12.5, fontWeight: '700', color: Colors.foodTextSecondary },
  tabPillTextActive: { color: Colors.white },
  mealGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  mealCard: {
    width: '48.5%',
    backgroundColor: Colors.foodSurface,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.foodBorder,
    padding: Spacing.sm,
    gap: 4,
    ...Elevation.card,
  },
  mealImageWrap: { borderRadius: BorderRadius.md, overflow: 'hidden' },
  mealImage: { width: '100%', height: 96, borderRadius: BorderRadius.md },
  mealBadges: { position: 'absolute', top: 6, left: 6, gap: 4 },
  mealBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: BorderRadius.sm,
  },
  mealBadgeVeg: { backgroundColor: Colors.foodPureVegBg },
  mealBadgeVegText: { fontSize: 9.5, fontWeight: '800', color: Colors.foodVegGreenDark },
  mealBadgeBest: { backgroundColor: t.accentLight },
  mealBadgeBestText: { fontSize: 9.5, fontWeight: '800', color: t.accentDark },
  mealName: { fontSize: 13, fontWeight: '700', color: Colors.foodText, marginTop: 2 },
  mealDesc: { fontSize: 11, color: Colors.foodTextMuted, lineHeight: 14, minHeight: 28 },
  mealFooter: { marginTop: 2, gap: 6 },
  mealPriceRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  mealPrice: { fontSize: 13.5, fontWeight: '800', color: Colors.foodText },
  mealPriceStrike: {
    fontSize: 11,
    color: Colors.foodTextMuted,
    textDecorationLine: 'line-through',
  },
  mealAddBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    alignSelf: 'stretch',
    paddingVertical: 7,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: t.accent,
  },
  mealAddText: { fontSize: 12.5, fontWeight: '800' },

  // Error banner
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FDECEC',
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginTop: Spacing.md,
  },
  errorBannerText: { flex: 1, fontSize: 13, fontWeight: '600', color: Colors.authDanger },

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
  billSublabel: { fontSize: 11.5, color: Colors.foodTextMuted, marginTop: 1 },
  billStale: { opacity: 0.6 },
  issueBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: '#FFF4E5',
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginTop: Spacing.md,
  },
  issueBannerText: { flex: 1, fontSize: 13, fontWeight: '600', color: Colors.foodText },
  issueBannerAction: { fontSize: 13, fontWeight: '800' },
  pendingCard: {
    backgroundColor: '#FFF8E6',
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    gap: 4,
  },
  pendingTitle: { fontSize: 14, fontWeight: '800', color: Colors.foodText },
  pendingText: { fontSize: 12.5, color: Colors.foodTextSecondary, lineHeight: 17 },
  secondaryCta: {
    alignItems: 'center',
    justifyContent: 'center',
    height: 44,
    marginTop: Spacing.xs,
  },
  secondaryCtaText: { fontSize: 14, fontWeight: '800' },
  addTipLink: { fontSize: 13.5, fontWeight: '800' },
  tipRow: { flexDirection: 'row', gap: Spacing.sm, paddingVertical: Spacing.sm },
  tipBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.foodBorderStrong,
    backgroundColor: Colors.foodBg,
  },
  tipBtnActive: { borderColor: t.accent, backgroundColor: t.accentLight },
  tipBtnText: { fontSize: 13, fontWeight: '800', color: Colors.foodTextSecondary },
  tipBtnTextActive: { color: t.accentDark },

  // Cancellation
  cancellationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.lg,
    paddingVertical: Spacing.sm,
  },
  cancellationTitle: { fontSize: 12.5, fontWeight: '800', color: Colors.foodTextSecondary },
  cancellationSub: { fontSize: 11.5, color: Colors.foodTextMuted, lineHeight: 15, marginTop: 1 },

  // Diet mark
  dietSquare: {
    width: 14,
    height: 14,
    borderRadius: 3,
    borderWidth: 1.5,
    backgroundColor: Colors.foodSurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dietDot: { width: 6, height: 6, borderRadius: 3 },

  // Footer / payment
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
    ...Elevation.sticky,
  },
  footerHint: {
    fontSize: 12,
    color: t.accentDark,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: Spacing.sm,
  },
  payUsingLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  payUsingLabel: {
    fontSize: 10.5,
    fontWeight: '800',
    letterSpacing: 0.6,
    color: Colors.foodTextMuted,
    textTransform: 'uppercase',
  },
  methodSummaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
  },
  methodSummaryTitle: { fontSize: 15, fontWeight: '800', color: Colors.foodText },
  methodSummarySub: { fontSize: 12, color: Colors.foodTextMuted, marginTop: 1 },

  pickerScroll: {
    maxHeight: 260,
    marginBottom: Spacing.sm,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.foodBorder,
  },
  pickerGroup: { backgroundColor: Colors.foodSurface },
  pickerGroupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    backgroundColor: Colors.foodBg,
  },
  pickerGroupTitle: { fontSize: 13, fontWeight: '800', color: Colors.foodText },
  methodDivider: { height: 1, backgroundColor: Colors.foodBorder },
  methodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  methodBadge: {
    width: 32,
    height: 32,
    borderRadius: BorderRadius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  methodText: { flex: 1 },
  methodLabel: { fontSize: 13.5, fontWeight: '700', color: Colors.foodText },
  methodHint: { fontSize: 11.5, color: Colors.foodTextMuted, marginTop: 1 },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: Colors.foodBorderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOn: { borderColor: t.accent },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: t.accent },

  cta: {
    alignItems: 'center',
    justifyContent: 'center',
    height: 52,
    borderRadius: BorderRadius.full,
    backgroundColor: t.accent,
    marginTop: Spacing.xs,
  },
  ctaOff: { opacity: 0.5 },
  ctaText: { fontSize: 16, fontWeight: '800', color: Colors.white, letterSpacing: 0.2 },

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
    backgroundColor: t.accent,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.full,
  },
  centerBtnText: { fontSize: 14, fontWeight: '800', color: Colors.white },

  // Skeleton
  skelWrap: { padding: Spacing.base, gap: Spacing.md },
  skel: { backgroundColor: Colors.foodSkeleton, borderRadius: BorderRadius.lg },
  });

const styles = makeStyles(ORANGE_ACCENT);
