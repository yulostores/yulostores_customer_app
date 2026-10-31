/**
 * tracking.ts — Live order tracking API layer.
 *
 * Endpoint:
 *   GET /api/orders/:id/tracking
 *   → { orderId, restaurantId, status, assignmentStatus, etaMinutes, etaSource, route,
 *        timeline, restaurant, deliveryPartner, deliveryAddress, orderItems, paymentMethod,
 *        paymentStatus, totalPaid }
 *
 *   POST /api/orders/:id/cancel  { confirmNoRefund? }
 *     The customer withdrawing an order, up to "ready" (409 ORDER_NOT_CANCELLABLE once
 *     the rider has it). Before the kitchen starts: cancelled, and an online payment is
 *     refunded in full. Once cooking started ('preparing' / 'ready'): 400
 *     CONFIRMATION_REQUIRED unless `confirmNoRefund: true` — then cancelled with NO
 *     refund (the restaurant is paid for the food).
 *
 * This is a customer-only endpoint (requires `customer` role token).
 * All money values are plain rupee numbers (not paise).
 *
 * A new order starts `placed`, which means "sent to the restaurant, waiting for them to
 * accept". It moves on to `confirmed` when the restaurant accepts, or to `cancelled` when
 * they reject it, the customer cancels it, or nobody answers before `approvalExpiresAt`.
 */

import { apiGet, apiPost } from './api';
import { toCustomerRefund, type CustomerRefund } from './payments';

// ─── Timeline ───────────────────────────────────────────────────────────────

export type TrackingStage =
  | 'placed'
  | 'confirmed'
  | 'preparing'
  | 'ready'
  | 'out_for_delivery'
  | 'delivered';

export interface TimelineEntry {
  stage: TrackingStage;
  /** ISO timestamp when this stage was reached, or null if not yet. */
  timestamp: string | null;
  completed: boolean;
}

// ─── Partner info ────────────────────────────────────────────────────────────

export interface PartnerLocation {
  lat: number;
  lng: number;
  /**
   * Compass bearing in degrees (0-360), or null when the device had none — a stationary GPS fix
   * reports no heading. The map rotates the rider marker to match, and falls back to the
   * direction between the last two fixes when this is null.
   */
  heading?: number | null;
  /** Metres per second, for display smoothing only. ETAs come from road routing, never from this. */
  speed?: number | null;
}

/** Where the ETA came from, so the UI can hedge its wording rather than overstate a guess. */
export type EtaSource = 'here' | 'estimate';

export interface TrackingRoute {
  /**
   * HERE **flexible polyline** for the leg currently in progress — decode with
   * src/lib/flexiblePolyline.ts, NOT with a Google polyline decoder; the formats differ.
   * Null when the backend could not route, in which case the map draws no line at all rather
   * than a straight one between the markers.
   */
  polyline: string | null;
  /** Road distance for that leg, in km. */
  distanceKm: number;
}

export interface DeliveryPartnerInfo {
  id: string;
  name: string | null;
  avatarUrl: string | null;
  rating: number;
  totalDeliveries: number;
  usesVegOnlyFleetBag: boolean;
  /** Masked phone — e.g. "+91XXXXXX1234". Opens native dialler. */
  maskedPhone: string | null;
  vehicleType: string | null;
  vehicleNumber: string | null;
  /** Partner's last known location, only present when fresh (< 120 s old). */
  currentLocation?: PartnerLocation;
}

// ─── Restaurant info ─────────────────────────────────────────────────────────

export interface TrackingRestaurant {
  name: string | null;
  rating: number | null;
  phone: string | null;
  coordinates: { lat: number; lng: number } | null;
}

// ─── Order item ──────────────────────────────────────────────────────────────

export interface TrackingOrderItem {
  menuItemId: string;
  name: string;
  price: number;
  quantity: number;
  note?: string;
}

// ─── Delivery address ─────────────────────────────────────────────────────────

