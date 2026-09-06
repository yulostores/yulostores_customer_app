/**
 * CartContext — the open cart, and the three ways a screen changes it.
 *
 * Deliberately local: this app has no cart endpoint yet, so the cart lives on
 * the device and is cached in AsyncStorage the same best-effort way as
 * {@link VegModeContext} — the in-memory state always wins immediately, the
 * disk write is fire-and-forget and a failure is logged, never surfaced.
 *
 * One restaurant per cart (standard for food delivery): adding a dish from a
 * different storefront starts the cart over rather than mixing kitchens. There
 * is no "discard this cart?" prompt yet because there is no add-to-cart surface
 * beyond the Home screen's demo wiring — when a real menu screen lands, that is
 * where the confirm dialog belongs.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react';
import { logger } from '../lib/logger';

const STORAGE_KEY = 'yulo.cart.v1';

export interface CartLine {
  itemId: string;
  name: string;
  /** Unit price in rupees, captured when the item was added to the cart. */
  price: number;
  qty: number;
}

export interface Cart {
  restaurantId: string;
  restaurantName: string;
  restaurantImage?: string;
  lines: CartLine[];
}

interface CartValue {
  /** The open cart, or `null` when nothing is in it. */
  cart: Cart | null;
  /** Total number of units across every line. */
  itemCount: number;
  /** Sum of `price * qty` across every line, in rupees. */
  subtotal: number;
  /** AsyncStorage read has finished — safe to trust `cart` as the real state. */
  hydrated: boolean;
  /**
   * Add `qty` (default 1) of a dish. Starts a fresh cart when there is none or
   * when the dish belongs to a different restaurant than the one already open.
   */
  addItem: (
    restaurant: { id: string; name: string; image?: string },
    item: { id: string; name: string; price: number },
    qty?: number,
  ) => void;
  /** Set an absolute quantity for a line; `0` (or less) removes it, and an
   *  emptied cart collapses back to `null`. */
  setQty: (itemId: string, qty: number) => void;
  /** Empty the cart. */
  clear: () => void;
}

const Ctx = createContext<CartValue | null>(null);

export function CartProvider({ children }: PropsWithChildren) {
  const [cart, setCart] = useState<Cart | null>(null);
  const [hydrated, setHydrated] = useState(false);

  // Hydrate the cached cart once on mount.
  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (!alive || !raw) return;
        const parsed = JSON.parse(raw) as Cart;
        if (parsed && Array.isArray(parsed.lines) && parsed.lines.length > 0) {
          setCart(parsed);
        }
      })
      .catch((err) => {
        logger.warn('cart', 'Could not read cached cart', {
          reason: err instanceof Error ? err.message : String(err),
        });
      })
      .finally(() => alive && setHydrated(true));
    return () => {
      alive = false;
    };
  }, []);

  // Mirror every change to disk, but only once the initial read is done so the
  // hydrate doesn't immediately write back what it just loaded.
  useEffect(() => {
    if (!hydrated) return;
    const task = cart
      ? AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(cart))
      : AsyncStorage.removeItem(STORAGE_KEY);
    task.catch((err) => {
      logger.warn('cart', 'Could not persist cart', {
        reason: err instanceof Error ? err.message : String(err),
      });
    });
  }, [cart, hydrated]);

  const addItem = useCallback<CartValue['addItem']>(
    (restaurant, item, qty = 1) => {
      setCart((prev) => {
        if (!prev || prev.restaurantId !== restaurant.id) {
          return {
            restaurantId: restaurant.id,
            restaurantName: restaurant.name,
            restaurantImage: restaurant.image,
            lines: [{ itemId: item.id, name: item.name, price: item.price, qty }],
          };
        }
        const idx = prev.lines.findIndex((l) => l.itemId === item.id);
        const lines =
          idx === -1
            ? [...prev.lines, { itemId: item.id, name: item.name, price: item.price, qty }]
            : prev.lines.map((l, i) => (i === idx ? { ...l, qty: l.qty + qty } : l));
        return { ...prev, lines };
      });
    },
    [],
  );

  const setQty = useCallback((itemId: string, qty: number) => {
    setCart((prev) => {
      if (!prev) return prev;
      const lines = prev.lines
        .map((l) => (l.itemId === itemId ? { ...l, qty } : l))
        .filter((l) => l.qty > 0);
      return lines.length > 0 ? { ...prev, lines } : null;
    });
  }, []);

  const clear = useCallback(() => setCart(null), []);

  const itemCount = useMemo(
    () => (cart ? cart.lines.reduce((n, l) => n + l.qty, 0) : 0),
    [cart],
  );
  const subtotal = useMemo(
    () => (cart ? cart.lines.reduce((sum, l) => sum + l.price * l.qty, 0) : 0),
    [cart],
  );

  const value = useMemo<CartValue>(
    () => ({ cart, itemCount, subtotal, hydrated, addItem, setQty, clear }),
    [cart, itemCount, subtotal, hydrated, addItem, setQty, clear],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCart(): CartValue {
  const ctx = useContext(Ctx);
  if (!ctx) {
    throw new Error('useCart must be used inside <CartProvider>');
  }
  return ctx;
}
