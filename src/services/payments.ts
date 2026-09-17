/**
 * payments.ts — the payment-method catalogue and the gateway seam.
 *
 * ── The seam ──────────────────────────────────────────────────────────────
 * A placed online order comes back from POST /api/orders/checkout with either
 * a `gatewayOrder` (the backend has a Razorpay key) or `null` (it does not).
 * {@link resolveGateway} reads exactly that field:
 *
 *   gatewayOrder → {@link razorpayGateway}  (opens Razorpay Checkout, then
 *                                            POST /api/orders/:id/payment/verify)
 *   null         → {@link simulatedGateway} (POST /api/orders/:id/payment/simulate)
 *
 * So going live is three steps and touches no screen or hook:
 *   1. Set RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET on the backend.
 *   2. `npx expo install react-native-razorpay`, rebuild the dev client.
 *   3. In {@link razorpayGateway} below, drop the `PaymentError` throw and
 *      uncomment the block under it.
 *
 * Until then every method on the Payment screen resolves through the simulated
 * gateway, and "Pay on delivery" skips the gateway entirely (the order is
 * already `pending_cod` the moment it is placed).
 *
 * ── The catalogue ────────────────────────────────────────────────────────
 * {@link PAYMENT_GROUPS} / {@link PAYMENT_METHODS} describe what the checkout
 * Payment screen renders. `wire` is all the backend ever sees; `gatewayMethod`
 * is the Razorpay method-hint used once the real gateway is on.
 *
 * The canonical copy of this catalogue is the backend's
 * `server/config/appConfig.config.js`, served at `GET /api/app/config` and shown
 * on the read-only Settings → "Payment methods" screen (src/services/appConfig.ts).
 * This list is a deliberate synchronous twin of it — checkout can't wait on a
 * fetch to draw the picker — kept in step by hand, the same arrangement as the
 * backend's store-settings config and the restaurant portal's fieldRules.js.
 * Change one, change the other.
 */

import { apiPost } from './api';

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

export const DEFAULT_METHOD_ID: PaymentMethodId = 'cod';

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
  /** Razorpay publishable key — safe on the client. */
  keyId: string;
}

export interface PaymentContext {
  orderId: string;
  /** For display / the Razorpay sheet; the charged amount is fixed server-side. */
  amountRupees: number;
  method: PaymentMethod;
  /** Present → real gateway; `null` → simulated. */
  gatewayOrder: GatewayOrder | null;
  contact?: { name?: string | null; phone?: string | null };
}

export interface PaymentOutcome {
  status: 'paid' | 'failed';
  paymentId: string | null;
}

/** A payment that did not go through. `retryable` → the same order can be paid again. */
export class PaymentError extends Error {
  readonly retryable: boolean;
  constructor(message: string, retryable = true) {
    super(message);
    this.name = 'PaymentError';
    this.retryable = retryable;
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
 * The stand-in gateway. Hits POST /api/orders/:id/payment/simulate, which the
 * backend keeps live only while no real Razorpay key is configured (it starts
 * returning 400 NOT_SIMULATED the moment one is). The short delay is just so the
 * "Processing payment…" state is actually seen.
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

/**
 * The real gateway. Inert until wired — see the file header for the three-step
 * checklist. When enabled it opens Razorpay Checkout and then confirms via
 * POST /api/orders/:id/payment/verify (already implemented on the backend).
 */
export const razorpayGateway: PaymentGateway = {
  id: 'razorpay',
  async pay({ orderId, gatewayOrder, method, amountRupees, contact }) {
    if (!gatewayOrder) throw new PaymentError('Payment could not be started.', false);

    // ── Step 3: delete this throw and uncomment the block below. ──
    void method;
    void amountRupees;
    void contact;
    throw new PaymentError('Online payments aren’t enabled in this build yet.', false);

    /*
    const RazorpayCheckout = require('react-native-razorpay').default;
    let rp: {
      razorpay_payment_id: string;
      razorpay_order_id: string;
      razorpay_signature: string;
    };
    try {
      rp = await RazorpayCheckout.open({
        key: gatewayOrder.keyId,
        order_id: gatewayOrder.id,
        amount: gatewayOrder.amount,   // already paise, from the backend
        currency: gatewayOrder.currency,
        name: 'Yulo Stores',
        description: `Order ${orderId}`,
        method: method.gatewayMethod,  // 'upi' | 'card' | 'netbanking'
        prefill: {
          name: contact?.name ?? undefined,
          contact: contact?.phone ?? undefined,
        },
        theme: { color: '#FF5A00' },
      });
    } catch (e: any) {
      // code 0 = dismissed, 2 = payment failed inside the sheet.
      const cancelled = e?.code === 0;
      throw new PaymentError(
        cancelled ? 'Payment cancelled.' : e?.description || 'Payment failed. Please try again.',
        true,
      );
    }

    const { order } = await apiPost<RawPaidOrder>(
      `/api/orders/${orderId}/payment/verify`,
      {
        razorpay_payment_id: rp.razorpay_payment_id,
        razorpay_order_id: rp.razorpay_order_id,
        razorpay_signature: rp.razorpay_signature,
      },
    );
    return {
      status: order?.paymentStatus === 'paid' ? 'paid' : 'failed',
      paymentId: order?.razorpayPaymentId ?? null,
    };
    */
  },
};

/** Picks the gateway from the one signal the backend gives us. */
export function resolveGateway(ctx: PaymentContext): PaymentGateway {
  return ctx.gatewayOrder ? razorpayGateway : simulatedGateway;
}

/** Run the chosen gateway. Throws {@link PaymentError} / `ApiError` on failure. */
export function runPayment(ctx: PaymentContext): Promise<PaymentOutcome> {
  return resolveGateway(ctx).pay(ctx);
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
