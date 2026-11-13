/**
 * coupons.ts — the customer's coupons, as the screens show them. Pure (no React Native), so it
 * runs under `npm run test:coupons`.
 *
 * Wire shape: `GET /api/users/me/coupons[/:id]` (yulo_backend/API.md → "Customer — Coupons").
 * Customers get coupons from nearby partner shops (salons, spas, stores) after paying online for
 * a food order or a dine-in bill, and show the code / QR at the shop's counter.
 */

export type CouponStatus = 'issued' | 'redeemed' | 'expired' | 'void';

export interface RawCoupon {
  id?: string;
  _id?: string;
  code?: string;
  qrPayload?: string | null;
  title?: string | null;
  terms?: string | null;
  seller?: {
    id?: string;
    name?: string | null;
    address?: string | null;
    phone?: string | null;
    location?: { longitude?: number; latitude?: number } | null;
  } | null;
  category?: { id?: string; key?: string; name?: string | null; icon?: string | null } | null;
  issuedAt?: string | null;
  expiresAt?: string | null;
  status?: string;
  redeemedAt?: string | null;
  voidedAt?: string | null;
}

export interface CustomerCoupon {
  id: string;
  code: string;
  /** Exactly what the QR encodes (the backend says: the code). */
  qrPayload: string;
  title: string;
  terms: string | null;
  sellerName: string;
  sellerAddress: string | null;
  sellerPhone: string | null;
  sellerLocation: { latitude: number; longitude: number } | null;
  categoryName: string | null;
  issuedAt: string | null;
  expiresAt: string | null;
  status: CouponStatus;
  redeemedAt: string | null;
}

const STATUSES: readonly CouponStatus[] = ['issued', 'redeemed', 'expired', 'void'];

/**
 * The view shape. An `issued` coupon whose date has passed is shown as expired — the backend
 * reports it that way too, but the 02:00 job may not have run yet and a screen can stay open.
 */
export function toCoupon(raw: RawCoupon, now: number = Date.now()): CustomerCoupon {
  const status = STATUSES.includes(raw.status as CouponStatus) ? (raw.status as CouponStatus) : 'issued';
  const expiresAt = raw.expiresAt ?? null;
  const lapsed = status === 'issued' && expiresAt != null && Date.parse(expiresAt) <= now;
  const loc = raw.seller?.location;
  const code = String(raw.code ?? '');
  return {
    id: String(raw.id ?? raw._id ?? ''),
    code,
    qrPayload: raw.qrPayload || code,
    title: raw.title?.trim() || 'Coupon',
    terms: raw.terms?.trim() || null,
    sellerName: raw.seller?.name?.trim() || 'Partner shop',
    sellerAddress: raw.seller?.address?.trim() || null,
    sellerPhone: raw.seller?.phone?.trim() || null,
    sellerLocation:
      loc && Number.isFinite(loc.latitude) && Number.isFinite(loc.longitude)
        ? { latitude: loc.latitude as number, longitude: loc.longitude as number }
        : null,
    categoryName: raw.category?.name?.trim() || null,
    issuedAt: raw.issuedAt ?? null,
    expiresAt,
    status: lapsed ? 'expired' : status,
    redeemedAt: raw.redeemedAt ?? null,
  };
}

/** The three My Coupons tabs and the status each asks the server for. Void (refunded) coupons are hidden. */
export const COUPON_TABS = [
  { key: 'active', label: 'Active', status: 'issued' },
  { key: 'used', label: 'Used', status: 'redeemed' },
  { key: 'expired', label: 'Expired', status: 'expired' },
] as const;
export type CouponTabKey = (typeof COUPON_TABS)[number]['key'];

export const STATUS_LABEL: Record<CouponStatus, string> = {
  issued: 'Active',
  redeemed: 'Used',
  expired: 'Expired',
  void: 'Cancelled',
};

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * "Expires in 12 days" / "Expires in 5 h 20 min" / "Expires in 45 s" / "Expired". `urgent` is
 * the last 24 hours, when the screen colours it.
 */
export function expiryCountdown(
  expiresAt: string | null,
  now: number = Date.now(),
): { text: string; urgent: boolean; expired: boolean } {
  if (!expiresAt) return { text: 'No expiry date', urgent: false, expired: false };
  const left = Date.parse(expiresAt) - now;
  if (!Number.isFinite(left)) return { text: 'No expiry date', urgent: false, expired: false };
  if (left <= 0) return { text: 'Expired', urgent: false, expired: true };
  if (left >= 2 * DAY) return { text: `Expires in ${Math.floor(left / DAY)} days`, urgent: false, expired: false };
  if (left >= DAY) {
    const h = Math.floor((left - DAY) / HOUR);
    return { text: `Expires in 1 day${h ? ` ${h} h` : ''}`, urgent: false, expired: false };
  }
  if (left >= HOUR) {
    const h = Math.floor(left / HOUR);
    const m = Math.floor((left % HOUR) / MINUTE);
    return { text: `Expires in ${h} h${m ? ` ${m} min` : ''}`, urgent: true, expired: false };
  }
  if (left >= MINUTE) return { text: `Expires in ${Math.floor(left / MINUTE)} min`, urgent: true, expired: false };
  return { text: `Expires in ${Math.ceil(left / 1000)} s`, urgent: true, expired: false };
}

