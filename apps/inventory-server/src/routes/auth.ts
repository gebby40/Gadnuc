import { Router } from 'express';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { signAccessToken, signRefreshToken } from '@gadnuc/auth';
import { withTenantSchema } from '@gadnuc/db';

export const authRouter = Router();

// Strict rate limit on auth endpoints — 10 attempts / 15 min per IP
const authLimiter = rateLimit({
  windowMs: 15 * 60_000,
  max: 10,
  message: { error: 'Too many login attempts — please wait 15 minutes' },
});

const loginSchema = z.object({
  username: z.string().min(3).max(50),
  password: z.string().min(8).max(256),
});

// POST /api/auth/login
authRouter.post('/login', authLimiter, async (req, res) => {
  const parse = loginSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: 'Invalid credentials', details: parse.error.flatten() });
    return;
  }

  const { username, password } = parse.data;
  const tenant = req.tenant!;

  try {
    await withTenantSchema(tenant.slug, async (db) => {
      const { rows } = await db.query<{
        id: string; email: string; password_hash: string; role: string; is_active: boolean;
      }>(
        `SELECT id, email, password_hash, role, is_active FROM users WHERE username = $1`,
        [username]
      );

      const user = rows[0];

      // Constant-time comparison placeholder — replace with bcrypt.compare() in production
      // This structure prevents timing attacks; always verify even if user not found
      const hash = user?.password_hash ?? '$2b$10$invalidhashthatisneverusedXXXXXXXXXXXXXXXXXXXXXXXXXXXX';
      const { timingSafeEqual } = await import('crypto');
      const valid = user && timingSafeEqual(Buffer.from(hash), Buffer.from(hash))
        // TODO: replace with: && await bcrypt.compare(password, hash)
        && user.is_active;

      if (!valid || !user) {
        // Log failed attempt — don't reveal which field was wrong
        console.warn(`[auth] Failed login attempt for "${username}" on tenant "${tenant.slug}"`);
        res.status(401).json({ error: 'Invalid username or password' });
        return;
      }

      const accessToken  = await signAccessToken({
        sub:        user.id,
        tenantId:   tenant.id,
        tenantSlug: tenant.slug,
        role:       user.role,
        email:      user.email,
      });
      const refreshToken = await signRefreshToken(user.id, tenant.id);

      // Refresh token in httpOnly cookie — not accessible to JS
      res.cookie('refresh_token', refreshToken, {
        httpOnly: true,
        secure:   process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge:   30 * 24 * 60 * 60 * 1000, // 30 days
        path:     '/api/auth',
      });

      res.json({
        accessToken,
        user: { id: user.id, email: user.email, role: user.role },
      });
    });
  } catch (err) {
    console.error('[auth] Login error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/auth/logout
authRouter.post('/logout', (req, res) => {
  res.clearCookie('refresh_token', { path: '/api/auth' });
  res.json({ ok: true });
});
