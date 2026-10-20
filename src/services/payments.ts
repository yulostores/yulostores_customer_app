/**
 * payments.ts — the payment-method catalogue and the gateway seam.
 *
 * ── The seam ──────────────────────────────────────────────────────────────
 * A placed online order comes back from POST /api/orders/checkout (or
 * …/payment/retry) with a `razorpayOrder` when the backend has a Razorpay key,
 * or `null` when a dev/local backend runs with payment simulation on.
 * {@link resolveGateway} reads that plus the app config's
 * `paymentSimulationEnabled`:
 *
 *   razorpayOrder           → {@link razorpayGateway}  (opens Razorpay Checkout, then
 *                                                         POST /api/orders/:id/payment/verify)
 *   null + simulation on    → {@link simulatedGateway} (POST /api/orders/:id/payment/simulate)
 *   null + simulation off   → "online payment unavailable" (never a fake success)
 *
 * Razorpay Checkout is a native module (react-native-razorpay): it runs in a
 * development / store build, NOT in Expo Go or on web. Without it the gateway
 * says "update the app" instead of crashing.
 *
 * {@link payAndConfirm} is what screens call: it runs the gateway and, when the
 * outcome isn't a clean success (sheet dismissed, verify failed, gateway timeout
 * — a payment may still have gone through), polls GET /api/orders/:id/payment a
 * few times before reporting "payment pending". It never cancels the order.
 *
 * ── The catalogue ────────────────────────────────────────────────────────
 * {@link PAYMENT_GROUPS} / {@link PAYMENT_METHODS} describe what the checkout
 * Payment screen renders. `wire` is all the backend ever sees; `gatewayMethod`
 * is the Razorpay method-hint passed to Checkout.
 *
 * The canonical copy of this catalogue is the backend's
 * `server/config/appConfig.config.js`, served at `GET /api/app/config` and shown
 * on the read-only Settings → "Payment methods" screen (src/services/appConfig.ts).
 * This list is a deliberate synchronous twin of it — checkout can't wait on a
 * fetch to draw the picker — kept in step by hand, the same arrangement as the
 * backend's store-settings config and the restaurant portal's fieldRules.js.
 * Change one, change the other.
 */

import { NativeModules, Platform, TurboModuleRegistry } from 'react-native';
import { ApiError, apiGet, apiPost } from './api';

// ─── Catalogue ──────────────────────────────────────────────────────────────

export type PaymentGroupId = 'upi' | 'card' | 'netbanking' | 'cod';

export type PaymentMethodId =
  | 'phonepe'
  | 'gpay'
  | 'paytm'
  | 'cred'
  | 'card'
  | 'netbanking'
  | 'cod';

export interface PaymentMethod {
  id: PaymentMethodId;
  group: PaymentGroupId;
  label: string;
  /** Sub-label, e.g. "UPI" under "PhonePe". */
  hint?: string;
  /** Ionicons glyph name for the leading badge (screen casts to the icon set). */
  icon: string;
  /** Badge tint. */
  tint: string;
  /** The only thing POST /api/orders/checkout accepts. */
  wire: 'cod' | 'online';
  /** Razorpay Checkout `method` hint — used once the real gateway is wired. */
  gatewayMethod?: 'upi' | 'card' | 'netbanking';
}

export interface PaymentGroup {
  id: PaymentGroupId;
  title: string;
  subtitle?: string;
  /** Collapsed groups start closed on the screen; `upi` is open, matching the mock. */
  defaultOpen: boolean;
}

export const PAYMENT_GROUPS: PaymentGroup[] = [
  { id: 'upi', title: 'UPI', subtitle: 'Pay by any UPI app', defaultOpen: true },
  { id: 'card', title: 'Cards', subtitle: 'Credit / Debit Card', defaultOpen: false },
  { id: 'netbanking', title: 'Net Banking', subtitle: 'All major banks', defaultOpen: false },
  { id: 'cod', title: 'Pay on Delivery', subtitle: 'Cash / UPI when it arrives', defaultOpen: false },
];

