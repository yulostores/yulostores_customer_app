/**
 * cart.ts — the customer cart: one read, four mutations, all server-priced.
 *
 * Endpoints (see yulo_backend/server/routes/cart.routes.js):
 *   GET    /api/cart                      → { cart, bill }
 *   POST   /api/cart/items               { menuItemId, qty, selectedOptions } → { cart, bill }
 *   PATCH  /api/cart/items/:lineItemId   { qty }   (qty 0 removes the line)   → { cart, bill }
 *   DELETE /api/cart/items/:lineItemId                                        → { cart, bill }
 *   DELETE /api/cart                                                          → { cart, bill }
 *
 * The server re-prices and re-validates every selection against the item's
 * OptionGroup rules (`pricing.service.js`) and recomputes the whole bill
 * (`cart.service.js`) on each call — the client never adds up money itself, it
 * renders `bill` as received.
 *
 * `bill.charges` is the pricing engine's full breakdown (charges.service.js):
 * integer-paise `lines` in the order a bill reads — item total, discount, GST on
 * food, delivery fee, platform fee, tip, round off, "To pay" — which screens draw
 * as-is. `bill.deliveryIssue` says why the delivery fee can't be priced yet
 * (no map point on the address, out of range, …); while it is set the delivery
 * line has no amount and the legacy `deliveryFee` / `grandTotal` leave delivery
 * out — never show those as "FREE" or as the amount to pay.
 *
 * Every response carries the SAME `{ cart, bill }` shape, so a mutation's result
 * is a full fresh snapshot the caller can swap in without a follow-up GET.
 *
 * All of these need a real customer token; a bypass / signed-out session gets
 * 401 and the caller surfaces that as "sign in to see your cart".
 *
 * Known error codes:
 *   409 CART_RESTAURANT_CONFLICT — cart already holds items from another
 *       restaurant; `error` carries `{ currentRestaurantName }`.
 *   400 VALIDATION_ERROR         — selection breaks a group's min/max/qty rule.
 *   404 NOT_FOUND                — the line item id is not in the cart.
 */

import { apiDelete, apiGet, apiPatch, apiPost } from './api';

// ─── Wire shape (only the fields the app reads) ───────────────────────────

export type FoodType = 'veg' | 'non_veg' | 'egg';

interface RawResolvedOption {
  optionId: string;
  qty?: number;
  name?: string | null;
  priceDelta?: number;
}

interface RawCartLine {
  _id: string;
  menuItemId: string;
  name: string;
  unitPrice: number;
  qty: number;
  foodType?: FoodType | null;
  /** The dish's current photo — attached fresh from MenuItem on every read, not
   *  snapshotted (unlike name/unitPrice), so a restaurant's photo swap shows up here. */
  image?: string | null;
  selectedOptions?: { optionId: string; qty?: number }[];
  resolvedOptions?: RawResolvedOption[];
}

interface RawCartRestaurant {
  _id: string;
  name: string;
  image?: string | null;
  isPureVeg?: boolean;
}

interface RawCart {
  _id?: string;
  restaurantId?: string | null;
  appliedDiscountId?: string | null;
  items?: RawCartLine[];
  restaurant?: RawCartRestaurant | null;
}

interface RawChargeLine {
  key?: string;
  label?: string;
  /** `null` for a line whose amount isn't known yet (delivery while `pending`). */
  amountPaise?: number | null;
  sublabel?: string | null;
}

interface RawCharges {
  lines?: RawChargeLine[];
  grandTotal?: number;
  delivery?: { pending?: boolean; paidBy?: string | null } | null;
}

interface RawBill {
  itemTotal?: number;
  /** Pre-markdown total (sum of each line's mrpUnitPrice × qty) — equals `itemTotal`
   *  when nothing on the cart carries a per-item discount. */
  mrpTotal?: number;
  /** `mrpTotal - itemTotal` — already netted into `itemTotal`; shown as its own
   *  "Item discount" row for transparency, not subtracted again. */
  itemDiscountAmount?: number;
  deliveryFee?: number;
  platformFee?: number;
  tax?: number;
  discountAmount?: number;
  grandTotal?: number;
  charges?: RawCharges | null;
  deliveryIssue?: string | null;
  offerIssue?: string | null;
  shortfallPaise?: number | null;
  appliedCode?: string | null;
}

