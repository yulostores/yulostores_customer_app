/**
 * orderBill.ts — print / save the customer's bill for an order.
 *
 *   GET /api/orders/:id          → the order: items frozen at checkout, `charges.lines`
 *                                  (the bill rows in paise), payment state, delivery address
 *   GET /api/restaurants/:id     → the restaurant's public name, address, phone, GST number
 *
 * The page itself is built by src/lib/billHtml.ts and handed to expo-print, which opens the
 * system print sheet (print, or "Save as PDF"). expo-print ships in Expo Go and in builds.
 */

import * as Print from 'expo-print';
import { buildBillHtml, validGstin, type BillChargeLine, type BillData } from '../lib/billHtml';
import { apiGet } from './api';

interface RawOrder {
  _id: string;
  restaurantId: string;
  status?: string;
  createdAt?: string;
  items?: { name?: string; quantity?: number; price?: number }[];
  charges?: { lines?: { key?: string; label?: string; amountPaise?: number | null; sublabel?: string | null }[] } | null;
  subtotal?: number;
  discountAmount?: number;
  tax?: number;
  deliveryFee?: number;
  platformFee?: number;
  tip?: number;
  grandTotal?: number;
  paymentMethod?: string | null;
  paymentStatus?: string;
  customerName?: string | null;
  deliveryAddress?: {
    houseNumber?: string | null;
    building?: string | null;
    area?: string | null;
    street?: string | null;
    city?: string | null;
    pincode?: string | null;
    contactName?: string | null;
  } | null;
}

interface RawRestaurant {
  name?: string;
  phone?: string | null;
  address?: { street?: string; city?: string; state?: string; pincode?: string } | null;
  settings?: { gstNumber?: string | null } | null;
}

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

const joinLine = (parts: (string | null | undefined)[]) =>
  parts.map((p) => p?.trim()).filter((p) => p && p.toUpperCase() !== 'NA').join(', ') || null;

/** Orders placed before `charges` existed only stored the totals — rebuild the same rows. */
function legacyCharges(o: RawOrder): BillChargeLine[] {
  const row = (key: string, label: string, rupees: number): BillChargeLine => ({
    key,
    label,
    amountPaise: Math.round(rupees * 100),
    sublabel: null,
  });
  const rows = [row('item_total', 'Item total', num(o.subtotal))];
  if (num(o.discountAmount) > 0) rows.push(row('discount', 'Discount', -num(o.discountAmount)));
  if (num(o.tax) > 0) rows.push(row('tax', 'Taxes', num(o.tax)));
  if (num(o.deliveryFee) > 0) rows.push(row('delivery_fee', 'Delivery fee', num(o.deliveryFee)));
  if (num(o.platformFee) > 0) rows.push(row('platform_fee', 'Platform fee', num(o.platformFee)));
  if (num(o.tip) > 0) rows.push(row('tip', 'Delivery partner tip', num(o.tip)));
  rows.push(row('grand_total', 'To pay', num(o.grandTotal)));
  return rows;
}

/** Everything the bill shows for one of the signed-in customer's orders. */
export async function getOrderBill(orderId: string): Promise<BillData> {
  const { order } = await apiGet<{ order: RawOrder }>(`/api/orders/${orderId}`);
  const { restaurant } = await apiGet<{ restaurant: RawRestaurant }>(
    `/api/restaurants/${order.restaurantId}`,
  );

  const lines = order.charges?.lines;
  const charges: BillChargeLine[] = Array.isArray(lines)
    ? lines
        .filter((l) => typeof l?.key === 'string')
        .map((l) => ({
          key: l.key as string,
          label: l.label ?? (l.key as string),
          amountPaise: typeof l.amountPaise === 'number' ? l.amountPaise : null,
          sublabel: l.sublabel ?? null,
        }))
    : legacyCharges(order);

  const addr = order.deliveryAddress;
  const raddr = restaurant.address;

  return {
    orderId: String(order._id),
    placedAt: order.createdAt ?? null,
    status: order.status ?? 'placed',
    restaurant: {
      name: restaurant.name ?? 'Restaurant',
      addressLine: joinLine([raddr?.street, raddr?.city, raddr?.state, raddr?.pincode]),
      phone: restaurant.phone?.trim() || null,
      gstin: validGstin(restaurant.settings?.gstNumber),
    },
    customer: {
      name: addr?.contactName?.trim() || order.customerName?.trim() || null,
      addressLine: addr
        ? joinLine([addr.houseNumber, addr.building, addr.area, addr.street, addr.city, addr.pincode])
        : null,
    },
    items: (order.items ?? []).map((i) => ({
      name: i.name ?? 'Item',
      quantity: Math.max(1, num(i.quantity) || 1),
      unitPrice: num(i.price),
    })),
    charges,
    grandTotal: num(order.grandTotal),
    paymentMethod: order.paymentMethod ?? null,
    paymentStatus: order.paymentStatus ?? 'pending',
  };
}

/** Open the system print sheet for an order's bill. Resolves once the sheet is dismissed. */
export async function printOrderBill(orderId: string): Promise<void> {
  const bill = await getOrderBill(orderId);
  await Print.printAsync({ html: buildBillHtml(bill) });
}