export const PAYMENT_METHODS: PaymentMethod[] = [
  { id: 'phonepe', group: 'upi', label: 'PhonePe UPI', hint: 'UPI', icon: 'phone-portrait', tint: '#5F259F', wire: 'online', gatewayMethod: 'upi' },
  { id: 'gpay', group: 'upi', label: 'Google Pay UPI', hint: 'UPI', icon: 'logo-google', tint: '#1A73E8', wire: 'online', gatewayMethod: 'upi' },
  { id: 'paytm', group: 'upi', label: 'Paytm', hint: 'UPI', icon: 'wallet', tint: '#00BAF2', wire: 'online', gatewayMethod: 'upi' },
  { id: 'cred', group: 'upi', label: 'CRED', hint: 'UPI', icon: 'shield-checkmark', tint: '#1C1C1C', wire: 'online', gatewayMethod: 'upi' },
  { id: 'card', group: 'card', label: 'Credit / Debit Card', hint: 'Visa · Mastercard · RuPay', icon: 'card', tint: '#1C1C1C', wire: 'online', gatewayMethod: 'card' },
  { id: 'netbanking', group: 'netbanking', label: 'Net Banking', hint: 'All Indian banks', icon: 'business', tint: '#0D8A16', wire: 'online', gatewayMethod: 'netbanking' },
  { id: 'cod', group: 'cod', label: 'Pay on Delivery (Cash/UPI)', hint: 'Pay cash or ask for QR code', icon: 'cash', tint: '#0D8A16', wire: 'cod' },
];

// UPI first: cash on delivery is off unless Finance Settings switch it on (the
// checkout screen falls back to this whenever COD is hidden).
export const DEFAULT_METHOD_ID: PaymentMethodId = 'phonepe';

export function getMethod(id: PaymentMethodId): PaymentMethod {
  return PAYMENT_METHODS.find((m) => m.id === id) ?? PAYMENT_METHODS[0];
}

export function methodsForGroup(group: PaymentGroupId): PaymentMethod[] {
  return PAYMENT_METHODS.filter((m) => m.group === group);
}

// ─── Gateway seam ───────────────────────────────────────────────────────────

/** Shape the backend returns as `razorpayOrder` on a placed online order. */
export interface GatewayOrder {
  id: string;
  /** Minor units (paise) — Razorpay's own convention, passed straight through. */
  amount: number;
  currency: string;
  /** Razorpay publishable key — safe on the client (never the secret). */
  keyId: string;
}

export interface PaymentContext {
  orderId: string;
  /** For display only; the charged amount is fixed server-side (`gatewayOrder.amount`). */
  amountRupees: number;
  /** The checkout pick — its `gatewayMethod` pre-selects UPI / card / net banking in the
   *  Razorpay sheet. Omitted (paying from the tracking screen) → the sheet offers all. */
  method?: PaymentMethod;
  /** Present → Razorpay; `null` → simulated (only when simulation is on). */
  gatewayOrder: GatewayOrder | null;
  /** `GET /api/app/config` → payments.paymentSimulationEnabled. */
  simulationEnabled: boolean;
  contact?: { name?: string | null; phone?: string | null; email?: string | null };
}

export interface PaymentOutcome {
  status: 'paid' | 'failed';
  paymentId: string | null;
}

/**
 * A payment that did not go through.
 *   dismissed   — the customer closed the Razorpay sheet
 *   failed      — Razorpay reported a failure inside the sheet
 *   unavailable — this build / backend can't take an online payment at all
 * `retryable` → the same order can be paid again.
 */
export class PaymentError extends Error {
  readonly retryable: boolean;
  readonly kind: 'dismissed' | 'failed' | 'unavailable';
  constructor(message: string, retryable = true, kind: PaymentError['kind'] = 'failed') {
    super(message);
    this.name = 'PaymentError';
    this.retryable = retryable;
    this.kind = kind;
  }
}

export interface PaymentGateway {
  readonly id: string;
  pay(ctx: PaymentContext): Promise<PaymentOutcome>;
}

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

interface RawPaidOrder {
  order?: { paymentStatus?: string; razorpayPaymentId?: string | null };
}

/**
 * The dev/local stand-in. Hits POST /api/orders/:id/payment/simulate, which the
 * backend serves only while payment simulation is on (never in production — it
 * answers 404 otherwise). The short delay is just so "Processing payment…" is seen.
 */
export const simulatedGateway: PaymentGateway = {
  id: 'simulated',
  async pay({ orderId }) {
    await delay(900);
    const { order } = await apiPost<RawPaidOrder>(`/api/orders/${orderId}/payment/simulate`);
    return {
      status: order?.paymentStatus === 'paid' ? 'paid' : 'failed',
      paymentId: order?.razorpayPaymentId ?? null,
    };
  },
};

/** The native Razorpay Checkout module is in this binary (a dev / store build, not Expo Go). */
export function isRazorpayAvailable(): boolean {
  if (Platform.OS === 'web') return false;
  try {
    return TurboModuleRegistry.get('RNRazorpayCheckout') != null || NativeModules.RNRazorpayCheckout != null;
  } catch {
    return NativeModules.RNRazorpayCheckout != null;
  }
}

interface RazorpaySuccess {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
}

interface RazorpayCheckoutApi {
  open(options: Record<string, unknown>): Promise<RazorpaySuccess>;
}

