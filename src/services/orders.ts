/**
 * orders.ts — reading placed orders back, and reordering one.
 *
 *   GET  /api/orders          ?page=N   → { orders, total, page }   (Orders tab)
 *   GET  /api/orders/:id                → { order }                 (confirmation)
 *   POST /api/orders/:id/reorder        → { cart, bill, removedItems }
 *
 * Customer-token-only. Every money field is a plain rupee number frozen at
 * placement (see yulo_backend/server/models/Order.js — item prices and
 * `grandTotal` are never re-priced afterward). `grandTotal` is `null` on orders
 * placed before the checkout bill breakdown existed — fall back to `subtotal`.
 *
 * The list endpoint joins `{ name, logo }` of the restaurant into each row
 * (yulo_backend `attachRestaurants`), so a card is labelled by its storefront;
 * the item names are kept as a secondary summary line.
 */

import { apiGet, apiPost } from './api';
import { reshapeCartSnapshot, type CartSnapshot } from './cart';

// ─── Status helpers ────────────────────────────────────────────────────────

/** The lifecycle a delivery order moves through (yulo_backend Order.js). */
export type OrderStatus =
  | 'placed'
  | 'confirmed'
  | 'preparing'
  | 'ready'
  | 'out_for_delivery'
  | 'delivered'
  | 'cancelled';

interface StatusMeta {
  label: string;
  /** Ionicons glyph. */
  icon: string;
  /** One of the app's food* accent roles. */
  tone: 'accent' | 'positive' | 'muted' | 'danger';
}

const STATUS_META: Record<string, StatusMeta> = {
  placed: { label: 'Order placed', icon: 'receipt-outline', tone: 'accent' },
  confirmed: { label: 'Confirmed', icon: 'checkmark-circle-outline', tone: 'accent' },
  preparing: { label: 'Being prepared', icon: 'flame-outline', tone: 'accent' },
  ready: { label: 'Ready', icon: 'bag-check-outline', tone: 'accent' },
  out_for_delivery: { label: 'On the way', icon: 'bicycle-outline', tone: 'accent' },
  delivered: { label: 'Delivered', icon: 'checkmark-done-outline', tone: 'positive' },
  cancelled: { label: 'Cancelled', icon: 'close-circle-outline', tone: 'danger' },
};

export function statusMeta(status: string): StatusMeta {
  return STATUS_META[status] ?? { label: status || 'Order', icon: 'receipt-outline', tone: 'muted' };
}

// ─── Wire shape (only the fields the app reads) ────────────────────────────

interface RawOrderItem {
  name?: string;
  quantity?: number;
}

interface RawOrder {
  _id: string;
  restaurantId?: string;
  /** Joined in per page by the list endpoint; `null` if the restaurant is gone. */
  restaurant?: { name?: string | null; logo?: string | null } | null;
  status?: string;
  type?: string;
  items?: RawOrderItem[];
  subtotal?: number;
  grandTotal?: number | null;
  paymentMethod?: string | null;
  paymentStatus?: string;
  /** Opted this order into the veg-only delivery fleet at checkout. */
  vegFleetOptIn?: boolean;
  vegFleetAssignmentStatus?: string;
  estimatedDeliveryTime?: string | null;
  createdAt?: string | null;
  deliveredAt?: string | null;
  deliveryAddress?: {
    label?: string | null;
    street?: string;
    city?: string;
  } | null;
}

interface RawOrdersResponse {
  orders?: RawOrder[];
  total?: number;
  page?: number;
}

// ─── View types ───────────────────────────────────────────────────────────

/** One row in the Orders tab. */
export interface OrderSummary {
  id: string;
  restaurantId: string | null;
  /** Storefront name for the card, or `null` when the restaurant was removed. */
  restaurantName: string | null;
  restaurantLogo: string | null;
  /** Order kind — only `'delivery'` orders can be reordered (backend rule). */
  type: string;
  status: string;
  /** "Paneer Tikka" or "Paneer Tikka + 2 more" — the secondary summary line. */
  title: string;
  itemCount: number;
  /** What the customer paid — `grandTotal`, or `subtotal` when it is unset. */
  total: number;
  /** Delivered, and it went out on the veg-only fleet — drives the green tag. */
  deliveredViaVegFleet: boolean;
  /** A "Reorder" action makes sense for this row (a finished delivery order). */
  canReorder: boolean;
  createdAt: string | null;
}

/** The order behind the confirmation screen. */
export interface OrderView {
  id: string;
  status: string;
  itemCount: number;
  subtotal: number;
  grandTotal: number;
  paymentMethod: string | null;
  paymentStatus: string;
  /** ISO string, or `null` when the backend has not set an ETA yet. */
  estimatedDeliveryTime: string | null;
  deliveryLine: string | null;
}

// ─── Reshape ──────────────────────────────────────────────────────────────

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

