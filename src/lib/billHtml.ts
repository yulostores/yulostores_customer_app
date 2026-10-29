/**
 * billHtml.ts — the customer's bill for one order, as a self-contained HTML page for
 * expo-print (the system print sheet, which also offers "Save as PDF").
 *
 * Pure: everything comes in as plain data (see src/services/orderBill.ts for where it is
 * read from) and every money figure is the server's own — the item prices frozen on the
 * order and the order's `charges.lines`, exactly the rows the customer saw at checkout. No
 * arithmetic here beyond `rate × qty` for an item's line amount.
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

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const rupees = (amount: number) =>
  `₹${amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const paiseToRupees = (paise: number) => {
  const sign = paise < 0 ? '− ' : '';
  return sign + rupees(Math.abs(paise) / 100);
};

/** "#3326060E" — the same short reference the order screens show. */
export const shortOrderRef = (orderId: string) => `#${orderId.slice(-8).toUpperCase()}`;

const GSTIN_PATTERN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

/** A restaurant's GST number when it is a well-formed GSTIN, otherwise null ("NA", blanks). */
export function validGstin(value: string | null | undefined): string | null {
  const v = value?.trim().toUpperCase();
  return v && GSTIN_PATTERN.test(v) ? v : null;
}

function paymentLine(method: string | null, status: string): string {
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

function formatPlacedAt(iso: string | null): string | null {
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

export function buildBillHtml(bill: BillData): string {
  const e = escapeHtml;
  const placedAt = formatPlacedAt(bill.placedAt);
  const cancelled = bill.status === 'cancelled';

  const itemRows = bill.items
    .map(
      (i) => `
        <tr>
          <td>${e(i.name)}</td>
          <td class="num">${i.quantity}</td>
          <td class="num">${rupees(i.unitPrice)}</td>
          <td class="num">${rupees(i.unitPrice * i.quantity)}</td>
        </tr>`,
    )
    .join('');

  // Every row the server listed, except the grand total, which closes the table below.
  const chargeRows = bill.charges
    .filter((c) => c.key !== 'grand_total')
    .map(
      (c) => `
        <tr>
          <td>${e(c.label)}${c.sublabel ? `<div class="sub">${e(c.sublabel)}</div>` : ''}</td>
          <td class="num">${c.amountPaise == null ? '—' : paiseToRupees(c.amountPaise)}</td>
        </tr>`,
    )
    .join('');

  const totalPaise = bill.charges.find((c) => c.key === 'grand_total')?.amountPaise;
  const total = totalPaise != null ? paiseToRupees(totalPaise) : rupees(bill.grandTotal);

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Bill ${e(shortOrderRef(bill.orderId))}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, Roboto, "Helvetica Neue", Arial, sans-serif; color: #1a1a1a; margin: 0; padding: 28px; font-size: 13px; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  .muted { color: #666; }
  .sub { color: #777; font-size: 11px; margin-top: 2px; }
  .head { border-bottom: 2px solid #1a1a1a; padding-bottom: 12px; margin-bottom: 14px; }
  .meta { display: flex; justify-content: space-between; gap: 16px; margin-bottom: 14px; }
  .meta div { flex: 1; }
  .label { font-size: 10px; letter-spacing: .06em; text-transform: uppercase; color: #777; margin-bottom: 2px; }
  .banner { border: 2px solid #c62828; color: #c62828; font-weight: 700; text-align: center; padding: 8px; margin-bottom: 14px; letter-spacing: .04em; }
  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; font-size: 11px; color: #555; border-bottom: 1px solid #ccc; padding: 6px 0; }
  td { padding: 6px 0; vertical-align: top; border-bottom: 1px solid #eee; }
  .num { text-align: right; white-space: nowrap; padding-left: 12px; }
  .charges { margin-top: 10px; }
  .total td { border-top: 2px solid #1a1a1a; border-bottom: none; font-size: 16px; font-weight: 700; padding-top: 10px; }
  .foot { margin-top: 22px; text-align: center; color: #888; font-size: 11px; }
</style>
</head>
<body>
  <div class="head">
    <h1>${e(bill.restaurant.name)}</h1>
    ${bill.restaurant.addressLine ? `<div class="muted">${e(bill.restaurant.addressLine)}</div>` : ''}
    ${bill.restaurant.phone ? `<div class="muted">Phone: ${e(bill.restaurant.phone)}</div>` : ''}
    ${bill.restaurant.gstin ? `<div class="muted">GSTIN: ${e(bill.restaurant.gstin)}</div>` : ''}
  </div>

  ${cancelled ? '<div class="banner">ORDER CANCELLED</div>' : ''}

  <div class="meta">
    <div>
      <div class="label">Bill</div>
      <div><strong>Order ${e(shortOrderRef(bill.orderId))}</strong></div>
      ${placedAt ? `<div class="muted">${e(placedAt)}</div>` : ''}
    </div>
    <div>
      <div class="label">Delivered to</div>
      ${bill.customer.name ? `<div>${e(bill.customer.name)}</div>` : ''}
      ${bill.customer.addressLine ? `<div class="muted">${e(bill.customer.addressLine)}</div>` : ''}
    </div>
  </div>

  <table>
    <thead>
      <tr><th>Item</th><th class="num">Qty</th><th class="num">Rate</th><th class="num">Amount</th></tr>
    </thead>
    <tbody>${itemRows}</tbody>
  </table>

  <table class="charges">
    <tbody>
      ${chargeRows}
      <tr class="total"><td>Total</td><td class="num">${total}</td></tr>
    </tbody>
  </table>

  <p><span class="label">Payment</span><br />${e(paymentLine(bill.paymentMethod, bill.paymentStatus))}</p>

  <div class="foot">Ordered on Yulo Stores · Prices include the taxes shown above</div>
</body>
</html>`;
}