/** Loaded lazily: requiring the package without its native module throws on iOS. */
function loadRazorpay(): RazorpayCheckoutApi | null {
  if (!isRazorpayAvailable()) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('react-native-razorpay');
    return (mod?.default ?? mod) as RazorpayCheckoutApi;
  } catch {
    return null;
  }
}

/**
 * The real gateway: opens Razorpay Checkout for the backend's Razorpay order, then
 * confirms via POST /api/orders/:id/payment/verify — the backend re-checks the
 * signature, amount and order against Razorpay's own record before counting it.
 */
export const razorpayGateway: PaymentGateway = {
  id: 'razorpay',
  async pay({ orderId, gatewayOrder, method, contact }) {
    if (!gatewayOrder) throw new PaymentError('Payment could not be started.', true);
    const RazorpayCheckout = loadRazorpay();
    if (!RazorpayCheckout) {
      throw new PaymentError(
        'Online payment needs the latest version of the Yulo Stores app. Please update the app, or choose another way to pay.',
        false,
        'unavailable',
      );
    }

    let rp: RazorpaySuccess;
    try {
      rp = await RazorpayCheckout.open({
        key: gatewayOrder.keyId,
        order_id: gatewayOrder.id,
        amount: gatewayOrder.amount, // already paise, from the backend
        currency: gatewayOrder.currency,
        name: 'Yulo Stores',
        description: `Order ${orderId.slice(-6).toUpperCase()}`,
        ...(method?.gatewayMethod ? { method: method.gatewayMethod } : {}),
        prefill: {
          ...(contact?.name ? { name: contact.name } : {}),
          ...(contact?.phone ? { contact: contact.phone } : {}),
          ...(contact?.email ? { email: contact.email } : {}),
        },
        theme: { color: '#FF5A00' },
      });
    } catch (e: unknown) {
      const err = (e ?? {}) as { code?: number; description?: string; error?: { description?: string } };
      // Razorpay's codes: 0 = PAYMENT_CANCELLED (sheet closed), 2 = NETWORK_ERROR, others = failure.
      if (err.code === 0) throw new PaymentError('Payment not completed.', true, 'dismissed');
      const description = err.error?.description ?? err.description;
      throw new PaymentError(
        typeof description === 'string' && description && !description.startsWith('{')
          ? description
          : 'The payment didn’t go through. Please try again.',
        true,
        'failed',
      );
    }

    const { order } = await apiPost<RawPaidOrder>(`/api/orders/${orderId}/payment/verify`, {
      razorpay_payment_id: rp.razorpay_payment_id,
      razorpay_order_id: rp.razorpay_order_id,
      razorpay_signature: rp.razorpay_signature,
    });
    return {
      status: order?.paymentStatus === 'paid' ? 'paid' : 'failed',
      paymentId: order?.razorpayPaymentId ?? null,
    };
  },
};

/** Picks the gateway from what the backend sent and whether simulation is on. */
export function resolveGateway(ctx: PaymentContext): PaymentGateway {
  if (ctx.gatewayOrder) return razorpayGateway;
  if (ctx.simulationEnabled) return simulatedGateway;
  throw new PaymentError('Online payment isn’t available right now. Please try again in a little while.', true, 'unavailable');
}

/** Run the chosen gateway once. Throws {@link PaymentError} / `ApiError` on failure. */
export function runPayment(ctx: PaymentContext): Promise<PaymentOutcome> {
  return resolveGateway(ctx).pay(ctx);
}

// ─── Payment status, retry ──────────────────────────────────────────────────

/** A refund as the customer is shown it (backend customerRefundView). */
export interface CustomerRefund {
  status: 'pending' | 'processing' | 'processed' | 'failed' | string;
  /** Rupees. */
  amount: number;
  /** One plain-language sentence, e.g. "Refund of ₹357 started — usually 5–7 business days." */
  timeline: string | null;
}

export function toCustomerRefund(raw: unknown): CustomerRefund | null {
  const r = raw as { status?: string; amount?: number; timeline?: string | null } | null | undefined;
  if (!r || typeof r.status !== 'string' || r.status === 'none') return null;
  return {
    status: r.status,
    amount: typeof r.amount === 'number' && Number.isFinite(r.amount) ? r.amount : 0,
    timeline: r.timeline ?? null,
  };
}

export interface PaymentStatus {
  paid: boolean;
  /** `pending` · `paid` · `failed` · `refunded` · `pending_cod` … */
  paymentStatus: string;
  /** The order can still be paid (online, unpaid, not cancelled) — offer "Retry payment". */
  canRetry: boolean;
  failureReason: string | null;
  /** Rupees — what the payment is for. */
  amount: number;
  refund: CustomerRefund | null;
}

