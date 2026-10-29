/**
 * checkout.ts — turning the server cart into a placed order.
 *
 * Two calls, both customer-token-only (see src/services/cart.ts for the 401
 * story):
 *
 *   GET  /api/checkout/summary?addressId=<picked>&tip=<rupees>
 *     → { address, cart, bill, deliveryIssue, deliveryIssueMessage, mealSections,
 *         tipPresets, vegFleetEligible }
 *     Priced against `addressId` (the account default when omitted) with `tip`
 *     included — so `bill.charges` (lines + grand total, paise) is exactly what the
 *     order will cost: render it, never add the tip or anything else on the client.
 *     `deliveryIssue` → placement would be refused for this address; say so before
 *     payment (`deliveryIssueMessage` is the server's own words).
 *     The address is the one priced (picked, or the default / first);
 *     `cart` + `bill` are the exact same shapes the cart screen renders (reused
 *     via cart.ts's `reshapeCartSnapshot`), so the checkout page shows the same
 *     lines and the same server-computed money, never its own arithmetic.
 *     `mealSections` backs "Complete your meal" — a "Popular" bucket plus the
 *     restaurant's own real menu categories, already excluding what's in cart.
 *
 *   POST /api/orders/checkout   (Idempotency-Key header)
 *     { addressId?, deliveryInstructions?, cookingRequests?, cookingInstructions?,
 *       extraCutlery?,
 *       tip?, vegFleetOptIn?, paymentMethod, expectedTotalPaise? }
 *     → 201 { orderId, restaurantName, status, vegFleetOptIn, order,
 *             razorpayOrder?, paymentSimulated?, paymentError? }
 *     → 200 { order: { orderId } } — the same Idempotency-Key was already placed
 *     `expectedTotalPaise` is the summary's `charges.grandTotal`: if the order would
 *     now cost anything else the server answers 409 PRICE_CHANGED (`details.charges`)
 *     and creates nothing.
 *     `paymentMethod` is only ever `'cod'` or `'online'` on the wire — the rich
 *     UPI / card / net-banking choice on the checkout screen is a client-side
 *     label that all collapses to `'online'` here (and becomes a Razorpay
 *     method-hint once a real gateway is wired — see src/services/payments.ts).
 *
 *     `razorpayOrder` is present ONLY when the backend has a gateway key
 *     configured; without one it is absent and the caller falls back to the
 *     simulate endpoint. That signal routes the *backend* between its real and
 *     simulated payment paths — the client side still needs its Razorpay SDK
 *     step finished (see the header of src/services/payments.ts) before an
 *     online payment can actually be collected in a shipped build.
 *
 * Known error codes from POST /api/orders/checkout (callers branch on `.code`):
 *   400 VALIDATION_ERROR        — empty cart, or no delivery address on file.
 *   400 ORDER_ITEM_UNAVAILABLE  — a cart item went off-menu since it was added.
 *   400 COD_UNAVAILABLE         — cash on delivery is switched off.
 *   400 ADDRESS_NOT_LOCATED / OUT_OF_DELIVERY_RANGE / RESTAURANT_NOT_LOCATED
 *   400 TIP_TOO_HIGH            — tip above the ₹500 cap.
 *   404 ADDRESS_NOT_FOUND       — the picked address isn't on the account any more.
 *   409 CART_PRICE_CHANGED      — a cart item's price moved; review the cart.
 *   409 PRICE_CHANGED           — the total differs from `expectedTotalPaise`.
 *   503 PAYMENT_GATEWAY_UNAVAILABLE — online payment is down; nothing was created.
 * The server's `details` payload (`{ items }`) rides along on `ApiError.details`.
 */

import type { SavedAddress } from '../types/address';
import type { GatewayOrder } from './payments';
import { apiGet, apiPost, type SendOptions } from './api';
import {
  reshapeCartSnapshot,
  type CartBill,
  type CartLine,
  type CartRestaurant,
} from './cart';

// ─── Wire shapes (only the fields the app reads) ─────────────────────────────

interface RawMealItem {
  _id: string;
  name: string;
  description?: string | null;
  image?: string | null;
  foodType?: 'veg' | 'non_veg' | 'egg' | null;
  sellingPrice?: number;
  discountedPrice?: number | null;
  effectivePrice?: number;
  badges?: string[];
  optionGroupCount?: number;
}

interface RawMealSection {
  id: string;
  name: string;
  items: RawMealItem[];
}

interface RawSummary {
  address?: SavedAddress | null;
  deliveryIssue?: string | null;
  deliveryIssueMessage?: string | null;
  /** The backend's `plainCart` — `{ items, restaurant, restaurantId, ... }`,
   *  the same shape `/api/cart` nests under `cart`. Passed straight to the cart
   *  reshaper. */
  cart?: unknown;
  bill?: unknown;
  /** "Complete your meal" tabs — a synthetic "Popular" bucket plus the restaurant's
   *  own real menu categories, each already excluding what's in the cart. */
  mealSections?: RawMealSection[];
  vegFleetEligible?: boolean;
  /** Suggested delivery-tip amounts, in rupees — server config, not a client list. */
  tipPresets?: number[];
}

