/**
 * Platform admin auth routes (server-manager)
 *
 * POST /api/auth/login   — authenticate against public.platform_admins
 * POST /api/auth/logout  — clear refresh cookie
 */

import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { signAccessToken, verifyPassword } from '@gadnuc/auth';
import { getPool } from '@gadnuc/db';

export const authRouter = Router();

const PLATFORM_TENANT_ID   = '00000000-0000-0000-0000-000000000000';
const PLATFORM_TENANT_SLUG = '__platform__';

const REFRESH_COOKIE_NAME = 'refresh_token';
const REFRESH_COOKIE_OPTS = {
  httpOnly: true,
  secure:   process.env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  maxAge:   30 * 24 * 60 * 60 * 1000,
  path:     '/api/auth',
};

// ── POST /api/auth/login ──────────────────────────────────────────────────────

const loginSchema = z.object({
  email:    z.string().email(),
  password: z.string().min(1),
});

authRouter.post('/login', async (req: Request, res: Response) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: 'Validation failed', issues: parsed.error.issues });
    return;
  }

  const { email, password } = parsed.data;

  try {
    const { rows } = await getPool().query<{
      id: string; email: string; display_name: string; password_hash: string;
    }>(
      `SELECT id, email, display_name, password_hash
       FROM public.platform_admins
       WHERE email = $1 AND is_active = true
       LIMIT 1`,
      [email],
    );

    const admin = rows[0] ?? null;

    // Constant-time: always verify even when user is missing
    const hashToCheck = admin?.password_hash ?? '$2a$12$invalidhashpadding000000000000000000000000000000000000000';
    const valid       = await verifyPassword(password, hashToCheck);

    if (!admin || !valid) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    const accessToken = await signAccessToken({
      sub:        admin.id,
      tenantId:   PLATFORM_TENANT_ID,
      tenantSlug: PLATFORM_TENANT_SLUG,
      role:       'super_admin',
      email:      admin.email,
    });

    // Update last login
    await getPool().query(
      'UPDATE public.platform_admins SET last_login_at = now(), updated_at = now() WHERE id = $1',
      [admin.id],
    ).catch(() => {});

    // Set access token as HttpOnly cookie so browser-side `credentials: 'include'`
    // works for subsequent requests (the cookie is forwarded by the proxy layer).
    res.cookie('access_token', accessToken, {
      httpOnly: true,
      secure:   process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge:   24 * 60 * 60 * 1000, // 1 day — matches JWT expiry
      path:     '/',
    });

    res.json({ access_token: accessToken, token_type: 'Bearer' });
  } catch (err) {
    console.error('[auth] platform login error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── POST /api/auth/logout ─────────────────────────────────────────────────────

authRouter.post('/logout', (_req: Request, res: Response) => {
  res.clearCookie(REFRESH_COOKIE_NAME, { httpOnly: true, sameSite: 'strict', path: '/api/auth' });
  res.clearCookie('access_token', { httpOnly: true, sameSite: 'strict', path: '/' });
  res.json({ message: 'Logged out' });
});
