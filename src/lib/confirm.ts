/**
 * confirm.ts — `confirmAction(req)`: a two-button `Alert.alert` that resolves `true` only
 * when the customer taps the confirm button. The logic and the copy live in ./confirmCore
 * (platform-free, unit-tested); this file only binds it to React Native.
 *
 *   if (!(await confirmAction(confirmCopy.removeCartLine(line.name)))) return;
 */

import { Alert, Platform } from 'react-native';
import { askConfirm, type AlertFn, type ConfirmRequest } from './confirmCore';

export { confirmCopy, confirmThen, changeQtyWithConfirm, type ConfirmRequest } from './confirmCore';

// react-native-web's Alert.alert renders nothing (and never calls back), so on web the
// browser's own confirm() stands in — otherwise the guarded action could never run there.
const webAlert: AlertFn = (title, message, buttons) => {
  const ok = typeof globalThis.confirm === 'function' ? globalThis.confirm(`${title}\n\n${message}`) : false;
  const button = buttons.find((b) => (ok ? b.style !== 'cancel' : b.style === 'cancel'));
  button?.onPress();
};

const nativeAlert: AlertFn = (title, message, buttons, options) =>
  Alert.alert(title, message, buttons, options);

export function confirmAction(req: ConfirmRequest): Promise<boolean> {
  return askConfirm(Platform.OS === 'web' ? webAlert : nativeAlert, req);
}
