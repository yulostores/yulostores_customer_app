/// <reference types="node" />
/**
 * Unit tests for the personal-offer helpers — run with `npm run test:offers` (tsc compiles to
 * node_modules/.cache, then `node --test`), the same way as `npm run test:confirm`.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  initialOffersState,
  offerForRestaurant,
  offersReducer,
  type CustomerOffer,
  type OffersState,
} from '../offersReducer';
import { shouldMarkViewed, activityNoticeKey, arrivalText, countdownText, endsInText, offerValueText, rupees, shouldShowActivityNotice } from '../offerText';
import { toOffer, type RawCustomerOffer, type RawOfferReceived } from '../offerShape';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { addMoreText, isOfferErrorCode, offerErrorMessage, offerIssueText, OFFER_ERROR_MESSAGES } from '../offerErrors';
import { createSocketKeeper, createUserChannel, retryDelay, type JoinAck } from '../userChannelCore';

const NOW = Date.parse('2026-10-28T10:00:00Z');
const inMinutes = (m: number) => new Date(NOW + m * 60_000).toISOString();

function offer(id: string, overrides: Partial<CustomerOffer> = {}): CustomerOffer {
  return {
    id,
    restaurantId: `r-${id}`,
    restaurantName: 'Spice Garden',
    title: 'A treat',
    type: 'percentage',
    percentage: 15,
    flatAmount: null,
    maxDiscountAmount: 100,
    minimumOrderValue: 0,
    expiresAt: inMinutes(30),
    status: 'sent',
    receivedAt: NOW,
    ...overrides,
  };
}

const signedIn = (userId = 'u1'): OffersState => offersReducer(initialOffersState, { type: 'account', userId });
const ids = (s: OffersState) => s.offers.map((o) => o.id);

describe('offersReducer', () => {
  it('received: added newest first; an expired or closed one is not', () => {
    let s = signedIn();
    s = offersReducer(s, { type: 'received', userId: 'u1', offer: offer('a', { receivedAt: NOW }), now: NOW });
    s = offersReducer(s, { type: 'received', userId: 'u1', offer: offer('b', { receivedAt: NOW + 1 }), now: NOW });
    assert.deepEqual(ids(s), ['b', 'a']);
    const late = offersReducer(s, { type: 'received', userId: 'u1', offer: offer('c', { expiresAt: inMinutes(-1) }), now: NOW });
    assert.equal(late, s);
    const closed = offersReducer(s, { type: 'received', userId: 'u1', offer: offer('d', { status: 'revoked' }), now: NOW });
    assert.equal(closed, s);
  });

  it('updated: an open status moves; redeemed, expired and revoked remove it', () => {
    let s = signedIn();
    s = offersReducer(s, { type: 'loaded', userId: 'u1', offers: [offer('a'), offer('b'), offer('c'), offer('d')], now: NOW });
    s = offersReducer(s, { type: 'updated', userId: 'u1', offerId: 'a', status: 'applied' });
    assert.equal(s.offers.find((o) => o.id === 'a')?.status, 'applied');
    s = offersReducer(s, { type: 'updated', userId: 'u1', offerId: 'b', status: 'redeemed' });
    s = offersReducer(s, { type: 'updated', userId: 'u1', offerId: 'c', status: 'revoked' });
    s = offersReducer(s, { type: 'updated', userId: 'u1', offerId: 'd', status: 'expired' });
    assert.deepEqual(ids(s), ['a']);
    assert.equal(offersReducer(s, { type: 'updated', userId: 'u1', offerId: 'zzz', status: 'viewed' }), s);
  });

  it('tick: offers past their end leave', () => {
    let s = signedIn();
    s = offersReducer(s, { type: 'loaded', userId: 'u1', offers: [offer('a', { expiresAt: inMinutes(1) }), offer('b')], now: NOW });
    s = offersReducer(s, { type: 'tick', now: NOW + 61_000 });
    assert.deepEqual(ids(s), ['b']);
  });

  it('loaded: replaces the list, keeps only open unexpired offers, keeps first-seen order', () => {
    let s = signedIn();
    s = offersReducer(s, { type: 'received', userId: 'u1', offer: offer('a', { receivedAt: NOW - 5 }), now: NOW });
    s = offersReducer(s, {
      type: 'loaded',
      userId: 'u1',
      offers: [offer('a', { receivedAt: NOW + 100 }), offer('b', { receivedAt: NOW }), offer('c', { status: 'redeemed' }), offer('x', { expiresAt: inMinutes(-2) })],
      now: NOW,
    });
    assert.deepEqual(ids(s), ['b', 'a']);
  });

  it('a different account starts empty; events for another account are ignored; sign-out clears', () => {
    let s = signedIn('u1');
    s = offersReducer(s, { type: 'received', userId: 'u1', offer: offer('a'), now: NOW });
    const other = offersReducer(s, { type: 'account', userId: 'u2' });
    assert.deepEqual(other, { userId: 'u2', offers: [] });
    assert.equal(offersReducer(other, { type: 'received', userId: 'u1', offer: offer('late'), now: NOW }), other);
    assert.equal(offersReducer(other, { type: 'loaded', userId: 'u1', offers: [offer('late')], now: NOW }), other);
    assert.equal(offersReducer(s, { type: 'account', userId: 'u1' }), s, 'same account: unchanged');
    assert.deepEqual(offersReducer(s, { type: 'account', userId: null }), { userId: null, offers: [] });
  });

  it('cleared (sharing turned off) drops every offer', () => {
    let s = signedIn();
    s = offersReducer(s, { type: 'received', userId: 'u1', offer: offer('a'), now: NOW });
    assert.deepEqual(offersReducer(s, { type: 'cleared' }).offers, []);
  });

  it('offerForRestaurant', () => {
    let s = signedIn();
    s = offersReducer(s, { type: 'received', userId: 'u1', offer: offer('a', { restaurantId: 'r1' }), now: NOW });
    assert.equal(offerForRestaurant(s, 'r1')?.id, 'a');
    assert.equal(offerForRestaurant(s, 'r2'), null);
    assert.equal(offerForRestaurant(s, null), null);
  });
});

describe('countdown', () => {
  it('minutes, then seconds in the last minute, then Expired', () => {
    assert.equal(countdownText(60_000), '1 min');
    assert.equal(countdownText(59_000), '59 s');
    assert.equal(countdownText(59_001), '60 s');
    assert.equal(countdownText(1), '1 s');
    assert.equal(countdownText(0), 'Expired');
    assert.equal(countdownText(-5_000), 'Expired');
    assert.equal(countdownText(29 * 60_000 + 1), '30 min');
    assert.equal(countdownText(Number.NaN), 'Expired');
    assert.equal(endsInText(29 * 60_000), 'ends in 29 min');
    assert.equal(endsInText(0), 'Expired');
  });
});

describe('offer text', () => {
  it('values and the arrival line', () => {
    assert.equal(offerValueText({ type: 'percentage', percentage: 15, flatAmount: null, maxDiscountAmount: 100 }), '15% off (up to ₹100)');
    assert.equal(offerValueText({ type: 'flat_amount', percentage: null, flatAmount: 50, maxDiscountAmount: 50 }), '₹50 off');
    assert.equal(rupees(95.5), '₹95.50');
    assert.equal(arrivalText(offer('a', { expiresAt: inMinutes(29) }), NOW), 'Spice Garden sent you 15% off (up to ₹100) · ends in 29 min');
  });
});

describe('offer errors', () => {
  it('every code has its own words, and anything unknown a fallback', () => {
    const codes = ['OFFER_EXPIRED', 'OFFER_ALREADY_USED', 'DISCOUNT_MIN_VALUE', 'OFFER_NOT_APPLICABLE', 'OFFER_NOT_FOUND'];
    for (const code of codes) {
      assert.equal(offerErrorMessage(code), OFFER_ERROR_MESSAGES[code]);
      assert.ok(isOfferErrorCode(code), code);
    }
    assert.equal(new Set(codes.map(offerErrorMessage)).size, codes.length, 'each different');
    assert.equal(offerErrorMessage('SOMETHING_NEW'), 'This offer couldn’t be used right now. Please try again.');
    assert.equal(offerErrorMessage(undefined), offerErrorMessage('SOMETHING_NEW'));
    assert.equal(isOfferErrorCode('PRICE_CHANGED'), false);
  });

  it('"Add ₹X more" from shortfallPaise', () => {
    assert.equal(addMoreText(12000), 'Add ₹120 more');
    assert.equal(addMoreText(9950), 'Add ₹99.50 more');
    assert.equal(addMoreText(0), null);
    assert.equal(addMoreText(null), null);
    assert.equal(offerIssueText('DISCOUNT_MIN_VALUE', 12000), 'Add ₹120 more to use this offer');
    assert.equal(offerIssueText('DISCOUNT_MIN_VALUE', null), OFFER_ERROR_MESSAGES.DISCOUNT_MIN_VALUE);
    assert.equal(offerIssueText('OFFER_EXPIRED'), 'This offer has ended.');
    assert.equal(offerIssueText(null), null);
  });
});

describe('offer "viewed" (found in I1)', () => {
  it('only while the restaurant page is in front of the customer', () => {
    assert.equal(shouldMarkViewed({ hasOffer: true, screenFocused: true }), true);
    assert.equal(shouldMarkViewed({ hasOffer: true, screenFocused: false }), false, 'mounted under the cart');
    assert.equal(shouldMarkViewed({ hasOffer: false, screenFocused: true }), false);
  });
});

describe('activity notice', () => {
  const base = { liveActivityEnabled: true, signedIn: true, isGuest: false, noticeAt: null, shownLocally: false };
  it('shows once for a signed-in customer who has not seen it', () => {
    assert.equal(shouldShowActivityNotice(base), true);
    assert.equal(shouldShowActivityNotice({ ...base, noticeAt: '2026-10-28T09:00:00Z' }), false);
    assert.equal(shouldShowActivityNotice({ ...base, shownLocally: true }), false);
  });
  it('once per account: the on-device flag is kept per user', () => {
    assert.notEqual(activityNoticeKey('u1'), activityNoticeKey('u2'));
    assert.equal(activityNoticeKey('u1'), activityNoticeKey('u1'));
  });
  it('never for guests, signed-out users, before the preference loads, or with the feature off', () => {
    assert.equal(shouldShowActivityNotice({ ...base, isGuest: true }), false);
    assert.equal(shouldShowActivityNotice({ ...base, signedIn: false }), false);
    assert.equal(shouldShowActivityNotice({ ...base, noticeAt: undefined }), false);
    assert.equal(shouldShowActivityNotice({ ...base, liveActivityEnabled: false }), false);
  });
});

describe('socket keeper (shared with the tracking screen)', () => {
  const io = () => {
    const calls: string[] = [];
    return { calls, connect: () => calls.push('connect'), disconnect: () => calls.push('disconnect') };
  };

  it('backgrounding disconnects when nobody holds the socket, and foreground reconnects', () => {
    const fake = io();
    const keeper = createSocketKeeper(fake);
    keeper.background();
    keeper.foreground();
    assert.deepEqual(fake.calls, ['disconnect', 'connect']);
  });

  it('never disconnects while the tracking screen holds it; lets go once it unmounts in the background', () => {
    const fake = io();
    const keeper = createSocketKeeper(fake);
    const release = keeper.hold('tracking');
    keeper.background();
    assert.deepEqual(fake.calls, [], 'tracking keeps the socket');
    release();
    assert.deepEqual(fake.calls, ['disconnect']);
    keeper.foreground();
    assert.deepEqual(fake.calls, ['disconnect', 'connect']);
    release();
    assert.deepEqual(fake.calls, ['disconnect', 'connect'], 'a double release is harmless');
  });

  it('a screen that takes the socket while it is let go reconnects it', () => {
    const fake = io();
    const keeper = createSocketKeeper(fake);
    keeper.background();
    keeper.hold('tracking');
    assert.deepEqual(fake.calls, ['disconnect', 'connect']);
    assert.equal(keeper.isHeld(), true);
  });
});

describe('user channel (join_user)', () => {
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64');
  const jwt = (secondsLeft: number, tag: string) => `h.${b64({ exp: Math.floor(NOW / 1000) + secondsLeft, tag })}.s`;

  function harness(initialToken: string) {
    let token: string | undefined = initialToken;
    let connected = true;
    const timers: { fn: () => void; ms: number }[] = [];
    const joins: { token: string; ack: (r: JoinAck) => void }[] = [];
    const acks: string[] = [];
    let refreshes = 0;
    let reconnects = 0;
    const states: string[] = [];
    const channel = createUserChannel({
      emitJoin: (t, ack) => joins.push({ token: t, ack }),
      emitAck: (id) => acks.push(id),
      isConnected: () => connected,
      reconnect: () => {
        reconnects += 1;
      },
      getToken: () => token,
      refresh: async () => {
        refreshes += 1;
        token = jwt(900, `refreshed-${refreshes}`);
        return token;
      },
      now: () => NOW,
      decode: (s) => Buffer.from(s, 'base64').toString('utf8'),
      random: () => 0.5,
      setTimer: (fn, ms) => {
        timers.push({ fn, ms });
        return timers.length - 1;
      },
      clearTimer: () => undefined,
      onState: (s) => states.push(s),
    });
    return {
      channel,
      joins,
      acks,
      timers,
      states,
      get refreshes() {
        return refreshes;
      },
      get reconnects() {
        return reconnects;
      },
      setConnected: (c: boolean) => {
        connected = c;
      },
    };
  }

  it('joins with the current token on connect', async () => {
    const h = harness(jwt(600, 'fresh'));
    await h.channel.onConnect();
    assert.equal(h.joins.length, 1);
    assert.equal(h.refreshes, 0);
    h.joins[0].ack({ ok: true });
    assert.equal(h.channel.isJoined(), true);
  });

  it('refreshes a token about to expire before joining', async () => {
    const h = harness(jwt(20, 'expiring'));
    await h.channel.onConnect();
    assert.equal(h.refreshes, 1);
    assert.match(Buffer.from(h.joins[0].token.split('.')[1], 'base64').toString(), /refreshed-1/);
  });

  it('a refused join refreshes and retries with backoff (2 s, then 4 s); GUEST stops', async () => {
    const h = harness(jwt(600, 'fresh'));
    await h.channel.onConnect();
    h.joins[0].ack({ ok: false, code: 'UNAUTHORIZED' });
    h.setConnected(false);
    h.channel.onDisconnect('io server disconnect');
    assert.deepEqual(h.timers.map((t) => t.ms), [2_000]);
    assert.ok(h.refreshes >= 1);
    h.timers[0].fn();
    assert.equal(h.reconnects, 1, 'reconnects the socket the server closed');

    h.setConnected(true);
    await h.channel.onConnect();
    h.joins[1].ack({ ok: false, code: 'UNAUTHORIZED' });
    assert.deepEqual(h.timers.map((t) => t.ms), [2_000, 4_000]);

    h.timers[1].fn();
    await new Promise((r) => setImmediate(r));
    h.joins[2].ack({ ok: false, code: 'GUEST' });
    h.channel.onDisconnect('io server disconnect');
    assert.equal(h.timers.length, 2, 'no retry after GUEST');
    assert.equal(h.states[h.states.length - 1], 'stopped');
  });

  it('offer_ack once per offer, only while joined; reset forgets', async () => {
    const h = harness(jwt(600, 'fresh'));
    h.channel.ackOnce('o1');
    assert.deepEqual(h.acks, [], 'not joined yet');
    await h.channel.onConnect();
    h.joins[0].ack({ ok: true });
    h.channel.ackOnce('o1');
    h.channel.ackOnce('o1');
    h.channel.ackOnce('o2');
    assert.deepEqual(h.acks, ['o1', 'o2']);
    h.channel.reset();
    assert.equal(h.channel.isJoined(), false);
  });

  it('retryDelay caps at 60 s with ±20 % jitter', () => {
    assert.equal(retryDelay(0, () => 0.5), 2_000);
    assert.equal(retryDelay(9, () => 0.5), 60_000);
    assert.equal(retryDelay(0, () => 0), 1_600);
    assert.equal(retryDelay(0, () => 1), 2_400);
  });
});

// ─── Contract with the backend (FT) ─────────────────────────────────────────
// The backend's captured payloads (yulo_backend/docs/live-fixtures — its e2e test fails if they
// drift from the API), copied into __tests__/fixtures/live. Ids are "<id>", dates "<date>".

const fixture = (name: string) =>
  JSON.parse(readFileSync(join(process.cwd(), 'src/lib/__tests__/fixtures/live', `${name}.json`), 'utf8'));
const realDates = (value: unknown) => JSON.parse(JSON.stringify(value).replace(/<date>/g, inMinutes(30)));

describe('contract: what the app reads exists in the API', () => {
  it('GET /api/offers/mine → CustomerOffer', () => {
    const raw = realDates(fixture('customer-offers-mine').data.offers[0]) as RawCustomerOffer;
    const offer = toOffer(raw, NOW, 'delivered');
    assert.equal(offer.id, '<id>');
    assert.equal(offer.restaurantId, '<id>');
    assert.equal(offer.restaurantName, 'Spice Route');
    assert.equal(offer.title, 'A treat for you');
    assert.equal(offer.type, 'percentage');
    assert.equal(offer.percentage, 15);
    assert.equal(offer.maxDiscountAmount, 100);
    assert.equal(offer.status, 'delivered');
    assert.ok(Date.parse(offer.expiresAt) > NOW);
  });

  it('socket offer_received → CustomerOffer', () => {
    const raw = realDates(fixture('socket-offer_received')) as RawOfferReceived;
    const offer = toOffer(raw, NOW, 'sent');
    assert.equal(offer.id, '<id>');
    assert.equal(offer.restaurantName, 'Spice Route');
    assert.equal(offer.status, 'sent');
    assert.ok(Date.parse(offer.expiresAt) > NOW, 'endDate read as the expiry');
    assert.equal(arrivalText(offer, NOW), 'Spice Route sent you 15% off (up to ₹100) · ends in 30 min');
  });

  it('socket offer_updated (customer) carries offerId + offerStatus, no sessionId', () => {
    const update = fixture('socket-offer_updated-customer');
    assert.equal(typeof update.offerId, 'string');
    assert.equal(typeof update.offerStatus, 'string');
    assert.equal('sessionId' in update, false);
  });

  it('cart responses carry appliedDiscountId, and bill.offerIssue when an offer stopped applying', () => {
    for (const name of ['customer-cart-apply-offer', 'customer-cart-remove-offer', 'customer-cart-offer-issue']) {
      const { cart, bill } = fixture(name).data;
      assert.ok('appliedDiscountId' in cart, name);
      assert.equal(typeof bill.discountAmount, 'number', name);
      assert.equal(typeof bill.charges.grandTotal, 'number', name);
    }
    assert.equal(fixture('customer-cart-offer-issue').data.bill.offerIssue, 'OFFER_ALREADY_USED');
    assert.equal(fixture('customer-cart-apply-offer').data.bill.offerIssue, undefined, 'absent while it applies');
  });

  it('error bodies use codes the app maps', () => {
    for (const name of ['error-offer-already-used', 'error-apply-offer']) {
      const body = fixture(name);
      assert.ok(isOfferErrorCode(body.code), `${name}: ${body.code}`);
      assert.notEqual(offerErrorMessage(body.code), offerErrorMessage('UNKNOWN'));
    }
  });

  it('join_user acks: ok, and the refusal codes the channel stops on', () => {
    const acks = fixture('socket-acks');
    assert.deepEqual(acks.join_user, { ok: true });
    assert.deepEqual(acks.join_user_refused, { ok: false, code: 'GUEST' });
  });
});
