/**
 * tracking.ts — Live order tracking API layer.
 *
 * Endpoint:
 *   GET /api/orders/:id/tracking
 *   → { orderId, restaurantId, status, assignmentStatus, etaMinutes, timeline,
 *        restaurant, deliveryPartner, deliveryAddress, orderItems, paymentMethod,
 *        paymentStatus, totalPaid }
 *
 * This is a customer-only endpoint (requires `customer` role token).
 * All money values are plain rupee numbers (not paise).
 */

import { apiGet, apiPost } from './api';

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
  /** Delivery-assignment sub-status — finer-grained than order.status. */
  assignmentStatus: OrderAssignmentStatus;
  /** Minutes until arrival, only non-null when partner is en route to customer. */
  etaMinutes: number | null;
  timeline: TimelineEntry[];
  restaurant: TrackingRestaurant;
  /** Null until a partner is assigned. */
  deliveryPartner: DeliveryPartnerInfo | null;
  deliveryAddress: TrackingDeliveryAddress | null;
  orderItems: TrackingOrderItem[];
  paymentMethod: string | null;
  paymentStatus: string | null;
  totalPaid: number;
}

// ─── Raw API shape ────────────────────────────────────────────────────────────

interface RawTrackingResponse {
  orderId: string;
  restaurantId: string;
  status: string;
  assignmentStatus: OrderAssignmentStatus;
  etaMinutes: number | null;
  timeline: TimelineEntry[];
  restaurant: TrackingRestaurant;
  deliveryPartner: DeliveryPartnerInfo | null;
  deliveryAddress: TrackingDeliveryAddress | null;
  orderItems: TrackingOrderItem[];
  paymentMethod: string | null;
  paymentStatus: string | null;
  totalPaid: number;
}

// ─── API ─────────────────────────────────────────────────────────────────────

/**
 * Fetches the full tracking payload for a delivery order.
 * Throws `ApiError` when the order is not found or is not a delivery order.
 */
export async function getOrderTracking(orderId: string): Promise<TrackingData> {
  const raw = await apiGet<RawTrackingResponse>(`/api/orders/${orderId}/tracking`);
  return raw;
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
      return 'Order placed';
    case 'confirmed':
      return 'Order confirmed';
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

/** Human-readable label for each timeline stage (matches Zomato's style). */
export function stageLabel(stage: TrackingStage): string {
  switch (stage) {
    case 'placed':
      return 'Order placed';
    case 'confirmed':
      return 'Confirmed';
    case 'preparing':
      return 'Preparing';
    case 'ready':
      return 'Picked up';
    case 'out_for_delivery':
      return 'On the way';
    case 'delivered':
      return 'Delivered';
    default:
      return stage;
  }
}

/** Short display id from a mongo ObjectId — last 8 chars, uppercased. */
export function shortOrderId(orderId: string): string {
  return orderId.slice(-8).toUpperCase();
}

/** Formats a rupee amount with the ₹ symbol and Indian grouping. */
export function formatRupees(amount: number): string {
  return '₹' + Math.round(amount).toLocaleString('en-IN');
}