function payable(raw: RawOrder): number {
  const gt = raw.grandTotal;
  return typeof gt === 'number' && Number.isFinite(gt) ? gt : num(raw.subtotal);
}

function itemCountOf(items: RawOrderItem[]): number {
  return items.reduce((n, i) => n + Math.max(1, num(i.quantity) || 1), 0);
}

function titleOf(items: RawOrderItem[]): string {
  const names = items.map((i) => i.name?.trim()).filter(Boolean) as string[];
  if (names.length === 0) return 'Order';
  if (names.length === 1) return names[0];
  return `${names[0]} + ${names.length - 1} more`;
}

const TERMINAL_STATUSES = new Set(['delivered', 'cancelled']);

function toSummary(raw: RawOrder): OrderSummary {
  const items = raw.items ?? [];
  const status = raw.status ?? 'placed';
  const type = raw.type ?? 'delivery';
  const name = raw.restaurant?.name?.trim();
  return {
    id: String(raw._id),
    restaurantId: raw.restaurantId ? String(raw.restaurantId) : null,
    restaurantName: name || null,
    restaurantLogo: raw.restaurant?.logo?.trim() || null,
    type,
    status,
    title: titleOf(items),
    itemCount: itemCountOf(items),
    total: payable(raw),
    deliveredViaVegFleet: status === 'delivered' && raw.vegFleetOptIn === true,
    // The backend only lets `delivery` orders reorder; offer it once the order is
    // finished (a still-active order shows "Track" instead).
    canReorder: type === 'delivery' && TERMINAL_STATUSES.has(status),
    createdAt: raw.createdAt ?? null,
  };
}

function toOrderView(raw: RawOrder): OrderView {
  const items = raw.items ?? [];
  const addr = raw.deliveryAddress;
  const deliveryLine = addr
    ? [addr.street, addr.city].map((s) => s?.trim()).filter(Boolean).join(', ') || null
    : null;
  return {
    id: String(raw._id),
    status: raw.status ?? 'placed',
    itemCount: itemCountOf(items),
    subtotal: num(raw.subtotal),
    grandTotal: payable(raw),
    paymentMethod: raw.paymentMethod ?? null,
    paymentStatus: raw.paymentStatus ?? 'pending',
    estimatedDeliveryTime: raw.estimatedDeliveryTime ?? null,
    deliveryLine,
  };
}

// ─── API ──────────────────────────────────────────────────────────────────

export interface OrdersPage {
  orders: OrderSummary[];
  total: number;
  page: number;
}

/** One page (20) of the customer's orders, newest first. */
export async function listOrders(page = 1): Promise<OrdersPage> {
  const raw = await apiGet<RawOrdersResponse>('/api/orders', { page });
  return {
    orders: (raw.orders ?? []).map(toSummary),
    total: num(raw.total),
    page: num(raw.page) || page,
  };
}

/** One order in full — the confirmation screen. */
export function getOrder(id: string): Promise<OrderView> {
  return apiGet<{ order: RawOrder }>(`/api/orders/${id}`).then((d) => toOrderView(d.order));
}

// ─── Reorder ──────────────────────────────────────────────────────────────

/** Why a line from the original order couldn't be re-added to the cart. */
export type RemovedReason = 'unavailable' | 'no_veg_substitute' | 'invalid_customization';

export interface RemovedLine {
  name: string | null;
  reason: RemovedReason | string;
}

export interface ReorderResult {
  /** The fresh server cart + bill after the order's items were added. */
  snapshot: CartSnapshot;
  /** Lines that couldn't come across (sold out, no veg option, …) — may be empty. */
  removedItems: RemovedLine[];
}

interface RawReorderResponse {
  cart?: unknown;
  bill?: unknown;
  removedItems?: { name?: string | null; reason?: string }[];
}

/**
 * Re-add a past delivery order's items to the cart (`POST /api/orders/:id/reorder`).
 * The server re-prices every line and enforces the one-restaurant-per-cart rule,
 * so this can throw `ApiError` `CART_RESTAURANT_CONFLICT` (409) exactly like a
 * normal add — the caller surfaces that. Anything it *could* add is added even
 * when some lines fall out; those come back in `removedItems`.
 */
export async function reorder(orderId: string): Promise<ReorderResult> {
  const raw = await apiPost<RawReorderResponse>(`/api/orders/${orderId}/reorder`);
  return {
    snapshot: reshapeCartSnapshot({ cart: raw.cart, bill: raw.bill }),
    removedItems: (raw.removedItems ?? []).map((r) => ({
      name: r.name?.trim() || null,
      reason: r.reason ?? 'unavailable',
    })),
  };
}

/** Human phrasing for a {@link RemovedLine.reason}. */
export function removedReasonLabel(reason: RemovedLine['reason']): string {
  switch (reason) {
    case 'no_veg_substitute':
      return 'no veg option';
    case 'invalid_customization':
      return 'customization unavailable';
    case 'unavailable':
    default:
      return 'no longer available';
  }
}
