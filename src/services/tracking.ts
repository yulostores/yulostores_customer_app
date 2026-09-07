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

import { apiGet } from './api';

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