export interface TrackingDeliveryAddress {
  label?: string | null;
  street?: string;
  city?: string;
  state?: string;
  pincode?: string;
  coordinates?: [number, number] | null;
  contactName?: string | null;
  contactPhone?: string | null;
}

// ─── Main tracking data ──────────────────────────────────────────────────────

// ─── Cancellation ────────────────────────────────────────────────────────────

/** Who ended the order (yulo_backend Order.cancelledBy) — `system` is the approval timeout. */
export type CancelledBy = 'restaurant' | 'kitchen' | 'waiter' | 'customer' | 'admin' | 'system' | string;

export interface OrderCancellation {
  /** Customer-facing reason — e.g. the restaurant's rejection reason. */
  reason: string | null;
  by: CancelledBy | null;
  at: string | null;
}

/** `pending` when a paid order was cancelled and the money is owed back. */
export type RefundStatus = 'none' | 'pending' | 'refunded';

export type OrderAssignmentStatus =
  | 'unassigned'
  | 'assigned'
  | 'picked_up'
  | 'delivered'
  | 'failed';

export interface TrackingData {
  orderId: string;
  restaurantId: string;
  /** The canonical order lifecycle status. */
  status: string;
  /** `status === 'placed'` — the restaurant hasn't accepted or rejected it yet. */
  awaitingRestaurantApproval: boolean;
  /**
   * ISO time the order is auto-cancelled if still unanswered, on THIS DEVICE's clock
   * (rebuilt from the server's `approvalSecondsLeft`, so a wrong phone clock can't skew
   * the countdown); null once decided.
   */
  approvalExpiresAt: string | null;
  /** ISO time the restaurant accepted it, or null. */
  acceptedAt: string | null;
  /** Set only when `status === 'cancelled'`. */
  cancellation: OrderCancellation | null;
  refundStatus: RefundStatus;
  /** The refund in plain words (status, amount, timeline) — null when none applies. */
  refund: CustomerRefund | null;
  /** Delivery-assignment sub-status — finer-grained than order.status. */
  assignmentStatus: OrderAssignmentStatus;
  /**
   * Minutes until arrival. Populated for every pre-delivery phase now, not just once the partner
   * is carrying the food: before a rider is assigned it is remaining prep plus the
   * restaurant-to-customer drive, and while the rider heads to the restaurant it covers both
   * legs. Null only when an address or restaurant has no coordinates to route between.
   */
  etaMinutes: number | null;
  /** 'here' for a traffic-aware road ETA, 'estimate' for the straight-line fallback. */
  etaSource: EtaSource | null;
  /** Road route for the leg in progress, for the map to draw. Null when routing was unavailable. */
  route: TrackingRoute | null;
  timeline: TimelineEntry[];
  restaurant: TrackingRestaurant;
  /** Null until a partner is assigned. */
  deliveryPartner: DeliveryPartnerInfo | null;
  deliveryAddress: TrackingDeliveryAddress | null;
  orderItems: TrackingOrderItem[];
  paymentMethod: string | null;
  paymentStatus: string | null;
  totalPaid: number;
  /** Already rated — the "Rate your order" card is skipped. */
  isReviewed: boolean;
}

// ─── Raw API shape ────────────────────────────────────────────────────────────

interface RawTrackingResponse {
  orderId: string;
  restaurantId: string;
  status: string;
  // Optional on the wire: an older backend doesn't send these.
  awaitingRestaurantApproval?: boolean;
  approvalExpiresAt?: string | null;
  approvalSecondsLeft?: number | null;
  acceptedAt?: string | null;
  cancellation?: OrderCancellation | null;
  refundStatus?: string | null;
  refund?: unknown;
  assignmentStatus: OrderAssignmentStatus;
  etaMinutes: number | null;
  etaSource: EtaSource | null;
  route: TrackingRoute | null;
  timeline: TimelineEntry[];
  restaurant: TrackingRestaurant;
  deliveryPartner: DeliveryPartnerInfo | null;
  deliveryAddress: TrackingDeliveryAddress | null;
  orderItems: TrackingOrderItem[];
  paymentMethod: string | null;
  paymentStatus: string | null;
  totalPaid: number;
  isReviewed?: boolean;
}