interface RawCartResponse {
  cart: RawCart;
  bill: RawBill;
}

// ─── View types ──────────────────────────────────────────────────────────

/** One customization picked on a line, resolved to its display name + rupee delta. */
export interface CartLineOption {
  optionId: string;
  qty: number;
  name: string | null;
  priceDelta: number;
}

export interface CartLine {
  /** Cart sub-document id — the handle for PATCH / DELETE on this line. */
  id: string;
  menuItemId: string;
  name: string;
  /** Per-unit price the server locked in at add-time, base + option deltas, in rupees. */
  unitPrice: number;
  qty: number;
  /** `null` only for a legacy line whose dish has since been deleted. */
  foodType: FoodType | null;
  /** The dish's current photo, or `null` if it has none / was deleted. */
  image: string | null;
  options: CartLineOption[];
  /** The customization exactly as the server stored it — re-adding with this lands on this same
   *  line (the server merges identical selections), which is how a stale price is refreshed. */
  selectedOptions: CartOptionSelection[];
}

export interface CartRestaurant {
  id: string;
  name: string;
  image: string | null;
  isPureVeg: boolean;
}

/** One row of the server's bill, in display order. Money in integer paise. */
export interface ChargeLine {
  /** `item_total` · `discount` · `food_gst` · `delivery_fee` · `service_charge` ·
   *  `platform_fee` · `tip` · `round_off` · `grand_total` */
  key: string;
  label: string;
  /** `null` → not known yet (the delivery fee while the address can't be priced). */
  amountPaise: number | null;
  /** e.g. "Free delivery", "3.2 km · incl. ₹4.58 GST", "incl. ₹1.83 GST". */
  sublabel: string | null;
}

/** The pricing engine's breakdown — what the bill block renders. */
export interface Charges {
  lines: ChargeLine[];
  /** The amount to pay, paise — the figure checkout must send back as `expectedTotalPaise`. */
  grandTotalPaise: number;
  /** The restaurant pays the delivery charge (free delivery for the customer). */
  freeDelivery: boolean;
}

/**
 * Why the delivery fee can't be priced (and the order can't be placed) for the
 * address on file — mirrors the backend's codes.
 */
export type DeliveryIssue = 'ADDRESS_NOT_LOCATED' | 'OUT_OF_DELIVERY_RANGE' | 'RESTAURANT_NOT_LOCATED' | string;

/** Customer-facing words for a {@link DeliveryIssue} — the backend's own copy
 *  (charges.service.js DELIVERY_ISSUE_MESSAGES); the checkout summary sends it, the
 *  cart doesn't, so the cart reads it from here. */
export const DELIVERY_ISSUE_MESSAGES: Record<string, string> = {
  ADDRESS_NOT_LOCATED: 'We could not place this address on the map — please pick the location on the map again',
  RESTAURANT_NOT_LOCATED: 'This restaurant cannot take delivery orders right now',
  OUT_OF_DELIVERY_RANGE: 'This restaurant does not deliver to this address',
};

export function deliveryIssueMessage(issue: DeliveryIssue | null): string | null {
  if (!issue) return null;
  return DELIVERY_ISSUE_MESSAGES[issue] ?? 'Delivery to this address isn’t available';
}

/** Every money field the "Bill details" block shows, all computed server-side. */
export interface CartBill {
  itemTotal: number;
  mrpTotal: number;
  itemDiscountAmount: number;
  deliveryFee: number;
  platformFee: number;
  tax: number;
  discountAmount: number;
  /** Rupees. While {@link deliveryIssue} is set this leaves delivery out. */
  grandTotal: number;
  /** The server's line-by-line breakdown; `null` for an empty cart (or an old backend). */
  charges: Charges | null;
  /** Set when delivery can't be priced for the address — see {@link DeliveryIssue}. */
  deliveryIssue: DeliveryIssue | null;
  /** An applied personal offer that stopped applying, and why (an offer error code). */
  offerIssue: string | null;
  /** With `offerIssue: 'DISCOUNT_MIN_VALUE'`: how much more the food must come to. */
  shortfallPaise: number | null;
  /** The coupon code on the cart (from the server, so it survives a restart); null for none. */
  appliedCode: string | null;
}

