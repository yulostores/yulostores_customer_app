/**
 * billHtml.ts — the customer's bill for one order: its data shape and the wording helpers the
 * in-app bill screen (app/order/[id]/bill.tsx) uses. Customers only view their bill; printing
 * is the restaurant's (owner portal), so nothing here builds a printable page any more.
 *
 * Pure: everything comes in as plain data (see src/services/orderBill.ts for where it is read
 * from) and every money figure is the server's own — the item prices frozen on the order and
 * the order's `charges.lines`. No arithmetic here beyond `rate × qty` for an item's line amount.
 */
export interface BillItem {
  name: string;
  quantity: number;
  /** Unit price in rupees, as frozen on the order. */
  unitPrice: number;
}

export interface BillChargeLine {
  key: string;
  label: string;
  /** Paise; `null` when the server had no amount for it. */
  amountPaise: number | null;
  sublabel: string | null;
}

export interface BillData {
  orderId: string;
  placedAt: string | null;
  status: string;
  restaurant: {
    name: string;
    addressLine: string | null;
    phone: string | null;
    /** Only a real 15-character GSTIN; placeholders like "NA" are dropped by the caller. */
    gstin: string | null;
  };
  customer: { name: string | null; addressLine: string | null };
  items: BillItem[];
  /** The server's bill rows in reading order, `grand_total` included. */
  charges: BillChargeLine[];
  /** Rupees — the order's grand total. */
  grandTotal: number;
  /** 'online' · 'cash' · 'upi' · 'card' · null */
  paymentMethod: string | null;
  /** 'paid' · 'pending' · 'pending_cod' · 'refunded' · 'failed' … */
  paymentStatus: string;
}

/** "₹1,234.00" */
export const formatRupees = (amount: number) =>
  `₹${amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Paise as rupees, a negative amount written "− ₹48.00". */
export const formatPaise = (paise: number) => {
  const sign = paise < 0 ? '− ' : '';
  return sign + formatRupees(Math.abs(paise) / 100);
};

/** "#3326060E" — the same short reference the order screens show. */
// Six characters — the same order number the restaurant, kitchen and support see.
export const shortOrderRef = (orderId: string) => `#${orderId.slice(-6).toUpperCase()}`;

const GSTIN_PATTERN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

/** A restaurant's GST number when it is a well-formed GSTIN, otherwise null ("NA", blanks). */
export function validGstin(value: string | null | undefined): string | null {
  const v = value?.trim().toUpperCase();
  return v && GSTIN_PATTERN.test(v) ? v : null;
}

export function paymentLine(method: string | null, status: string): string {
  const how =
    method === 'cash' ? 'Cash on delivery' : method === 'online' || method === 'upi' || method === 'card' ? 'Online' : null;
  switch (status) {
    case 'paid':
      return how ? `Paid · ${how}` : 'Paid';
    case 'refunded':
      return 'Refunded';
    case 'pending_cod':
      return 'To be paid on delivery';
    case 'failed':
      return 'Payment failed — not charged';
    default:
      return 'Not paid';
  }
}

export function formatPlacedAt(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'Asia/Kolkata',
  });
}
