/// <reference types="node" />
/**
 * Unit tests for src/lib/confirmCore.ts against a mocked Alert — run with
 * `npm run test:confirm` (tsc compiles to node_modules/.cache, then `node --test`).
 * The "wired action" cases call the helpers exactly as the screens do (cart tab,
 * checkout Pay, tracking Retry payment, search history) with a spy as the API call.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  askConfirm,
  changeQtyWithConfirm,
  confirmCopy,
  confirmThen,
  type AlertFn,
  type ConfirmAlertButton,
  type ConfirmRequest,
} from '../confirmCore';

type Choice = 'confirm' | 'cancel' | 'dismiss';

/** A fake Alert.alert that records each dialog and answers it with `choice`. */
function mockAlert(choice: Choice) {
  const calls: { title: string; message: string; buttons: ConfirmAlertButton[] }[] = [];
  const alert: AlertFn = (title, message, buttons, options) => {
    calls.push({ title, message, buttons });
    if (choice === 'dismiss') options.onDismiss();
    else buttons.find((b) => (choice === 'cancel' ? b.style === 'cancel' : b.style !== 'cancel'))!.onPress();
  };
  const ask = (req: ConfirmRequest) => askConfirm(alert, req);
  return { alert, ask, calls };
}

function spy() {
  const calls: unknown[][] = [];
  const fn = (...args: unknown[]) => {
    calls.push(args);
    return Promise.resolve();
  };
  return { fn, calls };
}

describe('askConfirm', () => {
  it('resolves true only on the confirm button', async () => {
    assert.equal(await mockAlert('confirm').ask(confirmCopy.removeCartLine('Paneer Tikka')), true);
    assert.equal(await mockAlert('cancel').ask(confirmCopy.removeCartLine('Paneer Tikka')), false);
    assert.equal(await mockAlert('dismiss').ask(confirmCopy.removeCartLine('Paneer Tikka')), false);
  });

  it('shows two buttons: cancel + destructive for destructive actions', async () => {
    const m = mockAlert('cancel');
    await m.ask(confirmCopy.removeCartLine('Paneer Tikka'));
    assert.deepEqual(
      m.calls[0].buttons.map((b) => [b.text, b.style]),
      [
        ['Cancel', 'cancel'],
        ['Remove', 'destructive'],
      ],
    );
    assert.match(m.calls[0].message, /Paneer Tikka/);
  });

  it('settles once even if both callbacks fire', async () => {
    const alert: AlertFn = (_t, _m, buttons, options) => {
      buttons[1].onPress();
      buttons[0].onPress();
      options.onDismiss();
    };
    assert.equal(await askConfirm(alert, confirmCopy.retryPayment('₹482')), true);
  });
});

describe('cart / checkout line removal (changeQtyWithConfirm)', () => {
  it('quantity changes to 1+ apply without a dialog', async () => {
    const m = mockAlert('cancel');
    const api = spy();
    await changeQtyWithConfirm(m.ask, 'Dal Makhani', 2, api.fn);
    assert.equal(m.calls.length, 0);
    assert.deepEqual(api.calls, [[2]]);
  });

  it('going to 0 does not call the API when cancelled or dismissed', async () => {
    for (const choice of ['cancel', 'dismiss'] as const) {
      const m = mockAlert(choice);
      const api = spy();
      assert.equal(await changeQtyWithConfirm(m.ask, 'Dal Makhani', 0, api.fn), false);
      assert.equal(m.calls.length, 1);
      assert.equal(api.calls.length, 0);
    }
  });

  it('going to 0 calls the API once after confirm', async () => {
    const m = mockAlert('confirm');
    const api = spy();
    assert.equal(await changeQtyWithConfirm(m.ask, 'Dal Makhani', 0, api.fn), true);
    assert.deepEqual(api.calls, [[0]]);
    assert.equal(m.calls[0].message, 'Remove Dal Makhani from your cart?');
  });
});

describe('checkout Pay (confirmThen + payOrder copy)', () => {
  const online = confirmCopy.payOrder({ amount: '₹482', methodLabel: 'PhonePe UPI', cod: false, restaurantName: 'Spice Hut' });

  it('does not place/pay when cancelled', async () => {
    const pay = spy();
    assert.equal(await confirmThen(mockAlert('cancel').ask, online, pay.fn), false);
    assert.equal(pay.calls.length, 0);
  });

  it('pays once after confirm, naming amount and method', async () => {
    const m = mockAlert('confirm');
    const pay = spy();
    assert.equal(await confirmThen(m.ask, online, pay.fn), true);
    assert.equal(pay.calls.length, 1);
    assert.equal(m.calls[0].title, 'Pay ₹482 online?');
    assert.match(m.calls[0].message, /PhonePe UPI/);
    assert.equal(m.calls[0].buttons[1].text, 'Pay ₹482');
  });

  it('pay on delivery has its own copy', () => {
    const cod = confirmCopy.payOrder({ amount: '₹300', methodLabel: 'Pay on Delivery (Cash/UPI)', cod: true });
    assert.equal(cod.title, 'Place this order with pay on delivery?');
    assert.match(cod.message, /₹300/);
    assert.equal(cod.confirmText, 'Place order');
  });
});

describe('Retry payment (tracking + checkout)', () => {
  it('does not retry when cancelled, retries once on confirm', async () => {
    const retry = spy();
    await confirmThen(mockAlert('dismiss').ask, confirmCopy.retryPayment('₹482'), retry.fn);
    assert.equal(retry.calls.length, 0);
    await confirmThen(mockAlert('confirm').ask, confirmCopy.retryPayment('₹482'), retry.fn);
    assert.equal(retry.calls.length, 1);
  });
});

describe('Recent search removal', () => {
  it('only removes after confirm', async () => {
    const remove = spy();
    const req = confirmCopy.removeRecentSearch('biryani');
    await confirmThen(mockAlert('cancel').ask, req, remove.fn);
    assert.equal(remove.calls.length, 0);
    await confirmThen(mockAlert('confirm').ask, req, remove.fn);
    assert.equal(remove.calls.length, 1);
    assert.match(req.message, /biryani/);
  });
});
