/**
 * items.ts — single-dish fetcher for the customization screen.
 *
 * Endpoint (see yulo_backend/server/routes/item.routes.js):
 *   GET /api/items/:id → { item: { …MenuItem, effectivePrice, badges,
 *                          optionGroups[], category, restaurant, isFavorited? } }
 *
 * The wire shape is the raw MenuItem document plus its OptionGroup documents.
 * This module reshapes it into {@link ItemDetail}: option deltas are renamed
 * from `priceDeltaMinor` to `priceDelta` (they are plain rupees — see the type),
 * and every optional array/field is given a concrete default so the screen never
 * branches on `undefined`.
 */

import type { ItemDetail, ItemOption, ItemOptionGroup } from '../types/restaurant';
import { apiDelete, apiGet, apiPost } from './api';

// ─── Raw backend payload (only the fields we read) ────────────────────────

interface RawOption {
  _id: string;
  name: string;
  description?: string;
  priceDeltaMinor?: number;
  maxQty?: number;
  isDefaultSelected?: boolean;
}

interface RawOptionGroup {
  _id: string;
  title: string;
  type?: 'single_choice' | 'addons';
  required?: boolean;
  minSelect?: number;
  maxSelect?: number | null;
  options?: RawOption[];
}

interface RawItem {
  _id: string;
  restaurantId: string;
  name: string;
  description?: string;
  image?: string;
  foodType?: ItemDetail['foodType'];
  sellingPrice?: number;
  discountedPrice?: number | null;
  effectivePrice?: number;
  prepTime?: number;
  ingredients?: string[];
  badges?: string[];
  isAvailable?: boolean;
  isFavorited?: boolean;
  category?: { _id: string; name: string } | null;
  restaurant?: { _id: string; name: string; cuisineTypes?: string[] } | null;
  optionGroups?: RawOptionGroup[];
}

// ─── Reshape helpers ─────────────────────────────────────────────────────

function toOption(o: RawOption): ItemOption {
  return {
    _id: o._id,
    name: o.name,
    description: o.description,
    priceDelta: o.priceDeltaMinor ?? 0,
    maxQty: Math.max(1, o.maxQty ?? 1),
    isDefaultSelected: !!o.isDefaultSelected,
  };
}

function toOptionGroup(g: RawOptionGroup): ItemOptionGroup {
  return {
    _id: g._id,
    title: g.title,
    type: g.type === 'addons' ? 'addons' : 'single_choice',
    required: !!g.required,
    minSelect: g.minSelect ?? 0,
    maxSelect: g.maxSelect ?? null,
    options: (g.options ?? []).map(toOption),
  };
}

function toItemDetail(raw: RawItem): ItemDetail {
  const selling = raw.sellingPrice ?? 0;
  const discounted = raw.discountedPrice ?? undefined;
  return {
    _id: raw._id,
    restaurantId: String(raw.restaurantId),
    name: raw.name,
    description: raw.description,
    image: raw.image,
    foodType: raw.foodType ?? 'veg',
    sellingPrice: selling,
    discountedPrice: discounted,
    // Mirror the backend's `effectivePrice` virtual exactly — it is what the
    // cart charges. See the same note in src/services/home.ts.
    effectivePrice: raw.effectivePrice ?? discounted ?? selling,
    prepTime: raw.prepTime,
    ingredients: raw.ingredients ?? [],
    badges: raw.badges ?? [],
    isAvailable: raw.isAvailable ?? true,
    isFavorited: raw.isFavorited,
    category: raw.category ?? null,
    restaurant: raw.restaurant
      ? {
          _id: raw.restaurant._id,
          name: raw.restaurant.name,
          cuisineTypes: raw.restaurant.cuisineTypes ?? [],
        }
      : null,
    optionGroups: (raw.optionGroups ?? []).map(toOptionGroup),
  };
}

// ─── Public API ──────────────────────────────────────────────────────────

/** Fetch one dish with its customization groups. */
export async function fetchItem(id: string): Promise<ItemDetail> {
  const data = await apiGet<{ item: RawItem }>(`/api/items/${id}`);
  return toItemDetail(data.item);
}

/**
 * Turn a catalogue badge slug into a display label — `highly_reordered` →
 * "Highly reordered". Formats whatever the backend sends; no fixed list.
 */
export function formatBadge(slug: string): string {
  const words = slug.replace(/[_-]+/g, ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * Add / remove a dish from the customer's favorites (the "Save" button).
 * Both require a real customer token — a bypass session gets 401, which the
 * caller treats as "not signed in" and rolls its optimistic toggle back.
 * Endpoints: yulo_backend/server/routes/user.routes.js.
 */
export function favoriteItem(id: string): Promise<unknown> {
  return apiPost(`/api/users/me/favorites/items/${id}`);
}

export function unfavoriteItem(id: string): Promise<unknown> {
  return apiDelete(`/api/users/me/favorites/items/${id}`);
}

export function favoriteRestaurant(id: string): Promise<unknown> {
  return apiPost(`/api/users/me/favorites/restaurants/${id}`);
}

export function unfavoriteRestaurant(id: string): Promise<unknown> {
  return apiDelete(`/api/users/me/favorites/restaurants/${id}`);
}
