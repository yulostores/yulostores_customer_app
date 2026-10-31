/// <reference types="node" />
/**
 * Unit tests for src/lib/billHtml.ts — run with `npm run test:bill` (tsc compiles to
 * node_modules/.cache, then `node --test`). The bill's wording and money formatting, as the
 * in-app bill screen shows them.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  formatPaise,
  formatPlacedAt,
  formatRupees,
  paymentLine,
  shortOrderRef,
  validGstin,
  type BillData,
} from '../billHtml';

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

describe('bill wording', () => {
  it('describes how the order was paid', () => {
    assert.equal(paymentLine('online', 'paid'), 'Paid · Online');
    assert.equal(paymentLine('cash', 'paid'), 'Paid · Cash on delivery');
    assert.equal(paymentLine('cash', 'pending_cod'), 'To be paid on delivery');
    assert.equal(paymentLine('online', 'refunded'), 'Refunded');
    assert.equal(paymentLine('online', 'failed'), 'Payment failed — not charged');
  });

  it('formats money the way the server meant it, discounts negative', () => {
    assert.equal(formatRupees(1234), '₹1,234.00');
    assert.equal(formatPaise(37100), '₹371.00');
    assert.equal(formatPaise(-4800), '− ₹48.00');
    assert.equal(formatPaise(22), '₹0.22');
  });

  it('dates the bill in India time, and drops a bad date', () => {
    assert.match(formatPlacedAt(base().placedAt) ?? '', /29 Oct 2026/);
    assert.equal(formatPlacedAt(null), null);
    assert.equal(formatPlacedAt('not a date'), null);
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
  it('is the last 6 characters, upper-cased', () => {
    assert.equal(shortOrderRef('6ae2eb83a63339393326060e'), '#26060E');
  });
});
