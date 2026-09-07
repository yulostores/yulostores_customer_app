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

interface RawBill {
  itemTotal?: number;
  deliveryFee?: number;
  platformFee?: number;
  tax?: number;
  discountAmount?: number;
  grandTotal?: number;
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
  options: CartLineOption[];
}

export interface CartRestaurant {
  id: string;
  name: string;
  image: string | null;
  isPureVeg: boolean;
}

/** Every money field the "Bill details" block shows, all computed server-side. */
export interface CartBill {
  itemTotal: number;
  deliveryFee: number;
  platformFee: number;
  tax: number;
  discountAmount: number;
  grandTotal: number;
}

export interface Cart {
  restaurantId: string | null;
  restaurant: CartRestaurant | null;
  lines: CartLine[];
  /** Total units across every line — the badge / "N items" count. */
  itemCount: number;
  /** True only when the cart has at least one line and every line is `foodType: 'veg'`. */
  isAllVeg: boolean;
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
    options,
  };
}

function toBill(raw: RawBill): CartBill {
  return {
    itemTotal: num(raw.itemTotal),
    deliveryFee: num(raw.deliveryFee),
    platformFee: num(raw.platformFee),
    tax: num(raw.tax),
    discountAmount: num(raw.discountAmount),
    grandTotal: num(raw.grandTotal),
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
