/**
 * confirmCore.ts — the platform-free half of the confirmation prompts for irreversible and
 * money-moving actions (paying, retrying a payment, removing a cart line, forgetting a
 * recent search). It has no imports on purpose: the alert function is injected, so the
 * logic runs under Node's test runner against a mocked Alert (see __tests__/confirm.test.ts).
 * Screens use the React Native wiring in ./confirm.ts.
 *
 * Same dialog shape as the existing `Alert.alert` confirms (empty cart, log out, cancel
 * order): two buttons, a 'cancel' one and a 'destructive' one for destructive actions
 * (plain 'default' for paying, which isn't destructive).
 */

export interface ConfirmAlertButton {
  text: string;
  style: 'default' | 'cancel' | 'destructive';
  onPress: () => void;
}

export interface ConfirmAlertOptions {
  cancelable: boolean;
  onDismiss: () => void;
}

/** The subset of React Native's `Alert.alert` signature this module calls. */
export type AlertFn = (
  title: string,
  message: string,
  buttons: ConfirmAlertButton[],
  options: ConfirmAlertOptions,
) => void;

export interface ConfirmRequest {
  title: string;
  message: string;
  /** Label of the button that goes ahead, e.g. "Remove" or "Pay ₹482". */
  confirmText: string;
  /** Label of the button that backs out — "Cancel" by default. */
  cancelText?: string;
  /** Red confirm button (style 'destructive'); 'default' otherwise. */
  destructive?: boolean;
}

/** Asks for confirmation; a function returning true only when the customer confirmed. */
export type Ask = (req: ConfirmRequest) => Promise<boolean>;

/**
 * Shows a two-button alert and resolves `true` only when the confirm button is pressed —
 * `false` on the cancel button or when the dialog is dismissed (Android back / tap outside).
 * Settles exactly once.
 */
export function askConfirm(alert: AlertFn, req: ConfirmRequest): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    let settled = false;
    const settle = (value: boolean) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    alert(
      req.title,
      req.message,
      [
        { text: req.cancelText ?? 'Cancel', style: 'cancel', onPress: () => settle(false) },
        {
          text: req.confirmText,
          style: req.destructive ? 'destructive' : 'default',
          onPress: () => settle(true),
        },
      ],
      { cancelable: true, onDismiss: () => settle(false) },
    );
  });
}

/** Runs `action` only after the customer confirms; resolves whether it ran. */
export async function confirmThen(
  ask: Ask,
  req: ConfirmRequest,
  action: () => unknown,
): Promise<boolean> {
  if (!(await ask(req))) return false;
  await action();
  return true;
}

/**
 * A quantity stepper change: going up or down to 1+ applies at once (routine, one tap);
 * reaching 0 removes the line, so that asks first. Resolves whether `apply` ran.
 */
export async function changeQtyWithConfirm(
  ask: Ask,
  dishName: string,
  next: number,
  apply: (qty: number) => unknown,
): Promise<boolean> {
  if (next > 0) {
    await apply(next);
    return true;
  }
  return confirmThen(ask, confirmCopy.removeCartLine(dishName), () => apply(next));
}

// ─── Copy ───────────────────────────────────────────────────────────────

export const confirmCopy = {
  removeCartLine(dishName: string): ConfirmRequest {
    return {
      title: 'Remove item?',
      message: `Remove ${dishName || 'this item'} from your cart?`,
      confirmText: 'Remove',
      destructive: true,
    };
  },

  /** Placing (and, for an online method, paying for) the order on the checkout screen. */
  payOrder({
    amount,
    methodLabel,
    cod,
    restaurantName,
  }: {
    /** Already formatted, e.g. "₹482". */
    amount: string;
    methodLabel: string;
    cod: boolean;
    restaurantName?: string | null;
  }): ConfirmRequest {
    const from = restaurantName ? ` from ${restaurantName}` : '';
    if (cod) {
      return {
        title: 'Place this order with pay on delivery?',
        message: `Your order${from} comes to ${amount}. You’ll pay when it arrives (${methodLabel}).`,
        confirmText: 'Place order',
      };
    }
    return {
      title: `Pay ${amount} online?`,
      message: `You’ll pay ${amount} with ${methodLabel} for your order${from}.`,
      confirmText: `Pay ${amount}`,
    };
  },

  /** Paying again for an order that was placed but not paid. */
  retryPayment(amount: string): ConfirmRequest {
    return {
      title: `Pay ${amount} now?`,
      message: `This retries the payment of ${amount} for your order.`,
      confirmText: `Pay ${amount}`,
    };
  },

  removeRecentSearch(query: string): ConfirmRequest {
    return {
      title: 'Remove from recent searches?',
      message: `“${query}” will be removed from your search history.`,
      confirmText: 'Remove',
      destructive: true,
    };
  },
};