// ─── API ─────────────────────────────────────────────────────────────────────

/**
 * Fetches the full tracking payload for a delivery order.
 * Throws `ApiError` when the order is not found or is not a delivery order.
 */
export async function getOrderTracking(orderId: string): Promise<TrackingData> {
  const raw = await apiGet<RawTrackingResponse>(`/api/orders/${orderId}/tracking`);
  const refundStatus: RefundStatus =
    raw.refundStatus === 'pending' || raw.refundStatus === 'refunded' ? raw.refundStatus : 'none';
  const { approvalSecondsLeft, refund, ...rest } = raw;
  const approvalExpiresAt =
    typeof approvalSecondsLeft === 'number' && Number.isFinite(approvalSecondsLeft)
      ? new Date(Date.now() + Math.max(0, approvalSecondsLeft) * 1000).toISOString()
      : raw.approvalExpiresAt ?? null;
  return {
    ...rest,
    awaitingRestaurantApproval: raw.awaitingRestaurantApproval ?? raw.status === 'placed',
    approvalExpiresAt,
    acceptedAt: raw.acceptedAt ?? null,
    cancellation: raw.cancellation ?? null,
    refundStatus,
    refund: toCustomerRefund(refund),
    // Older orders can carry `coordinates: []` (a geocode that failed); the map needs a real
    // [lng, lat] pair or nothing — an empty one broke the camera and the drop-off marker.
    deliveryAddress: raw.deliveryAddress
      ? { ...raw.deliveryAddress, coordinates: validLngLat(raw.deliveryAddress.coordinates) }
      : null,
    isReviewed: raw.isReviewed === true,
  };
}

function validLngLat(c: unknown): [number, number] | null {
  return Array.isArray(c) && c.length === 2 && c.every((n) => typeof n === 'number' && Number.isFinite(n))
    ? [c[0], c[1]]
    : null;
}

/** Statuses a customer may cancel from — past these the food is on its way. */
export const CUSTOMER_CANCELLABLE_STATUSES = new Set(['placed', 'confirmed', 'preparing', 'ready']);
/** The kitchen has started: cancelling now means no refund. */
export const PREPARATION_STARTED_STATUSES = new Set(['preparing', 'ready']);

/**
 * `POST /api/orders/:id/cancel`. Throws `ApiError`:
 *   400 CONFIRMATION_REQUIRED — cooking has started; resend with `confirmNoRefund: true`
 *       after the customer accepts that there is no refund (this can happen even when the
 *       screen still showed "confirmed" — the kitchen moved on meanwhile)
 *   409 ORDER_NOT_CANCELLABLE — already out for delivery / delivered / cancelled
 */
export async function cancelOrder(orderId: string, { confirmNoRefund = false } = {}): Promise<void> {
  await apiPost(`/api/orders/${orderId}/cancel`, confirmNoRefund ? { confirmNoRefund: true } : {});
}

// ─── Veg-only fleet assignment ────────────────────────────────────────────
//
// A *different* concept from `assignmentStatus` above: this tracks whether the
// order opted into the veg-only delivery fleet at checkout, and — while the
// server is still searching for one — lets the customer choose to keep
// waiting or fall back to any available partner. `not_requested` covers every
// order that didn't opt in, so it's safe to fetch this for every order and
// simply render nothing in that case.

export type VegFleetStatus = 'not_requested' | 'searching' | 'assigned' | 'fallback_any_partner';

export interface VegFleetState {
  status: VegFleetStatus;
  /** Seconds left in the current search window, or null when not searching. */
  remainingSeconds: number | null;
}

interface RawVegFleetState {
  status?: string;
  remainingSeconds?: number | null;
}

