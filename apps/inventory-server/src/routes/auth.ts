/**
 * Auth routes — Phase 1 complete implementation
 *
 * POST /api/auth/login           — password auth; returns tokens or mfa_required
 * POST /api/auth/mfa/verify      — complete MFA step
 * POST /api/auth/mfa/setup       — generate TOTP secret + QR URI (requires auth)
 * POST /api/auth/mfa/setup/confirm — activate MFA after user scans QR
 * POST /api/auth/mfa/disable     — disable MFA (requires auth + valid TOTP)
 * POST /api/auth/refresh         — rotate refresh token
 * POST /api/auth/logout          — revoke refresh token
 */

import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { withTenantSchema, getPool } from '@gadnuc/db';
import {
  signAccessToken,
  signRefreshToken,
  requireAuth,
  verifyPassword,
  generateTotpSecret,
  getTotpQrUri,
  verifyTotpToken,
  encryptTotpSecret,
  decryptTotpSecret,
} from '@gadnuc/auth';
import {
  generateRefreshToken,
  storeRefreshToken,
  rotateRefreshToken,
  revokeRefreshToken,
} from '../services/token-store.js';
import {
  createMfaSession,
  getMfaSession,
  deleteMfaSession,
} from '../services/mfa-session.js';
import { logAuditEvent } from '../middleware/audit.js';

export const authRouter = Router();

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const REFRESH_COOKIE_NAME = 'refresh_token';
const REFRESH_COOKIE_OPTS = {
  httpOnly: true,
  secure:   process.env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  maxAge:   30 * 24 * 60 * 60 * 1000, // 30 days in ms
};

function setRefreshCookie(res: Response, token: string) {
  res.cookie(REFRESH_COOKIE_NAME, token, REFRESH_COOKIE_OPTS);
}

function clearRefreshCookie(res: Response) {
  res.clearCookie(REFRESH_COOKIE_NAME, { httpOnly: true, sameSite: 'strict' });
}