export interface Cart {
  restaurantId: string | null;
  restaurant: CartRestaurant | null;
  lines: CartLine[];
  /** Total units across every line — the badge / "N items" count. */
  itemCount: number;
  /** True only when the cart has at least one line and every line is `foodType: 'veg'`. */
  isAllVeg: boolean;
  /** The promo code or personal offer on the cart (re-validated server-side on every read). */
  appliedDiscountId: string | null;
}

export interface CartSnapshot {
  cart: Cart;
  bill: CartBill;
}

// ─── Reshape ─────────────────────────────────────────────────────────────

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

function toLine(raw: RawCartLine): CartLine {
  const options: CartLineOption[] = (raw.resolvedOptions ?? []).map((o) => ({
    optionId: o.optionId,
    qty: Math.max(1, num(o.qty) || 1),
    name: o.name ?? null,
    priceDelta: num(o.priceDelta),
  }));
  return {
    id: raw._id,
    menuItemId: String(raw.menuItemId),
    name: raw.name,
    unitPrice: num(raw.unitPrice),
    qty: Math.max(1, num(raw.qty) || 1),
    foodType: raw.foodType ?? null,
    image: raw.image ?? null,
    options,
    selectedOptions: (raw.selectedOptions ?? []).map((o) =>
      o.qty != null ? { optionId: String(o.optionId), qty: o.qty } : { optionId: String(o.optionId) },
    ),
  };
}

function toCharges(raw: RawCharges | null | undefined): Charges | null {
  if (!raw || !Array.isArray(raw.lines)) return null;
  const lines: ChargeLine[] = raw.lines
    .filter((l): l is RawChargeLine & { key: string } => !!l && typeof l.key === 'string')
    .map((l) => ({
      key: l.key,
      label: l.label ?? l.key,
      amountPaise: typeof l.amountPaise === 'number' && Number.isFinite(l.amountPaise) ? l.amountPaise : null,
      sublabel: l.sublabel ?? null,
    }));
  return {
    lines,
    grandTotalPaise: num(raw.grandTotal),
    freeDelivery: raw.delivery?.paidBy === 'restaurant' && !raw.delivery?.pending,
  };
}

function toBill(raw: RawBill): CartBill {
  const itemTotal = num(raw.itemTotal);
  return {
    itemTotal,
    mrpTotal: raw.mrpTotal != null ? num(raw.mrpTotal) : itemTotal,
    itemDiscountAmount: num(raw.itemDiscountAmount),
    deliveryFee: num(raw.deliveryFee),
    platformFee: num(raw.platformFee),
    tax: num(raw.tax),
    discountAmount: num(raw.discountAmount),
    grandTotal: num(raw.grandTotal),
    charges: toCharges(raw.charges),
    deliveryIssue: raw.deliveryIssue ?? null,
    offerIssue: raw.offerIssue ?? null,
    shortfallPaise: typeof raw.shortfallPaise === 'number' ? raw.shortfallPaise : null,
    appliedCode: typeof raw.appliedCode === 'string' && raw.appliedCode ? raw.appliedCode.toUpperCase() : null,
  };
}

function toSnapshot(raw: RawCartResponse): CartSnapshot {
  const lines = (raw.cart?.items ?? []).map(toLine);
  const restaurant: CartRestaurant | null = raw.cart?.restaurant
    ? {
        id: raw.cart.restaurant._id,
        name: raw.cart.restaurant.name,
        image: raw.cart.restaurant.image ?? null,
        isPureVeg: Boolean(raw.cart.restaurant.isPureVeg),
      }
    : null;

  return {
    cart: {
      restaurantId: raw.cart?.restaurantId ? String(raw.cart.restaurantId) : null,
      restaurant,
      lines,
      itemCount: lines.reduce((n, l) => n + l.qty, 0),
      isAllVeg: lines.length > 0 && lines.every((l) => l.foodType === 'veg'),
      appliedDiscountId: raw.cart?.appliedDiscountId ? String(raw.cart.appliedDiscountId) : null,
    },
    bill: toBill(raw.bill ?? {}),
  };
}

/**
 * Reshape a raw `{ cart, bill }` payload into the view {@link CartSnapshot}.
 * Exported so the checkout summary (`GET /api/checkout/summary`), which embeds
 * the exact same `cart` + `bill` shape, renders its lines and bill the one way.
 */
