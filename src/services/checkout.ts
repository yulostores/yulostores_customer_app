/**
 * checkout.ts — turning the server cart into a placed order.
 *
 * Two calls, both customer-token-only (see src/services/cart.ts for the 401
 * story):
 *
 *   GET  /api/checkout/summary
 *     → { address, cart, bill, upsellItems, vegFleetEligible }
 *     The address is the account's default saved address (or the first one);
 *     `cart` + `bill` are the exact same shapes the cart screen renders (reused
 *     via cart.ts's `reshapeCartSnapshot`), so the checkout page shows the same
 *     lines and the same server-computed money, never its own arithmetic.
 *
 *   POST /api/orders/checkout
 *     { addressId?, deliveryInstructions?, cookingRequests?, extraCutlery?,
 *       tip?, vegFleetOptIn?, paymentMethod }
 *     → { orderId, restaurantName, status, order, clientSecret?, razorpayOrder? }
 *     `paymentMethod` is only ever `'cod'` or `'online'` on the wire — the rich
 *     UPI / card / net-banking choice on the Payment screen is a client-side
 *     label that all collapses to `'online'` here (and becomes a Razorpay
 *     method-hint once a real gateway is wired — see src/services/payments.ts).
 *
 *     `razorpayOrder` is present ONLY when the backend has a gateway key
 *     configured; without one it is absent and the caller falls back to the
 *     simulate endpoint. That single signal is what routes between the real and
 *     simulated payment gateways — nothing else needs to change to go live.
 *
 * Known error codes from POST /api/orders/checkout (callers branch on `.code`):
 *   400 VALIDATION_ERROR        — empty cart, or no delivery address on file.
 *   400 ORDER_ITEM_UNAVAILABLE  — a cart item went off-menu since it was added.
 *   409 CART_PRICE_CHANGED      — a cart item's price moved; review the cart.
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

interface RawUpsellItem {
  _id: string;
  name: string;
  image?: string | null;
  foodType?: 'veg' | 'non_veg' | 'egg' | null;
  sellingPrice?: number;
  discountedPrice?: number | null;
  effectivePrice?: number;
}

interface RawSummary {
  address?: SavedAddress | null;
  /** The backend's `plainCart` — `{ items, restaurant, restaurantId, ... }`,
   *  the same shape `/api/cart` nests under `cart`. Passed straight to the cart
   *  reshaper. */
  cart?: unknown;
  bill?: unknown;
  upsellItems?: RawUpsellItem[];
  vegFleetEligible?: boolean;
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
  orderId: string;
  restaurantName?: string | null;
  status?: string;
  order: RawOrder;
  /** The Razorpay order id — mirror of `razorpayOrder.id`, or `null`. */
  clientSecret?: string | null;
  razorpayOrder?: GatewayOrder | null;
}

// ─── View types ─────────────────────────────────────────────────────────────

/** One "you might also like" pick on the checkout page — tap opens the dish. */
export interface UpsellItem {
  id: string;
  name: string;
  image: string | null;
  foodType: 'veg' | 'non_veg' | 'egg' | null;
  /** The price the cart will actually charge (matches the item screen). */
  price: number;
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
  /** Server-computed bill. The customer-chosen `tip` is added on top for display
   *  and sent to the server at placement; it is not part of this figure. */
  bill: CartBill;
  /** Bestseller / recent dishes from the same restaurant, minus what's in cart. */
  upsellItems: UpsellItem[];
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
  extraCutlery?: boolean;
  /** Rupees added to the order total. */
  tip?: number;
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
   * The real gateway order to hand to Razorpay Checkout, or `null` when no
   * gateway is configured (→ the simulated gateway takes over).
   */
  gatewayOrder: GatewayOrder | null;
}

// ─── Reshape ────────────────────────────────────────────────────────────────

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

function toUpsellItem(raw: RawUpsellItem): UpsellItem {
  return {
    id: String(raw._id),
    name: raw.name,
    image: raw.image ?? null,
    foodType: raw.foodType ?? null,
    price: num(raw.effectivePrice ?? raw.discountedPrice ?? raw.sellingPrice),
  };
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
    upsellItems: (raw.upsellItems ?? []).map(toUpsellItem),
    vegFleetEligible: Boolean(raw.vegFleetEligible),
    hasItems: cart.lines.length > 0,
  };
}

// ─── API ────────────────────────────────────────────────────────────────────

/** The default address, the cart's storefront + lines, and the server bill. */
export function getCheckoutSummary(): Promise<CheckoutSummary> {
  return apiGet<RawSummary>('/api/checkout/summary').then(toSummary);
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
    extraCutlery,
    tip,
    vegFleetOptIn,
  } = input;

  const opts: SendOptions = { headers: { 'Idempotency-Key': idempotencyKey } };
  const body = {
    ...(addressId ? { addressId } : {}),
    ...(deliveryInstructions?.trim() ? { deliveryInstructions: deliveryInstructions.trim() } : {}),
    ...(cookingRequests ? { cookingRequests: true } : {}),
    ...(extraCutlery ? { extraCutlery: true } : {}),
    ...(typeof tip === 'number' && tip > 0 ? { tip } : {}),
    ...(vegFleetOptIn ? { vegFleetOptIn: true } : {}),
    paymentMethod,
  };

  return apiPost<RawCheckoutResponse>('/api/orders/checkout', body, opts).then((res) => ({
    orderId: res.orderId ?? res.order?._id,
    restaurantName: res.restaurantName ?? null,
    status: res.status ?? res.order?.status ?? 'placed',
    paymentMethod: res.order?.paymentMethod ?? (paymentMethod === 'cod' ? 'cash' : 'online'),
    paymentStatus: res.order?.paymentStatus ?? (paymentMethod === 'cod' ? 'pending_cod' : 'pending'),
    grandTotal: num(res.order?.grandTotal),
    gatewayOrder: res.razorpayOrder ?? null,
  }));
}