interface RawOrder {
  _id: string;
  status?: string;
  paymentMethod?: 'cash' | 'upi' | 'card' | 'online' | null;
  paymentStatus?: string;
  grandTotal?: number | null;
  subtotal?: number;
}

interface RawCheckoutResponse {
  /** Absent on the 200 "duplicate" answer, which only carries `order.orderId`. */
  orderId?: string;
  restaurantName?: string | null;
  status?: string;
  order: RawOrder & { orderId?: string };
  /** The Razorpay order id — mirror of `razorpayOrder.id`, or `null`. */
  clientSecret?: string | null;
  razorpayOrder?: GatewayOrder | null;
  /** Dev/local backend with payment simulation on — no Razorpay order is made. */
  paymentSimulated?: boolean;
  /** The order exists but its Razorpay order couldn't be created — use …/payment/retry. */
  paymentError?: string | null;
}

// ─── View types ─────────────────────────────────────────────────────────────

/** One "Complete your meal" pick — tap opens the dish, "+" adds it straight to cart. */
export interface MealItem {
  id: string;
  name: string;
  description: string | null;
  image: string | null;
  foodType: 'veg' | 'non_veg' | 'egg' | null;
  /** The price the cart will actually charge (matches the item screen). */
  price: number;
  /** MRP, when higher than `price` — draw a strike-through against it. */
  mrpPrice: number | null;
  badges: string[];
  /** `> 0` → "+" opens the customization screen instead of adding straight to cart. */
  optionGroupCount: number;
}

/** One "Complete your meal" tab — "Popular" (bestsellers first) plus the
 *  restaurant's own real menu categories, e.g. "Beverages", "Desserts". */
export interface MealSection {
  id: string;
  name: string;
  items: MealItem[];
}

export interface CheckoutSummary {
  /** The delivery address the order will go to, or `null` if none is saved. */
  address: SavedAddress | null;
  /** The cart's storefront — name / image / pure-veg flag. */
  restaurant: CartRestaurant | null;
  /** Convenience mirror of `restaurant?.name` (kept for existing callers). */
  restaurantName: string | null;
  /** Every cart line, with its picked options — same shape as the cart screen. */
  lines: CartLine[];
  /** Total units across every cart line. */
  itemCount: number;
  /** Server-computed bill for the summary's address and tip — `bill.charges` is what
   *  the order will cost, tip included. */
  bill: CartBill;
  /** The cart's restaurant id (for its personal offer). */
  restaurantId: string | null;
  /** The promo code or personal offer on the cart. */
  appliedDiscountId: string | null;
  /** Placement would be refused for this address — show {@link deliveryIssueMessage}. */
  deliveryIssue: string | null;
  deliveryIssueMessage: string | null;
  /** "Complete your meal" tabs, already scoped to the cart's restaurant. */
  mealSections: MealSection[];
  /** Suggested delivery-tip amounts, in rupees — server config. */
  tipPresets: number[];
  /** Only then may the "veg-only delivery" toggle be shown / sent as true. */
  vegFleetEligible: boolean;
  hasItems: boolean;
}

export interface PlaceOrderInput {
  /** Omit to let the backend use the account's default address. */
  addressId?: string;
  /** `'cod'` → pay on delivery; `'online'` → everything else. */
  paymentMethod: 'cod' | 'online';
  /** Free-text note for the delivery partner. */
  deliveryInstructions?: string;
  /** Restaurant-fulfilment toggles (flow to the kitchen, not the rider). */
  cookingRequests?: boolean;
  /** What the cooking request is ("less spicy, no onion"); implies `cookingRequests`. */
  cookingInstructions?: string;
  extraCutlery?: boolean;
  /** Rupees added to the order total (already in the summary that was shown). */
  tip?: number;
  /** The summary's `charges.grandTotal` (paise) — 409 PRICE_CHANGED if it moved. */
  expectedTotalPaise?: number;
  /** Honoured only when the restaurant actually has veg-fleet coverage. */
  vegFleetOptIn?: boolean;
  /**
   * A per-attempt UUID sent as `Idempotency-Key` so a double-tap or a retry
   * after a dropped response can't place a second order.
   */
  idempotencyKey: string;
}

export interface PlacedOrder {
  orderId: string;
  restaurantName: string | null;
  status: string;
  /** As stored on the order — `'cash'` for COD, `'online'` otherwise. */
  paymentMethod: string | null;
  /** `'pending_cod'` for COD, `'pending'` for an unpaid online order. */
  paymentStatus: string;
  grandTotal: number;
  /**
   * The Razorpay order to hand to Checkout, or `null` (simulation on, a duplicate
   * tap, or the gateway call failed — see {@link needsPaymentRetry}).
   */
  gatewayOrder: GatewayOrder | null;
  /** This Idempotency-Key had already placed the order — this is that order. */
  duplicate: boolean;
  /** Online, but no Razorpay order came back (duplicate tap or a gateway error):
   *  get one from POST …/payment/retry before paying. */
  needsPaymentRetry: boolean;
}

