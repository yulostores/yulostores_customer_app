/// <reference types="node" />
/**
 * Unit tests for src/lib/billHtml.ts — run with `npm run test:bill` (tsc compiles to
 * node_modules/.cache, then `node --test`). The bill must show the server's own figures,
 * never let order text break the page, and say plainly when an order was cancelled.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildBillHtml, shortOrderRef, validGstin, type BillData } from '../billHtml';

const base = (): BillData => ({
  orderId: '6ae2eb83a63339393326060e',
  placedAt: '2026-10-29T06:45:00.000Z',
  status: 'delivered',
  restaurant: {
    name: 'The Mirchi Resturent',
    addressLine: 'Paigoda Chowk, Hazaribagh, Jharkhand, 825301',
    phone: '7643041303',
    gstin: null,
  },
  customer: { name: 'Test Customer', addressLine: '12, New Forest Colony, Hazaribagh, 825301' },
  items: [
    { name: 'Panner Roll', quantity: 1, unitPrice: 135 },
    { name: 'Virgin Mojito', quantity: 2, unitPrice: 110 },
  ],
  charges: [
    { key: 'item_total', label: 'Item total', amountPaise: 35500, sublabel: null },
    { key: 'delivery_fee', label: 'Delivery fee', amountPaise: 378, sublabel: '0.4 km · incl. ₹0.58 GST' },
    { key: 'platform_fee', label: 'Platform fee', amountPaise: 1200, sublabel: 'incl. ₹1.83 GST' },
    { key: 'round_off', label: 'Round off', amountPaise: 22, sublabel: null },
    { key: 'grand_total', label: 'To pay', amountPaise: 37100, sublabel: null },
  ],
  grandTotal: 371,
  paymentMethod: 'online',
  paymentStatus: 'paid',
});

describe('buildBillHtml', () => {
  it('lists every item with its line amount and every server bill row', () => {
    const html = buildBillHtml(base());
    assert.match(html, /Panner Roll/);
    assert.match(html, /₹220\.00/, 'Virgin Mojito 2 × ₹110');
    assert.match(html, /Delivery fee<div class="sub">0\.4 km · incl\. ₹0\.58 GST<\/div>/);
    assert.match(html, /Platform fee/);
    assert.match(html, /<td>Total<\/td><td class="num">₹371\.00<\/td>/);
    assert.doesNotMatch(html, /To pay/, 'the grand total row is the Total line, not repeated');
    assert.match(html, /Paid · Online/);
    assert.match(html, /Order #3326060E/);
  });

  it('shows a discount as a negative amount', () => {
    const bill = base();
    bill.charges.splice(1, 0, { key: 'discount', label: 'Discount', amountPaise: -5000, sublabel: null });
    assert.match(buildBillHtml(bill), /Discount<\/td>\s*<td class="num">− ₹50\.00<\/td>/);
  });

  it('marks a cancelled, unpaid order clearly', () => {
    const bill = { ...base(), status: 'cancelled', paymentStatus: 'failed' };
    const html = buildBillHtml(bill);
    assert.match(html, /ORDER CANCELLED/);
    assert.match(html, /Payment failed — not charged/);
    assert.doesNotMatch(buildBillHtml(base()), /ORDER CANCELLED/);
  });

  it('describes cash on delivery and refunds', () => {
    assert.match(buildBillHtml({ ...base(), paymentMethod: 'cash', paymentStatus: 'pending_cod' }), /To be paid on delivery/);
    assert.match(buildBillHtml({ ...base(), paymentMethod: 'cash', paymentStatus: 'paid' }), /Paid · Cash on delivery/);
    assert.match(buildBillHtml({ ...base(), paymentStatus: 'refunded' }), /Refunded/);
  });

  it('escapes text from the order so it cannot break or inject into the page', () => {
    const bill = base();
    bill.items[0].name = '<script>alert(1)</script> & "Fries"';
    bill.customer.name = "O'Brien <b>";
    const html = buildBillHtml(bill);
    assert.doesNotMatch(html, /<script>alert/);
    assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt; &amp; &quot;Fries&quot;/);
    assert.match(html, /O&#39;Brien &lt;b&gt;/);
  });

  it('prints the GSTIN only when there is one', () => {
    assert.doesNotMatch(buildBillHtml(base()), /GSTIN/);
    const bill = base();
    bill.restaurant.gstin = '29AAPFU0939F1ZV';
    assert.match(buildBillHtml(bill), /GSTIN: 29AAPFU0939F1ZV/);
  });

  it('falls back to the order grand total when the rows have no total', () => {
    const bill = { ...base(), charges: base().charges.filter((c) => c.key !== 'grand_total') };
    assert.match(buildBillHtml(bill), /<td>Total<\/td><td class="num">₹371\.00<\/td>/);
  });
});

describe('validGstin', () => {
  it('accepts a well-formed GSTIN, case-insensitively', () => {
    assert.equal(validGstin('29AAPFU0939F1ZV'), '29AAPFU0939F1ZV');
    assert.equal(validGstin(' 29aapfu0939f1zv '), '29AAPFU0939F1ZV');
  });
  it('drops placeholders and junk', () => {
    for (const v of ['NA', '', null, undefined, 'N/A', '1234', '29AAPFU0939F1Z']) {
      assert.equal(validGstin(v), null, String(v));
    }
  });
});

describe('shortOrderRef', () => {
  it('is the last 8 characters, upper-cased', () => {
    assert.equal(shortOrderRef('6ae2eb83a63339393326060e'), '#3326060E');
  });
});
