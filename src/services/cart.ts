/**
 * cart.ts — customer cart mutations.
 *
 * Endpoint (see yulo_backend/server/routes/cart.routes.js):
 *   POST /api/cart/items  { menuItemId, qty, selectedOptions: [{ optionId, qty? }] }
 *
 * The server re-prices and re-validates the selection against the item's
 * OptionGroup rules (`pricing.service.js`) — the client total is only a preview.
 * Requires a real customer token; a bypass session gets 401 and the caller
 * surfaces that.
 *
 * Known error codes from this endpoint:
 *   409 CART_RESTAURANT_CONFLICT — cart already holds items from another
 *       restaurant; `error` carries `{ currentRestaurantName }`.
 *   400 VALIDATION_ERROR         — selection breaks a group's min/max/qty rule.
 */

import { apiPost } from './api';

export interface CartOptionSelection {
  optionId: string;
  /** Only meaningful for `addons` options; omitted for single-choice. */
  qty?: number;
}

export interface AddToCartInput {
  menuItemId: string;
  qty: number;
  selectedOptions: CartOptionSelection[];
}

/**
 * Add one customized line to the cart. Resolves on success; throws `ApiError`
 * (from the shared api client) on any failure — callers branch on `.code` /
 * `.status`.
 */
export async function addItemToCart(input: AddToCartInput): Promise<void> {
  await apiPost('/api/cart/items', input);
}