// ─── Reshape ────────────────────────────────────────────────────────────────

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

function toMealItem(raw: RawMealItem): MealItem {
  const price = num(raw.effectivePrice ?? raw.discountedPrice ?? raw.sellingPrice);
  const mrp = raw.sellingPrice != null ? num(raw.sellingPrice) : null;
  return {
    id: String(raw._id),
    name: raw.name,
    description: raw.description ?? null,
    image: raw.image ?? null,
    foodType: raw.foodType ?? null,
    price,
    mrpPrice: mrp != null && mrp > price ? mrp : null,
    badges: raw.badges ?? [],
    optionGroupCount: raw.optionGroupCount ?? 0,
  };
}

function toMealSection(raw: RawMealSection): MealSection {
  return { id: String(raw.id), name: raw.name, items: (raw.items ?? []).map(toMealItem) };
}

function toSummary(raw: RawSummary): CheckoutSummary {
  // The backend nests the cart under `summary.cart` with the same
  // `{ items, restaurant, ... }` shape `/api/cart` returns — hand it straight to
  // the cart reshaper so lines / options / restaurant come out identical.
  const { cart, bill } = reshapeCartSnapshot({ cart: raw.cart, bill: raw.bill });
  return {
    address: raw.address ?? null,
    restaurant: cart.restaurant,
    restaurantName: cart.restaurant?.name ?? null,
    lines: cart.lines,
    itemCount: cart.itemCount,
    bill,
    restaurantId: cart.restaurantId,
    appliedDiscountId: cart.appliedDiscountId,
    mealSections: (raw.mealSections ?? []).map(toMealSection),
    tipPresets: (raw.tipPresets ?? []).filter((n) => typeof n === 'number' && n > 0),
    vegFleetEligible: Boolean(raw.vegFleetEligible),
    hasItems: cart.lines.length > 0,
    deliveryIssue: raw.deliveryIssue ?? bill.deliveryIssue ?? null,
    deliveryIssueMessage: raw.deliveryIssueMessage ?? null,
  };
}

// ─── API ────────────────────────────────────────────────────────────────────

export interface SummaryQuery {
  /** Saved address to price against; omitted → the account default. */
  addressId?: string;
  /** Rupees; included in the total (and its round-off). */
  tip?: number;
}

/** The address, the cart's storefront + lines, and the server bill for that address + tip. */
export function getCheckoutSummary(query: SummaryQuery = {}): Promise<CheckoutSummary> {
  return apiGet<RawSummary>('/api/checkout/summary', {
    addressId: query.addressId,
    tip: typeof query.tip === 'number' && query.tip > 0 ? query.tip : undefined,
  }).then(toSummary);
}

/**
 * Place the order for the current cart. Resolves with everything the payment
 * step needs; throws `ApiError` on any failure (callers branch on `.code` —
 * `CART_PRICE_CHANGED`, `ORDER_ITEM_UNAVAILABLE`, `VALIDATION_ERROR`, `401`).
 */
export function placeOrder(input: PlaceOrderInput): Promise<PlacedOrder> {
  const {
    idempotencyKey,
    paymentMethod,
    addressId,
    deliveryInstructions,
    cookingRequests,
    cookingInstructions,
    extraCutlery,
    tip,
    vegFleetOptIn,
    expectedTotalPaise,
  } = input;

  const opts: SendOptions = { headers: { 'Idempotency-Key': idempotencyKey } };
  const body = {
    ...(addressId ? { addressId } : {}),
    ...(deliveryInstructions?.trim() ? { deliveryInstructions: deliveryInstructions.trim() } : {}),
    ...(cookingRequests ? { cookingRequests: true } : {}),
    ...(cookingRequests && cookingInstructions?.trim()
      ? { cookingInstructions: cookingInstructions.trim() }
      : {}),
    ...(extraCutlery ? { extraCutlery: true } : {}),
    ...(typeof tip === 'number' && tip > 0 ? { tip } : {}),
    ...(vegFleetOptIn ? { vegFleetOptIn: true } : {}),
    ...(typeof expectedTotalPaise === 'number' ? { expectedTotalPaise } : {}),
    paymentMethod,
  };

  return apiPost<RawCheckoutResponse>('/api/orders/checkout', body, opts).then((res) => {
    const duplicate = !res.orderId && !!res.order?.orderId;
    const gatewayOrder = res.razorpayOrder ?? null;
    return {
      orderId: String(res.orderId ?? res.order?.orderId ?? res.order?._id),
      restaurantName: res.restaurantName ?? null,
      status: res.status ?? res.order?.status ?? 'placed',
      paymentMethod: res.order?.paymentMethod ?? (paymentMethod === 'cod' ? 'cash' : 'online'),
      paymentStatus: res.order?.paymentStatus ?? (paymentMethod === 'cod' ? 'pending_cod' : 'pending'),
      grandTotal: num(res.order?.grandTotal),
      gatewayOrder,
      duplicate,
      needsPaymentRetry:
        paymentMethod === 'online' && !gatewayOrder && (duplicate || !!res.paymentError) && !res.paymentSimulated,
    };
  });
}