async function issueTokenPair(
  res:      Response,
  user:     { id: number; email: string; username: string; role: string },
  tenantId: number,
  tenantSlug: string,
) {
  const accessToken   = await signAccessToken({ userId: user.id, tenantId, tenantSlug, role: user.role });
  const refreshToken  = generateRefreshToken();
  await storeRefreshToken({ token: refreshToken, userId: user.id, tenantId });
  setRefreshCookie(res, refreshToken);
  return { accessToken };
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/auth/login
// ─────────────────────────────────────────────────────────────────────────────

const loginSchema = z.object({
  email:    z.string().email(),
  password: z.string().min(1),
});

authRouter.post('/login', async (req: Request, res: Response) => {
  const tenant = (req as any).tenant as { id: number; slug: string } | undefined;
  if (!tenant) { res.status(400).json({ error: 'Tenant not resolved' }); return; }

  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: 'Validation failed', issues: parsed.error.issues });
    return;
  }

  const { email, password } = parsed.data;

  try {
    const user = await withTenantSchema(tenant.slug, async (db) => {
      const { rows } = await db.query(
        `SELECT id, email, username, role, password_hash, totp_secret
         FROM users WHERE email = $1 AND is_active = true LIMIT 1`,
        [email],
      );
      return rows[0] ?? null;
    });

    // Constant-time: always verify even when user is missing (dummy hash)
    const hashToCheck = user?.password_hash ?? '$2a$12$invalidhashpadding000000000000000000000000000000000000000';
    const valid       = await verifyPassword(password, hashToCheck);

    if (!user || !valid) {
      logAuditEvent({ req, action: 'auth.login_failed', tenantId: tenant.id, userId: null, metadata: { email } });
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    if (user.totp_secret) {
      // MFA required — create short-lived session
      const mfaToken = await createMfaSession({
        userId:     user.id,
        tenantId:   tenant.id,
        tenantSlug: tenant.slug,
      });
      logAuditEvent({ req, action: 'auth.mfa_required', tenantId: tenant.id, userId: user.id });
      res.json({ mfa_required: true, mfa_token: mfaToken });
      return;
    }

    const { accessToken } = await issueTokenPair(res, user, tenant.id, tenant.slug);
    logAuditEvent({ req, action: 'auth.login', tenantId: tenant.id, userId: user.id });
    res.json({ access_token: accessToken, token_type: 'Bearer' });
  } catch (err) {
    console.error('[auth] login error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/auth/mfa/verify
// ─────────────────────────────────────────────────────────────────────────────

const mfaVerifySchema = z.object({
  mfa_token: z.string().uuid(),
  totp_code: z.string().length(6),
});

authRouter.post('/mfa/verify', async (req: Request, res: Response) => {
  const tenant = (req as any).tenant as { id: number; slug: string } | undefined;
  if (!tenant) { res.status(400).json({ error: 'Tenant not resolved' }); return; }

  const parsed = mfaVerifySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: 'Validation failed', issues: parsed.error.issues });
    return;
  }

  const { mfa_token, totp_code } = parsed.data;

  const session = await getMfaSession(mfa_token);
  if (!session || session.tenantId !== tenant.id) {
    res.status(401).json({ error: 'MFA session expired or invalid' });
    return;
  }

  try {
    const user = await withTenantSchema(tenant.slug, async (db) => {
      const { rows } = await db.query(
        'SELECT id, email, username, role, totp_secret FROM users WHERE id = $1 LIMIT 1',
        [session.userId],
      );
      return rows[0] ?? null;
    });

    if (!user?.totp_secret) {
      res.status(401).json({ error: 'MFA not configured' });
      return;
    }

    const secret = decryptTotpSecret(user.totp_secret);
    if (!verifyTotpToken(totp_code, secret)) {
      logAuditEvent({ req, action: 'auth.mfa_failed', tenantId: tenant.id, userId: session.userId });
      res.status(401).json({ error: 'Invalid TOTP code' });
      return;
    }

    await deleteMfaSession(mfa_token);
    const { accessToken } = await issueTokenPair(res, user, tenant.id, tenant.slug);
    logAuditEvent({ req, action: 'auth.mfa_verify', tenantId: tenant.id, userId: user.id });
    res.json({ access_token: accessToken, token_type: 'Bearer' });
  } catch (err) {
    console.error('[auth] mfa/verify error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/auth/mfa/setup  — generate secret + QR URI (step 1)
// ─────────────────────────────────────────────────────────────────────────────

authRouter.post('/mfa/setup', requireAuth, async (req: Request, res: Response) => {
  const authUser = (req as any).user as { userId: number; tenantId: number; tenantSlug: string };
  const tenant   = (req as any).tenant as { id: number; slug: string };

  try {
    const existingSecret = await withTenantSchema(authUser.tenantSlug, async (db) => {
      const { rows } = await db.query(
        'SELECT totp_secret FROM users WHERE id = $1 LIMIT 1',
        [authUser.userId],
      );
      return rows[0]?.totp_secret ?? null;
    });

    if (existingSecret) {
      res.status(409).json({ error: 'MFA is already enabled' });
      return;
    }

    const secret = generateTotpSecret();
    const email  = await withTenantSchema(authUser.tenantSlug, async (db) => {
      const { rows } = await db.query(
        'SELECT email FROM users WHERE id = $1 LIMIT 1',
        [authUser.userId],
      );
      return rows[0]?.email as string;
    });

    const qrUri = getTotpQrUri(secret, email);
    // Store pending (unconfirmed) secret in plaintext momentarily in Redis
    const redis = (await import('@gadnuc/db')).getRedisClient();
    await redis.set(`mfa_pending:${authUser.userId}:${tenant.id}`, secret, 'EX', 10 * 60);

    res.json({ secret, qr_uri: qrUri });
  } catch (err) {
    console.error('[auth] mfa/setup error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/auth/mfa/setup/confirm — verify code and activate MFA (step 2)
// ─────────────────────────────────────────────────────────────────────────────

const setupConfirmSchema = z.object({ totp_code: z.string().length(6) });

authRouter.post('/mfa/setup/confirm', requireAuth, async (req: Request, res: Response) => {
  const authUser = (req as any).user as { userId: number; tenantId: number; tenantSlug: string };
  const tenant   = (req as any).tenant as { id: number; slug: string };

  const parsed = setupConfirmSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: 'Validation failed', issues: parsed.error.issues });
    return;
  }

  try {
    const redis  = (await import('@gadnuc/db')).getRedisClient();
    const secret = await redis.get(`mfa_pending:${authUser.userId}:${tenant.id}`);
    if (!secret) {
      res.status(400).json({ error: 'No pending MFA setup — call /mfa/setup first' });
      return;
    }

    if (!verifyTotpToken(parsed.data.totp_code, secret)) {
      res.status(401).json({ error: 'Invalid TOTP code' });
      return;
    }

    const encrypted = encryptTotpSecret(secret);
    await withTenantSchema(authUser.tenantSlug, async (db) => {
      await db.query(
        'UPDATE users SET totp_secret = $1, updated_at = now() WHERE id = $2',
        [encrypted, authUser.userId],
      );
    });

    await redis.del(`mfa_pending:${authUser.userId}:${tenant.id}`);
    logAuditEvent({ req, action: 'auth.mfa_enabled', tenantId: tenant.id, userId: authUser.userId });
    res.json({ message: 'MFA enabled successfully' });
  } catch (err) {
    console.error('[auth] mfa/setup/confirm error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/auth/mfa/disable
// ─────────────────────────────────────────────────────────────────────────────

const mfaDisableSchema = z.object({ totp_code: z.string().length(6) });

authRouter.post('/mfa/disable', requireAuth, async (req: Request, res: Response) => {
  const authUser = (req as any).user as { userId: number; tenantId: number; tenantSlug: string };
  const tenant   = (req as any).tenant as { id: number; slug: string };

  const parsed = mfaDisableSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: 'Validation failed', issues: parsed.error.issues });
    return;
  }

  try {
    const encryptedSecret = await withTenantSchema(authUser.tenantSlug, async (db) => {
      const { rows } = await db.query(
        'SELECT totp_secret FROM users WHERE id = $1 LIMIT 1',
        [authUser.userId],
      );
      return rows[0]?.totp_secret as string | null;
    });

    if (!encryptedSecret) {
      res.status(400).json({ error: 'MFA is not enabled' });
      return;
    }

    const secret = decryptTotpSecret(encryptedSecret);
    if (!verifyTotpToken(parsed.data.totp_code, secret)) {
      res.status(401).json({ error: 'Invalid TOTP code' });
      return;
    }

    await withTenantSchema(authUser.tenantSlug, async (db) => {
      await db.query(
        'UPDATE users SET totp_secret = NULL, updated_at = now() WHERE id = $1',
        [authUser.userId],
      );
    });

    logAuditEvent({ req, action: 'auth.mfa_disabled', tenantId: tenant.id, userId: authUser.userId });
    res.json({ message: 'MFA disabled' });
  } catch (err) {
    console.error('[auth] mfa/disable error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/auth/refresh
// ─────────────────────────────────────────────────────────────────────────────

authRouter.post('/refresh', async (req: Request, res: Response) => {
  const tenant = (req as any).tenant as { id: number; slug: string } | undefined;
  if (!tenant) { res.status(400).json({ error: 'Tenant not resolved' }); return; }

  const incomingToken: string | undefined = req.cookies?.[REFRESH_COOKIE_NAME];
  if (!incomingToken) {
    res.status(401).json({ error: 'No refresh token' });
    return;
  }

  const result = await rotateRefreshToken(incomingToken);

  if (!result.ok) {
    clearRefreshCookie(res);
    if (result.reason === 'reuse_detected') {
      logAuditEvent({ req, action: 'auth.token_reuse_detected', tenantId: tenant.id, userId: null });
      res.status(401).json({ error: 'Token reuse detected — all sessions revoked' });
    } else {
      res.status(401).json({ error: 'Refresh token invalid or expired' });
    }
    return;
  }

  if (result.tenantId !== tenant.id) {
    clearRefreshCookie(res);
    res.status(401).json({ error: 'Token/tenant mismatch' });
    return;
  }

  const user = await withTenantSchema(tenant.slug, async (db) => {
    const { rows } = await db.query(
      'SELECT id, email, username, role FROM users WHERE id = $1 LIMIT 1',
      [result.userId],
    );
    return rows[0] ?? null;
  });

  if (!user) {
    clearRefreshCookie(res);
    res.status(401).json({ error: 'User not found' });
    return;
  }

  setRefreshCookie(res, result.newToken);
  const accessToken = await signAccessToken({
    userId: user.id, tenantId: tenant.id, tenantSlug: tenant.slug, role: user.role,
  });
  logAuditEvent({ req, action: 'auth.token_refreshed', tenantId: tenant.id, userId: user.id });
  res.json({ access_token: accessToken, token_type: 'Bearer' });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/auth/logout
// ─────────────────────────────────────────────────────────────────────────────

authRouter.post('/logout', async (req: Request, res: Response) => {
  const token: string | undefined = req.cookies?.[REFRESH_COOKIE_NAME];
  if (token) await revokeRefreshToken(token);
  clearRefreshCookie(res);

  const authUser = (req as any).user as { userId?: number; tenantId?: number } | undefined;
  if (authUser?.userId) {
    logAuditEvent({ req, action: 'auth.logout', tenantId: authUser.tenantId ?? null, userId: authUser.userId });
  }

  res.json({ message: 'Logged out' });
});