export function reshapeCartSnapshot(raw: { cart?: unknown; bill?: unknown }): CartSnapshot {
  return toSnapshot(raw as RawCartResponse);
}

/** The device-local `CartContext.syncFromServer` argument shape. */
export interface CartCachePayload {
  restaurantId: string;
  restaurantName: string;
  restaurantImage?: string;
  lines: { itemId: string; name: string; price: number; qty: number }[];
}

/**
 * Collapse a server {@link CartSnapshot} into the badge-cache payload the
 * device-local `CartContext` mirrors (keyed by dish id — it sums the server's
 * per-customization lines). `null` for an empty cart. Shared by every screen
 * that mutates the cart so the tab badge / Home CartBar stay in step.
 */
export function toCartCachePayload(snapshot: CartSnapshot): CartCachePayload | null {
  const { cart } = snapshot;
  if (!cart.restaurant || cart.lines.length === 0) return null;
  return {
    restaurantId: cart.restaurant.id,
    restaurantName: cart.restaurant.name,
    restaurantImage: cart.restaurant.image ?? undefined,
    lines: cart.lines.map((l) => ({
      itemId: l.menuItemId,
      name: l.name,
      price: l.unitPrice,
      qty: l.qty,
    })),
  };
}

// ─── API ─────────────────────────────────────────────────────────────────

export interface CartOptionSelection {
  optionId: string;
  /** Only meaningful for `addons` options; omitted for single-choice. */
  qty?: number;
}

export interface AddToCartInput {
  menuItemId: string;
  qty: number;
  selectedOptions: CartOptionSelection[];
}

/** The open cart plus its freshly computed bill. An empty cart comes back with
 *  `lines: []`, `restaurant: null` and an all-zero bill. */
export function getCart(): Promise<CartSnapshot> {
  return apiGet<RawCartResponse>('/api/cart').then(toSnapshot);
}

/**
 * Add one customized line. Resolves with the updated snapshot; throws `ApiError`
 * on any failure — callers branch on `.code` / `.status`
 * (`409 CART_RESTAURANT_CONFLICT`, `400 VALIDATION_ERROR`, `401`).
 */
export function addItemToCart(input: AddToCartInput): Promise<CartSnapshot> {
  return apiPost<RawCartResponse>('/api/cart/items', input).then(toSnapshot);
}

/** Set an absolute quantity for one line. `qty <= 0` removes it. */
export function updateCartLine(lineItemId: string, qty: number): Promise<CartSnapshot> {
  return apiPatch<RawCartResponse>(`/api/cart/items/${lineItemId}`, {
    qty: Math.max(0, Math.trunc(qty)),
  }).then(toSnapshot);
}

/** Remove one line outright. */
export function removeCartLine(lineItemId: string): Promise<CartSnapshot> {
  return apiDelete<RawCartResponse>(`/api/cart/items/${lineItemId}`).then(toSnapshot);
}

/** Empty the whole cart. */
export function clearCart(): Promise<CartSnapshot> {
  return apiDelete<RawCartResponse>('/api/cart').then(toSnapshot);
}

/**
 * Apply a coupon code to the open cart (`POST /api/cart/apply-promo`). The server
 * looks the code up against the cart's restaurant, validates it (min order value,
 * expiry, …) and returns a fresh `{ cart, bill }` with `bill.discountAmount`
 * filled in — the caller swaps that in like any other mutation.
 *
 * An invalid / ineligible code comes back as `ApiError` 400 with a human message
 * from `discountService.validateDiscountForOrder`; the caller surfaces it inline.
 *
 * The backend keeps `appliedDiscountId` on the cart and re-validates it on every read, so a
 * code simply stops applying if the cart later stops qualifying, and resumes if it qualifies
 * again. {@link removePromo} takes it off outright.
 */
export function applyPromo(code: string): Promise<CartSnapshot> {
  return apiPost<RawCartResponse>('/api/cart/apply-promo', { code: code.trim() }).then(toSnapshot);
}

/** `DELETE /api/cart/promo` — takes an applied coupon code off the cart (never a personal offer). */
export function removePromo(): Promise<CartSnapshot> {
  return apiDelete<RawCartResponse>('/api/cart/promo').then(toSnapshot);
}
