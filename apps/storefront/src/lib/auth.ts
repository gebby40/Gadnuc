/**
 * Client-side auth utilities for the Gadnuc storefront.
 *
 * Platform admins authenticate via server-manager (/api/auth/login).
 * Tenant users authenticate via inventory-server (/api/auth/login) with x-tenant-slug.
 */

const MANAGER_URL   = process.env.NEXT_PUBLIC_MANAGER_URL   ?? 'http://localhost:3002';
const INVENTORY_URL = process.env.NEXT_PUBLIC_INVENTORY_URL  ?? 'http://localhost:3001';

const AUTH_TOKEN_KEY = 'gadnuc_auth_token';
const AUTH_USER_KEY  = 'gadnuc_auth_user';

export interface AuthUser {
  userId: string;
  email: string;
  role: string;
  tenantSlug: string;
  tenantId: string;
  isWholesale?: boolean;
}

export interface LoginSuccess {
  access_token: string;
  token_type: string;
  tenant_slug?: string;
}

export interface MfaRequired {
  mfa_required: true;
  mfa_token: string;
  tenant_slug?: string;
}

export type LoginResult = LoginSuccess | MfaRequired;

function isMfaRequired(r: LoginResult): r is MfaRequired {
  return 'mfa_required' in r && r.mfa_required === true;
}

// ── Platform admin login (server-manager) ────────────────────────────────────

export async function platformLogin(email: string, password: string): Promise<LoginResult> {
  const res = await fetch(`${MANAGER_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? 'Login failed');
  }
  return res.json();
}

export async function platformLogout(): Promise<void> {
  await fetch(`${MANAGER_URL}/api/auth/logout`, {
    method: 'POST',
    credentials: 'include',
  }).catch(() => {});
  clearAuthState();
}

// ── Tenant user login (inventory-server) ─────────────────────────────────────

export async function tenantLogin(slug: string, email: string, password: string): Promise<LoginResult> {
  const res = await fetch(`${INVENTORY_URL}/api/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-tenant-slug': slug,
    },
    credentials: 'include',
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? 'Login failed');
  }
  return res.json();
}

export async function tenantLoginDiscover(email: string, password: string): Promise<LoginResult> {
  const res = await fetch(`${INVENTORY_URL}/api/auth/login-discover`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? 'Login failed');
  }
  return res.json();
}

export async function tenantMfaVerify(slug: string, mfaToken: string, totpCode: string): Promise<LoginResult> {
  const res = await fetch(`${INVENTORY_URL}/api/auth/mfa/verify`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-tenant-slug': slug,
    },
    credentials: 'include',
    body: JSON.stringify({ mfa_token: mfaToken, totp_code: totpCode }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? 'MFA verification failed');
  }
  return res.json();
}

export async function tenantLogout(slug: string): Promise<void> {
  await fetch(`${INVENTORY_URL}/api/auth/logout`, {
    method: 'POST',
    headers: { 'x-tenant-slug': slug },
    credentials: 'include',
  }).catch(() => {});
  clearAuthState();
}

// ── Customer auth (inventory-server) ─────────────────────────────────────────

export interface CustomerLoginSuccess {
  access_token: string;
  token_type: string;
  customer: {
    id: string;
    email: string;
    first_name: string | null;
    last_name: string | null;
  };
}

export async function customerLogin(slug: string, email: string, password: string): Promise<CustomerLoginSuccess> {
  const res = await fetch(`${INVENTORY_URL}/api/customers/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-tenant-slug': slug,
    },
    credentials: 'include',
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? 'Login failed');
  }
  return res.json();
}

export async function customerRegister(
  slug: string,
  data: { email: string; password: string; first_name?: string; last_name?: string },
): Promise<CustomerLoginSuccess> {
  const res = await fetch(`${INVENTORY_URL}/api/customers/register`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-tenant-slug': slug,
    },
    credentials: 'include',
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? 'Registration failed');
  }
  return res.json();
}

// ── Token decoding (client-side, no verification) ────────────────────────────

export function decodeTokenPayload(token: string): AuthUser | null {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return {
      userId:     payload.sub ?? payload.userId ?? '',
      email:      payload.email ?? '',
      role:       payload.role ?? '',
      tenantSlug: payload.tenantSlug ?? '',
      tenantId:   payload.tenantId ?? '',
      isWholesale: payload.isWholesale ?? false,
    };
  } catch {
    return null;
  }
}

// ── Local storage helpers ────────────────────────────────────────────────────

export function saveAuthState(token: string, user: AuthUser): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(AUTH_TOKEN_KEY, token);
  localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));
}

export function loadAuthState(): { token: string; user: AuthUser } | null {
  if (typeof window === 'undefined') return null;
  const token = localStorage.getItem(AUTH_TOKEN_KEY);
  const userJson = localStorage.getItem(AUTH_USER_KEY);
  if (!token || !userJson) return null;
  try {
    return { token, user: JSON.parse(userJson) };
  } catch {
    return null;
  }
}

export function clearAuthState(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(AUTH_TOKEN_KEY);
  localStorage.removeItem(AUTH_USER_KEY);
}

export { isMfaRequired };
