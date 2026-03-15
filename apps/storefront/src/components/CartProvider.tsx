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
  name:           string;
  priceCents:     number;
  imageUrl:       string | null;
  quantity:       number;
}

interface CartState {
  items: CartItem[];
}

type CartAction =
  | { type: 'ADD';    item: CartItem }
  | { type: 'REMOVE'; productId: string }
  | { type: 'UPDATE'; productId: string; quantity: number }
  | { type: 'CLEAR' }
  | { type: 'HYDRATE'; items: CartItem[] };

// ── Reducer ───────────────────────────────────────────────────────────────────
function cartReducer(state: CartState, action: CartAction): CartState {
  switch (action.type) {
    case 'HYDRATE':
      return { items: action.items };

    case 'ADD': {
      const existing = state.items.find((i) => i.productId === action.item.productId);
      if (existing) {
        return {
          items: state.items.map((i) =>
            i.productId === action.item.productId
              ? { ...i, quantity: i.quantity + action.item.quantity }
              : i,
          ),
        };
      }
      return { items: [...state.items, action.item] };
    }

    case 'REMOVE':
      return { items: state.items.filter((i) => i.productId !== action.productId) };

    case 'UPDATE':
      if (action.quantity <= 0) {
        return { items: state.items.filter((i) => i.productId !== action.productId) };
      }
      return {
        items: state.items.map((i) =>
          i.productId === action.productId ? { ...i, quantity: action.quantity } : i,
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
  removeItem:  (productId: string) => void;
  updateQty:   (productId: string, quantity: number) => void;
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
  const removeItem = useCallback((id: string)     => dispatch({ type: 'REMOVE', productId: id }), []);
  const updateQty  = useCallback((id: string, q: number) => dispatch({ type: 'UPDATE', productId: id, quantity: q }), []);
  const clearCart   = useCallback(()               => dispatch({ type: 'CLEAR' }), []);

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