function toVegFleetState(raw: RawVegFleetState): VegFleetState {
  const status: VegFleetStatus =
    raw.status === 'searching' || raw.status === 'assigned' || raw.status === 'fallback_any_partner'
      ? raw.status
      : 'not_requested';
  return {
    status,
    remainingSeconds: typeof raw.remainingSeconds === 'number' ? raw.remainingSeconds : null,
  };
}

/** `GET /api/orders/:id/veg-fleet/status`. */
export async function getVegFleetStatus(orderId: string): Promise<VegFleetState> {
  const raw = await apiGet<RawVegFleetState>(`/api/orders/${orderId}/veg-fleet/status`);
  return toVegFleetState(raw);
}

/** `POST /api/orders/:id/veg-fleet/keep-waiting` — resets the search window. */
export async function keepWaitingVegFleet(orderId: string): Promise<VegFleetState> {
  const raw = await apiPost<RawVegFleetState>(`/api/orders/${orderId}/veg-fleet/keep-waiting`);
  return toVegFleetState(raw);
}

/** `POST /api/orders/:id/veg-fleet/fallback` — accepts any available partner. */
export async function vegFleetFallback(orderId: string): Promise<VegFleetState> {
  const raw = await apiPost<RawVegFleetState>(`/api/orders/${orderId}/veg-fleet/fallback`);
  return toVegFleetState(raw);
}

// ─── Display helpers ─────────────────────────────────────────────────────────

/** Human-readable label for the current tracking status (matching the screenshot). */
export function trackingStatusLabel(status: string, assignmentStatus: OrderAssignmentStatus): string {
  switch (status) {
    case 'placed':
      return 'Waiting for restaurant';
    case 'confirmed':
      return 'Accepted by restaurant';
    case 'preparing':
      return 'Being prepared';
    case 'ready':
      return assignmentStatus === 'assigned' ? 'Partner on the way to restaurant' : 'Ready for pickup';
    case 'out_for_delivery':
      return 'On the way';
    case 'delivered':
      return 'Delivered';
    case 'cancelled':
      return 'Cancelled';
    default:
      return 'Order placed';
  }
}

/**
 * Customer-facing explanation of why an order was cancelled. `acceptedAt` separates a
 * rejection (never accepted) from the restaurant cancelling an order it had accepted.
 */
export function cancellationMessage(c: OrderCancellation | null, acceptedAt: string | null = null): string {
  switch (c?.by) {
    case 'restaurant':
    case 'kitchen':
    case 'waiter': {
      const lead = acceptedAt ? 'The restaurant cancelled your order' : 'The restaurant couldn’t take your order';
      return c.reason ? `${lead}: ${c.reason}` : `${lead}.`;
    }
    case 'customer':
      return 'You cancelled this order.';
    case 'system':
      // Mostly the approval timeout ("The restaurant didn't respond in time"), but an admin
      // cancellation is recorded as 'system' too — so trust the server's reason.
      return c.reason
        ? `${c.reason.trim().replace(/[.!\s]+$/, '')}. Your order was cancelled.`
        : 'This order was cancelled.';
    default:
      return c?.reason ? `This order was cancelled: ${c.reason}` : 'This order was cancelled.';
  }
}

/** Human-readable label for each timeline stage (matches Zomato's style). */
export function stageLabel(stage: TrackingStage): string {
  switch (stage) {
    case 'placed':
      return 'Sent to restaurant';
    case 'confirmed':
      return 'Accepted by restaurant';
    case 'preparing':
      return 'Preparing';
    case 'ready':
      return 'Ready for pickup';
    case 'out_for_delivery':
      return 'On the way';
    case 'delivered':
      return 'Delivered';
    default:
      return stage;
  }
}

/**
 * Short display id from a mongo ObjectId — last 6 chars, uppercased: the number the restaurant
 * portal, kitchen display and support all show, so a customer reading it out is understood.
 */
export function shortOrderId(orderId: string): string {
  return orderId.slice(-6).toUpperCase();
}

/** Formats a rupee amount with the ₹ symbol and Indian grouping. */
export function formatRupees(amount: number): string {
  return '₹' + Math.round(amount).toLocaleString('en-IN');
}