/**
 * "KM4T7-QXH2P" — the same grouping the shop's redeem screen shows (yulo_seller
 * lib/couponCode.js), so the two can be compared at a glance. The shop accepts it with or
 * without the dash.
 */
export function formatCode(code: string): string {
  const c = code.replace(/[\s-]+/g, '');
  return c.length > 5 ? `${c.slice(0, 5)}-${c.slice(5)}` : c;
}

/** A `tel:` link for the shop's phone, or null when it has none. */
export function telUrl(phone: string | null): string | null {
  const digits = (phone ?? '').replace(/[^\d+]/g, '');
  return digits.replace(/\D/g, '').length >= 6 ? `tel:${digits}` : null;
}

/** A maps link that opens the Google Maps app (or the browser) on the shop — by pin when known, else by address. */
export function mapsUrl(c: Pick<CustomerCoupon, 'sellerLocation' | 'sellerAddress' | 'sellerName'>): string | null {
  if (c.sellerLocation) {
    const { latitude, longitude } = c.sellerLocation;
    return `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`;
  }
  if (c.sellerAddress)
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${c.sellerName}, ${c.sellerAddress}`)}`;
  return null;
}

/** "You earned 1 coupon" / "You earned 3 coupons". */
export function earnedTitle(count: number): string {
  return `You earned ${count} ${count === 1 ? 'coupon' : 'coupons'}`;
}

// ─── Screen states (decided here so they are unit-tested; the screens just render them) ──────

export type CouponListState =
  | { kind: 'sign-in' }
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'empty'; title: string; body: string }
  | { kind: 'list' };

export const EMPTY_TEXT: Record<CouponTabKey, { title: string; body: string }> = {
  active: {
    title: 'No coupons yet',
    body: 'Pay online for an order and you’ll get coupons from salons, spas and shops near the restaurant.',
  },
  used: { title: 'Nothing used yet', body: 'Coupons you use at a shop show up here.' },
  expired: { title: 'Nothing expired', body: 'Coupons that run out before you use them show up here.' },
};

/** What My Coupons shows for one tab. A refresh error over a list already shown keeps the list. */
export function couponListState(p: {
  tab: CouponTabKey;
  notSignedIn: boolean;
  isLoading: boolean;
  error: string | null;
  count: number;
}): CouponListState {
  if (p.notSignedIn) return { kind: 'sign-in' };
  if (p.isLoading) return { kind: 'loading' };
  if (p.error && p.count === 0) return { kind: 'error', message: p.error };
  if (p.count === 0) return { kind: 'empty', ...EMPTY_TEXT[p.tab] };
  return { kind: 'list' };
}

export type CouponDetailState =
  | { kind: 'loading' }
  | { kind: 'not-found' }
  | { kind: 'error'; message: string }
  | { kind: 'active'; countdown: ReturnType<typeof expiryCountdown> }
  | { kind: 'done'; label: string; line: string };

const shortDay = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

/**
 * What the coupon screen shows: the QR + countdown only while the coupon can still be used (an
 * "issued" one whose time ran out while the screen was open counts as expired).
 */
export function couponDetailState(
  p: { coupon: CustomerCoupon | null; isLoading: boolean; error: string | null; notFound: boolean },
  now: number = Date.now(),
): CouponDetailState {
  if (!p.coupon) {
    if (p.isLoading) return { kind: 'loading' };
    if (p.notFound) return { kind: 'not-found' };
    return { kind: 'error', message: p.error ?? 'Could not load this coupon.' };
  }
  const c = p.coupon;
  const countdown = expiryCountdown(c.expiresAt, now);
  if (c.status === 'issued' && !countdown.expired) return { kind: 'active', countdown };
  if (c.status === 'redeemed') return { kind: 'done', label: STATUS_LABEL.redeemed, line: `Used on ${shortDay(c.redeemedAt)}` };
  if (c.status === 'void') return { kind: 'done', label: STATUS_LABEL.void, line: 'Cancelled — the order was refunded' };
  return { kind: 'done', label: STATUS_LABEL.expired, line: `Expired on ${shortDay(c.expiresAt)}` };
}
