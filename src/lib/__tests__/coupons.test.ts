/// <reference types="node" />
/**
 * Unit tests for the coupon list / detail logic — src/lib/coupons.ts, qrMatrix.ts and
 * demographics.ts. Run with `npm run test:coupons` (tsc compiles to node_modules/.cache, then
 * `node --test`). Fixtures are shaped as yulo_backend answers GET /api/users/me/coupons.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  COUPON_TABS,
  couponDetailState,
  couponListState,
  earnedTitle,
  expiryCountdown,
  formatCode,
  mapsUrl,
  telUrl,
  toCoupon,
  type RawCoupon,
} from '../coupons';
import { darkRuns, qrMatrix } from '../qrMatrix';
import {
  dobForInput,
  dobYmd,
  maskDobInput,
  parseDob,
  shouldAskDemographics,
  todayIst,
} from '../demographics';

const NOW = Date.parse('2026-11-13T06:30:00.000Z'); // 12:00 IST
const RAW: RawCoupon = {
  id: 'c1',
  code: 'KM4T7QXH2P',
  qrPayload: 'KM4T7QXH2P',
  title: '20% off any haircut',
  terms: 'One per visit',
  seller: {
    id: 's1',
    name: 'Glow Salon',
    address: '12 MG Road, Bengaluru, Karnataka, 560001',
    phone: '9811111111',
    location: { longitude: 77.59, latitude: 12.97 },
  },
  category: { id: 'k1', key: 'salon', name: 'Salon', icon: null },
  issuedAt: '2026-11-12T10:00:00.000Z',
  expiresAt: '2026-12-12T10:00:00.000Z',
  status: 'issued',
  redeemedAt: null,
  voidedAt: null,
};

describe('toCoupon', () => {
  it('maps every field the list and detail show', () => {
    const c = toCoupon(RAW, NOW);
    assert.equal(c.id, 'c1');
    assert.equal(c.qrPayload, 'KM4T7QXH2P');
    assert.equal(c.title, '20% off any haircut');
    assert.equal(c.sellerName, 'Glow Salon');
    assert.equal(c.sellerPhone, '9811111111');
    assert.deepEqual(c.sellerLocation, { latitude: 12.97, longitude: 77.59 });
    assert.equal(c.categoryName, 'Salon');
    assert.equal(c.status, 'issued');
  });

  it('an active coupon past its date shows as expired; missing bits get safe defaults', () => {
    assert.equal(toCoupon({ ...RAW, expiresAt: '2026-11-13T06:00:00.000Z' }, NOW).status, 'expired');
    const bare = toCoupon({ _id: 'x', code: 'ABC', status: 'weird' }, NOW);
    assert.equal(bare.id, 'x');
    assert.equal(bare.qrPayload, 'ABC'); // QR falls back to the code
    assert.equal(bare.title, 'Coupon');
    assert.equal(bare.sellerName, 'Partner shop');
    assert.equal(bare.sellerLocation, null);
    assert.equal(bare.status, 'issued');
  });

  it('tabs ask for issued / redeemed / expired', () => {
    assert.deepEqual(
      COUPON_TABS.map((t) => [t.label, t.status]),
      [
        ['Active', 'issued'],
        ['Used', 'redeemed'],
        ['Expired', 'expired'],
      ],
    );
  });
});

describe('expiryCountdown', () => {
  const at = (ms: number) => new Date(NOW + ms).toISOString();
  const H = 3_600_000;
  it('days, then hours and minutes in the last day (urgent), then seconds', () => {
    assert.deepEqual(expiryCountdown(at(12 * 24 * H + H), NOW), { text: 'Expires in 12 days', urgent: false, expired: false });
    assert.equal(expiryCountdown(at(24 * H + 3 * H), NOW).text, 'Expires in 1 day 3 h');
    assert.equal(expiryCountdown(at(24 * H), NOW).text, 'Expires in 1 day');
    assert.deepEqual(expiryCountdown(at(5 * H + 20 * 60_000), NOW), { text: 'Expires in 5 h 20 min', urgent: true, expired: false });
    assert.equal(expiryCountdown(at(2 * H), NOW).text, 'Expires in 2 h');
    assert.equal(expiryCountdown(at(45 * 60_000), NOW).text, 'Expires in 45 min');
    assert.equal(expiryCountdown(at(30_500), NOW).text, 'Expires in 31 s');
  });
  it('expired and unknown', () => {
    assert.deepEqual(expiryCountdown(at(0), NOW), { text: 'Expired', urgent: false, expired: true });
    assert.equal(expiryCountdown(null, NOW).text, 'No expiry date');
    assert.equal(expiryCountdown('garbage', NOW).text, 'No expiry date');
  });
});

describe('links and labels', () => {
  it('tap to call', () => {
    assert.equal(telUrl('98111 11111'), 'tel:9811111111');
    assert.equal(telUrl('+91 98111 11111'), 'tel:+919811111111');
    assert.equal(telUrl(null), null);
    assert.equal(telUrl('12'), null);
  });
  it('open map: by pin, else by address, else nothing', () => {
    const c = toCoupon(RAW, NOW);
    assert.equal(mapsUrl(c), 'https://www.google.com/maps/search/?api=1&query=12.97,77.59');
    assert.equal(
      mapsUrl({ ...c, sellerLocation: null }),
      'https://www.google.com/maps/search/?api=1&query=Glow%20Salon%2C%2012%20MG%20Road%2C%20Bengaluru%2C%20Karnataka%2C%20560001',
    );
    assert.equal(mapsUrl({ ...c, sellerLocation: null, sellerAddress: null }), null);
  });
  it('code grouping and the earned title', () => {
    // Same grouping as the shop's redeem screen (yulo_seller lib/couponCode.js).
    assert.equal(formatCode('KM4T7QXH2P'), 'KM4T7-QXH2P');
    assert.equal(formatCode('km4t7 qxh2p'.toUpperCase()), 'KM4T7-QXH2P');
    assert.equal(formatCode('ABCDE'), 'ABCDE');
    assert.equal(earnedTitle(1), 'You earned 1 coupon');
    assert.equal(earnedTitle(3), 'You earned 3 coupons');
  });
});

describe('qrMatrix', () => {
  it('a square QR with the three finder patterns', () => {
    const m = qrMatrix('KM4T7QXH2P');
    assert.equal(m.length, 21); // version 1
    assert.ok(m.every((row) => row.length === 21));
    // Finder pattern corners: a dark 7×7 ring at top-left, top-right, bottom-left.
    for (const [r, c] of [
      [0, 0],
      [0, 20],
      [20, 0],
      [3, 3],
      [3, 17],
      [17, 3],
    ]) assert.equal(m[r][c], true, `module ${r},${c}`);
    assert.equal(m[1][1], false);
    // Same text → same code; different text → different code.
    assert.deepEqual(qrMatrix('KM4T7QXH2P'), m);
    assert.notDeepEqual(qrMatrix('ABCDE23456'), m);
  });
  it('darkRuns covers exactly the dark modules', () => {
    assert.deepEqual(darkRuns([true, true, false, true, false, false, true]), [
      [0, 2],
      [3, 1],
      [6, 1],
    ]);
    assert.deepEqual(darkRuns([false, false]), []);
    const row = qrMatrix('KM4T7QXH2P')[0];
    const filled = new Set(darkRuns(row).flatMap(([s, n]) => Array.from({ length: n }, (_, i) => s + i)));
    row.forEach((dark, i) => assert.equal(filled.has(i), dark));
  });
});

describe('date of birth', () => {
  it('typing adds slashes; digits only', () => {
    assert.equal(maskDobInput('0'), '0');
    assert.equal(maskDobInput('010'), '01/0');
    assert.equal(maskDobInput('01/05/1998x77'), '01/05/1998');
  });
  it('parses DD/MM/YYYY with the server rules (real date, age 13–110 in India)', () => {
    assert.deepEqual(parseDob('01/05/1998', NOW), { ok: true, value: '1998-05-01' });
    assert.deepEqual(parseDob('', NOW), { ok: true, value: null });
    assert.deepEqual(parseDob('1/5/1998', NOW), { ok: false, error: 'Enter your date of birth as DD/MM/YYYY' });
    assert.deepEqual(parseDob('30/02/2001', NOW), { ok: false, error: 'Enter a real date of birth' });
    assert.deepEqual(parseDob('14/11/2013', NOW), { ok: false, error: 'Age must be between 13 and 110' }); // 13 tomorrow
    assert.deepEqual(parseDob('13/11/2013', NOW), { ok: true, value: '2013-11-13' }); // 13 today
    assert.deepEqual(parseDob('01/01/1900', NOW), { ok: false, error: 'Age must be between 13 and 110' });
  });
  it('the IST date rolls over at midnight India time', () => {
    assert.equal(todayIst(Date.parse('2026-11-13T18:29:00.000Z')), '2026-11-13');
    assert.equal(todayIst(Date.parse('2026-11-13T18:31:00.000Z')), '2026-11-14');
  });
  it('stored date ↔ input', () => {
    assert.equal(dobForInput('1998-05-01T00:00:00.000Z'), '01/05/1998');
    assert.equal(dobForInput(null), '');
    assert.equal(dobYmd('1998-05-01T00:00:00.000Z'), '1998-05-01');
    assert.equal(dobYmd(undefined), null);
  });
  it('the one-time prompt: only with a coupon, nothing given, never asked before', () => {
    const base = { hasCoupon: true, gender: null, dateOfBirth: null, alreadyAsked: false };
    assert.equal(shouldAskDemographics(base), true);
    assert.equal(shouldAskDemographics({ ...base, hasCoupon: false }), false);
    assert.equal(shouldAskDemographics({ ...base, alreadyAsked: true }), false);
    assert.equal(shouldAskDemographics({ ...base, gender: 'female' }), false);
    assert.equal(shouldAskDemographics({ ...base, dateOfBirth: '1998-05-01' }), false);
  });
});

describe('My Coupons screen states', () => {
  const base = { tab: 'active' as const, notSignedIn: false, isLoading: false, error: null, count: 2 };
  it('sign-in, loading, error, empty (per tab), list', () => {
    assert.deepEqual(couponListState({ ...base, notSignedIn: true }), { kind: 'sign-in' });
    assert.deepEqual(couponListState({ ...base, isLoading: true }), { kind: 'loading' });
    assert.deepEqual(couponListState({ ...base, count: 0, error: 'Server down' }), { kind: 'error', message: 'Server down' });
    assert.equal(couponListState({ ...base, count: 0 }).kind, 'empty');
    assert.deepEqual(couponListState({ ...base, tab: 'used', count: 0 }), {
      kind: 'empty',
      title: 'Nothing used yet',
      body: 'Coupons you use at a shop show up here.',
    });
    assert.deepEqual(couponListState(base), { kind: 'list' });
  });
  it('a failed refresh over a list on screen keeps the list', () => {
    assert.deepEqual(couponListState({ ...base, error: 'Server down' }), { kind: 'list' });
  });
});

describe('coupon detail screen states', () => {
  const c = toCoupon(RAW, NOW);
  const base = { coupon: c, isLoading: false, error: null, notFound: false };
  it('loading, not found, error', () => {
    assert.deepEqual(couponDetailState({ ...base, coupon: null, isLoading: true }, NOW), { kind: 'loading' });
    assert.deepEqual(couponDetailState({ ...base, coupon: null, notFound: true }, NOW), { kind: 'not-found' });
    assert.deepEqual(couponDetailState({ ...base, coupon: null, error: 'Server down' }, NOW), { kind: 'error', message: 'Server down' });
    assert.deepEqual(couponDetailState({ ...base, coupon: null }, NOW), { kind: 'error', message: 'Could not load this coupon.' });
  });
  it('active shows the QR and countdown; it turns expired when its time runs out on screen', () => {
    const s = couponDetailState(base, NOW);
    assert.equal(s.kind, 'active');
    assert.equal(s.kind === 'active' && s.countdown.text, 'Expires in 29 days');
    const later = couponDetailState(base, Date.parse('2026-12-12T10:00:01.000Z'));
    assert.equal(later.kind, 'done');
    assert.equal(later.kind === 'done' && later.label, 'Expired');
  });
  it('used and cancelled', () => {
    const used = couponDetailState({ ...base, coupon: { ...c, status: 'redeemed', redeemedAt: '2026-11-20T06:00:00.000Z' } }, NOW);
    assert.deepEqual(used, { kind: 'done', label: 'Used', line: 'Used on 20 Nov 2026' });
    const voided = couponDetailState({ ...base, coupon: { ...c, status: 'void' } }, NOW);
    assert.deepEqual(voided, { kind: 'done', label: 'Cancelled', line: 'Cancelled — the order was refunded' });
  });
});