interface RawPaymentStatus {
  paid?: boolean;
  paymentStatus?: string;
  canRetry?: boolean;
  failureReason?: string | null;
  amount?: number;
  refund?: unknown;
}

/** GET /api/orders/:id/payment — where the payment stands (a webhook may have settled it). */
export async function getPaymentStatus(orderId: string): Promise<PaymentStatus> {
  const raw = await apiGet<RawPaymentStatus>(`/api/orders/${orderId}/payment`);
  return {
    paid: raw.paid === true,
    paymentStatus: raw.paymentStatus ?? 'pending',
    canRetry: raw.canRetry === true,
    failureReason: raw.failureReason ?? null,
    amount: typeof raw.amount === 'number' ? raw.amount : 0,
    refund: toCustomerRefund(raw.refund),
  };
}

export interface RetryPayment {
  /** Open Checkout with this; `null` → simulated (dev only). */
  gatewayOrder: GatewayOrder | null;
  /** The existing Razorpay order was reused (same amount). */
  reused: boolean;
}

/**
 * POST /api/orders/:id/payment/retry — a fresh (or the still-valid) Razorpay order for
 * the SAME amount. 409 ALREADY_PAID / PAYMENT_ALREADY_RECEIVED → poll status instead;
 * 409 ORDER_CANCELLED → nothing to pay.
 */
export async function retryOrderPayment(orderId: string): Promise<RetryPayment> {
  const raw = await apiPost<{ razorpayOrder?: GatewayOrder | null; reused?: boolean }>(
    `/api/orders/${orderId}/payment/retry`,
  );
  return { gatewayOrder: raw.razorpayOrder ?? null, reused: raw.reused === true };
}

export type PayResult =
  | { status: 'paid' }
  | {
      status: 'pending';
      /** Why it isn't confirmed — shown above "Retry payment". */
      message: string;
      /** The order can be paid again. */
      canRetry: boolean;
    };

// Waits between status polls after an unclear outcome — ~10 s in all.
const POLL_DELAYS_MS = [1000, 2000, 3000, 4000];

async function pollUntilPaid(orderId: string, attempts: number): Promise<PaymentStatus | null> {
  let last: PaymentStatus | null = null;
  for (const wait of POLL_DELAYS_MS.slice(0, attempts)) {
    await delay(wait);
    try {
      last = await getPaymentStatus(orderId);
      if (last.paid || !last.canRetry) return last;
    } catch {
      // Offline for a moment — keep trying; the order is safe on the server either way.
    }
  }
  return last;
}

function pendingMessageFor(err: unknown): string {
  if (err instanceof PaymentError) return err.message;
  if (err instanceof ApiError) {
    if (err.code === 'PAYMENT_GATEWAY_ERROR' || err.status === 0 || err.status >= 500) {
      return 'We couldn’t confirm your payment yet. If money left your account, it will show here shortly — you won’t be charged twice.';
    }
    if (err.code === 'PAYMENT_VERIFICATION_FAILED') {
      return 'We couldn’t confirm this payment. If you were charged, it will be refunded automatically.';
    }
    return err.message || 'The payment could not be confirmed.';
  }
  return 'The payment didn’t go through. Please try again.';
}

/**
 * Pay for an online order and find out, as best we can, whether it went through.
 * Resolves `paid`, or `pending` (show the message + "Retry payment"); throws only
 * for {@link PaymentError} `unavailable` (nothing to retry in this build) and a
 * 401. Never cancels the order.
 */
export async function payAndConfirm(ctx: PaymentContext): Promise<PayResult> {
  let failure: unknown = null;
  try {
    const outcome = await runPayment(ctx);
    if (outcome.status === 'paid') return { status: 'paid' };
  } catch (err) {
    if (err instanceof PaymentError && err.kind === 'unavailable') throw err;
    if (err instanceof ApiError && err.status === 401) throw err;
    failure = err;
  }

  // A closed sheet rarely hides a payment — one quick look; anything else (verify
  // failed, gateway timeout, network) may have been paid: poll for a while.
  const dismissed = failure instanceof PaymentError && failure.kind === 'dismissed';
  const status = await pollUntilPaid(ctx.orderId, dismissed ? 1 : POLL_DELAYS_MS.length);
  if (status?.paid) return { status: 'paid' };
  return {
    status: 'pending',
    message: failure ? pendingMessageFor(failure) : 'The payment didn’t go through. Please try again.',
    canRetry: status ? status.canRetry : true,
  };
}

// ─── Idempotency key ────────────────────────────────────────────────────────

/**
 * A throwaway UUID-v4-ish string for the `Idempotency-Key` header. Not
 * cryptographically strong — it only needs to be unique per checkout attempt so
 * a retried request maps to the same order.
 */
export function newIdempotencyKey(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
