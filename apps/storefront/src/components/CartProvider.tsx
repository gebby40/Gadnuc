'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useState,
  type ReactNode,
} from 'react';

// ── Types ─────────────────────────────────────────────────────────────────────
export interface CartItem {
  productId:      string;
  variantId?:     string;
  name:           string;
  priceCents:     number;
  imageUrl:       string | null;
  quantity:       number;
  variantLabel?:  string;  // e.g. "Red / Large"
}

/** Unique key for a cart line item (product + optional variant) */
function cartItemKey(item: { productId: string; variantId?: string }): string {
  return item.variantId ? `${item.productId}::${item.variantId}` : item.productId;
}

interface CartState {
  items: CartItem[];
}

type CartAction =
  | { type: 'ADD';    item: CartItem }
  | { type: 'REMOVE'; key: string }
  | { type: 'UPDATE'; key: string; quantity: number }
  | { type: 'CLEAR' }
  | { type: 'HYDRATE'; items: CartItem[] };

// ── Reducer ───────────────────────────────────────────────────────────────────
function cartReducer(state: CartState, action: CartAction): CartState {
  switch (action.type) {
    case 'HYDRATE':
      return { items: action.items };

    case 'ADD': {
      const key = cartItemKey(action.item);
      const existing = state.items.find((i) => cartItemKey(i) === key);
      if (existing) {
        return {
          items: state.items.map((i) =>
            cartItemKey(i) === key
              ? { ...i, quantity: i.quantity + action.item.quantity }
              : i,
          ),
        };
      }
      return { items: [...state.items, action.item] };
    }

    case 'REMOVE':
      return { items: state.items.filter((i) => cartItemKey(i) !== action.key) };

    case 'UPDATE':
      if (action.quantity <= 0) {
        return { items: state.items.filter((i) => cartItemKey(i) !== action.key) };
      }
      return {
        items: state.items.map((i) =>
          cartItemKey(i) === action.key ? { ...i, quantity: action.quantity } : i,
        ),
      };

    case 'CLEAR':
      return { items: [] };

    default:
      return state;
  }
}

// ── Context ───────────────────────────────────────────────────────────────────
interface CartContextValue {
  items:       CartItem[];
  totalItems:  number;
  totalCents:  number;
  addItem:     (item: CartItem) => void;
  removeItem:  (productId: string, variantId?: string) => void;
  updateQty:   (productId: string, quantity: number, variantId?: string) => void;
  clearCart:   () => void;
  drawerOpen:  boolean;
  openDrawer:  () => void;
  closeDrawer: () => void;
}

const CartContext = createContext<CartContextValue | null>(null);

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used inside CartProvider');
  return ctx;
}

const STORAGE_KEY = 'gadnuc_cart';

// ── Provider ──────────────────────────────────────────────────────────────────
export function CartProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(cartReducer, { items: [] });

  // Hydrate from localStorage on mount (client-only)
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const items: CartItem[] = JSON.parse(raw);
        if (Array.isArray(items)) {
          dispatch({ type: 'HYDRATE', items });
        }
      }
    } catch {
      // ignore parse errors
    }
  }, []);

  // Persist to localStorage on every state change
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state.items));
    } catch {
      // Storage full or SSR
    }
  }, [state.items]);

  const totalItems = state.items.reduce((sum, i) => sum + i.quantity, 0);
  const totalCents = state.items.reduce((sum, i) => sum + i.priceCents * i.quantity, 0);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const openDrawer  = useCallback(() => setDrawerOpen(true), []);
  const closeDrawer = useCallback(() => setDrawerOpen(false), []);

  const addItem    = useCallback((item: CartItem) => { dispatch({ type: 'ADD', item }); setDrawerOpen(true); }, []);
  const removeItem = useCallback((productId: string, variantId?: string) => dispatch({ type: 'REMOVE', key: cartItemKey({ productId, variantId }) }), []);
  const updateQty  = useCallback((productId: string, quantity: number, variantId?: string) => dispatch({ type: 'UPDATE', key: cartItemKey({ productId, variantId }), quantity }), []);
  const clearCart   = useCallback(() => dispatch({ type: 'CLEAR' }), []);

  const value = useMemo<CartContextValue>(() => ({
    items: state.items, totalItems, totalCents,
    addItem, removeItem, updateQty, clearCart,
    drawerOpen, openDrawer, closeDrawer,
  }), [state.items, totalItems, totalCents, addItem, removeItem, updateQty, clearCart, drawerOpen, openDrawer, closeDrawer]);

  return (
    <CartContext.Provider value={value}>
      {children}
    </CartContext.Provider>
  );
}
