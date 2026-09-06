/**
 * itemPricing.ts — client-side mirror of the backend's `computeItemPrice`
 * (yulo_backend/server/services/pricing.service.js).
 *
 * The item screen needs a live total and a "can this be added?" check as the
 * customer taps options, without a round-trip per tap. The rules here match the
 * server's exactly; the server still re-validates and re-prices on
 * `POST /api/cart/items`, so this is a preview, never the source of truth.
 *
 * Selection state shape: `{ [groupId]: { [optionId]: qty } }`.
 *  - single_choice → the inner map holds 0 or 1 entry, always qty 1.
 *  - addons        → 0..N entries, each qty ≥ 1 (bounded by the option's maxQty).
 */

import type { ItemDetail, ItemOptionGroup } from '../types/restaurant';

export type Selections = Record<string, Record<string, number>>;

// ─── Seeding ─────────────────────────────────────────────────────────────

/**
 * Initial selection: honour each option's `isDefaultSelected`, and — matching
 * how Zomato/Swiggy open a required choice pre-filled — fall back to the first
 * option of a required single-choice group that declared no default.
 */
export function seedSelections(groups: ItemOptionGroup[]): Selections {
  const next: Selections = {};
  for (const group of groups) {
    const picked: Record<string, number> = {};
    if (group.type === 'single_choice') {
      const def = group.options.find((o) => o.isDefaultSelected);
      const chosen = def ?? (group.required ? group.options[0] : undefined);
      if (chosen) picked[chosen._id] = 1;
    } else {
      for (const o of group.options) {
        if (o.isDefaultSelected) picked[o._id] = 1;
      }
    }
    next[group._id] = picked;
  }
  return next;
}

// ─── Immutable updates ───────────────────────────────────────────────────

/** Pick one option in a single-choice group (replaces any current pick). */
export function selectSingle(
  selections: Selections,
  groupId: string,
  optionId: string,
): Selections {
  return { ...selections, [groupId]: { [optionId]: 1 } };
}

/** Add or remove one add-on option (quantity starts at 1). */
export function toggleAddon(
  selections: Selections,
  groupId: string,
  optionId: string,
): Selections {
  const group = { ...(selections[groupId] ?? {}) };
  if (group[optionId]) delete group[optionId];
  else group[optionId] = 1;
  return { ...selections, [groupId]: group };
}

/** Set an add-on option's quantity; `qty <= 0` removes it. */
export function setAddonQty(
  selections: Selections,
  groupId: string,
  optionId: string,
  qty: number,
): Selections {
  const group = { ...(selections[groupId] ?? {}) };
  if (qty <= 0) delete group[optionId];
  else group[optionId] = qty;
  return { ...selections, [groupId]: group };
}

// ─── Pricing & validation (mirror of pricing.service.js) ─────────────────

/** Per-unit price in rupees: base `effectivePrice` + Σ (option delta × qty). */
export function unitPrice(item: ItemDetail, selections: Selections): number {
  let total = item.effectivePrice;
  for (const group of item.optionGroups) {
    const picked = selections[group._id] ?? {};
    for (const [optionId, qty] of Object.entries(picked)) {
      const option = group.options.find((o) => o._id === optionId);
      if (!option) continue;
      const count = group.type === 'addons' ? qty : 1;
      total += option.priceDelta * count;
    }
  }
  return total;
}

/**
 * List every rule the current selection breaks — empty means it's ready to add.
 * Same bounds the server enforces: a required single-choice needs exactly one
 * pick; an add-ons group must sit within `minSelect`/`maxSelect`; each add-on's
 * quantity must be 1..`maxQty`.
 */
export function validateSelections(
  groups: ItemOptionGroup[],
  selections: Selections,
): string[] {
  const errors: string[] = [];
  for (const group of groups) {
    const picked = selections[group._id] ?? {};
    const count = Object.keys(picked).length;

    const min =
      group.type === 'single_choice' ? (group.required ? 1 : 0) : group.minSelect;
    const max = group.type === 'single_choice' ? 1 : group.maxSelect;

    if (count < min) {
      errors.push(
        group.type === 'single_choice'
          ? `Choose an option for "${group.title}"`
          : `"${group.title}" needs at least ${min} selection${min === 1 ? '' : 's'}`,
      );
    }
    if (max != null && count > max) {
      errors.push(`"${group.title}" allows at most ${max} selection${max === 1 ? '' : 's'}`);
    }

    for (const [optionId, qty] of Object.entries(picked)) {
      const option = group.options.find((o) => o._id === optionId);
      if (!option) {
        errors.push(`Unknown option in "${group.title}"`);
        continue;
      }
      const effectiveQty = group.type === 'addons' ? qty : 1;
      if (effectiveQty < 1 || effectiveQty > option.maxQty) {
        errors.push(`"${option.name}" quantity must be between 1 and ${option.maxQty}`);
      }
    }
  }
  return errors;
}

/** Flatten to the `selectedOptions` array `POST /api/cart/items` expects. */
export function toSelectedOptions(
  groups: ItemOptionGroup[],
  selections: Selections,
): { optionId: string; qty?: number }[] {
  const out: { optionId: string; qty?: number }[] = [];
  for (const group of groups) {
    const picked = selections[group._id] ?? {};
    for (const [optionId, qty] of Object.entries(picked)) {
      out.push(group.type === 'addons' ? { optionId, qty } : { optionId });
    }
  }
  return out;
}
