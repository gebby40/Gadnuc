/**
 * Slug-less tenant login — allows users to log in with just email + password.
 *
 * Mounted BEFORE the tenant middleware so it doesn't require x-tenant-slug.
 * Queries all active/trialing tenant schemas to find the matching user.
 */

import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { getPool, withTenantSchema } from '@gadnuc/db';
import { signAccessToken, verifyPassword } from '@gadnuc/auth';
import {
  generateRefreshToken,
  storeRefreshToken,
} from '../services/token-store.js';
import {
  createMfaSession,
} from '../services/mfa-session.js';
import { asyncHandler } from '../middleware/error-handler.js';

export const authDiscoverRouter = Router();

const loginSchema = z.object({
  email:    z.string().email(),
  password: z.string().min(1),
});

const REFRESH_COOKIE_NAME = 'refresh_token';

authDiscoverRouter.post('/login-discover', asyncHandler(async (req: Request, res: Response) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: 'Validation failed', issues: parsed.error.issues });
    return;
  }

  const { email, password } = parsed.data;

  // 1. Get all tenant slugs with active/trialing status and ready schema
  const pool = getPool();
  const { rows: tenants } = await pool.query<{ id: string; slug: string }>(
    `SELECT id, slug FROM public.tenants
     WHERE status IN ('trialing', 'active')
       AND provisioning_state = 'ready'
     ORDER BY created_at DESC`,
  );

  // 2. Search each tenant schema for the email
  let foundUser: {
    id: string; email: string; username: string; role: string;
    password_hash: string; totp_secret: string | null;
  } | null = null;
  let foundTenant: { id: string; slug: string } | null = null;

  for (const tenant of tenants) {
    try {
      const user = await withTenantSchema(tenant.slug, async (db) => {
        const { rows } = await db.query<{
          id: string; email: string; username: string; role: string;
          password_hash: string; totp_secret: string | null;
        }>(
          `SELECT id, email, username, role, password_hash, totp_secret
           FROM users WHERE email = $1 AND is_active = true LIMIT 1`,
          [email],
        );
        return rows[0] ?? null;
      });

      if (user) {
        foundUser = user;
        foundTenant = tenant;
        break;
      }
    } catch {
      // Schema may be broken — skip silently
    }
  }

  // 3. Constant-time verify even when not found
  const hashToCheck = foundUser?.password_hash
    ?? '$2a$12$invalidhashpadding000000000000000000000000000000000000000';
  const valid = await verifyPassword(password, hashToCheck);

  if (!foundUser || !foundTenant || !valid) {
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }

  // 4. MFA check
  if (foundUser.totp_secret) {
    const mfaToken = await createMfaSession({
      userId:     foundUser.id,
      tenantId:   foundTenant.id,
      tenantSlug: foundTenant.slug,
    });
    res.json({ mfa_required: true, mfa_token: mfaToken, tenant_slug: foundTenant.slug });
    return;
  }

  // 5. Issue tokens
  const accessToken = await signAccessToken({
    userId: foundUser.id, tenantId: foundTenant.id,
    tenantSlug: foundTenant.slug, role: foundUser.role,
  });
  const refreshToken = generateRefreshToken();
  await storeRefreshToken({ token: refreshToken, userId: foundUser.id, tenantId: foundTenant.id });

  res.cookie(REFRESH_COOKIE_NAME, refreshToken, {
    httpOnly: true,
    secure:   process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge:   30 * 24 * 60 * 60 * 1000,
    path:     '/api/auth',
  });

  res.json({
    access_token: accessToken,
    token_type:   'Bearer',
    tenant_slug:  foundTenant.slug,
  });
}));
