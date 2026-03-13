import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole, hashPassword } from '@gadnuc/auth';
import { withTenantSchema } from '@gadnuc/db';
import { emitWebhookEvent } from '../services/webhooks.js';
import { sendWelcomeEmail } from '../services/nodemailer.js';
import { logAuditEvent } from '../middleware/audit.js';

export const usersRouter = Router();
usersRouter.use(requireAuth);

const createUserSchema = z.object({
  username:     z.string().min(3).max(50).regex(/^[a-zA-Z0-9._-]+$/),
  email:        z.string().email(),
  display_name: z.string().max(255).optional(),
  role:         z.enum(['tenant_admin', 'operator', 'viewer']).default('operator'),
  password:     z.string().min(8).max(256),
});

const updateUserSchema = createUserSchema
  .omit({ password: true })
  .partial()
  .extend({
    password:  z.string().min(8).max(256).optional(),
    is_active: z.boolean().optional(),
  });

const UPDATABLE_USER_FIELDS = new Set([
  'username', 'email', 'display_name', 'role', 'password_hash', 'is_active',
]);

// GET /api/users — list users (tenant_admin+)
usersRouter.get('/', requireRole('tenant_admin'), async (req, res) => {
  try {
    await withTenantSchema(req.tenantSlug!, async (db) => {
      const { rows } = await db.query(
        `SELECT id, username, email, display_name, role, is_active, last_login_at, created_at
         FROM users ORDER BY created_at DESC`
      );
      res.json({ data: rows });
    });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/users/me — current user's profile
usersRouter.get('/me', async (req, res) => {
  try {
    await withTenantSchema(req.tenantSlug!, async (db) => {
      const { rows } = await db.query(
        `SELECT id, username, email, display_name, role, is_active, last_login_at, created_at
         FROM users WHERE auth_user_id = $1`,
        [req.user!.userId]
      );
      if (!rows[0]) { res.status(404).json({ error: 'User not found' }); return; }
      res.json({ data: rows[0] });
    });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/users — create user (tenant_admin+)
usersRouter.post('/', requireRole('tenant_admin'), async (req, res) => {
  const parse = createUserSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: 'Validation failed', details: parse.error.flatten() });
    return;
  }

  const { password, ...rest } = parse.data;

  const password_hash = await hashPassword(password);

  try {
    await withTenantSchema(req.tenantSlug!, async (db) => {
      const { rows } = await db.query(
        `INSERT INTO users (auth_user_id, username, email, display_name, role, password_hash)
         VALUES ($1,$2,$3,$4,$5,$6)
         RETURNING id, username, email, display_name, role, is_active, created_at`,
        [crypto.randomUUID(), rest.username, rest.email,
         rest.display_name ?? null, rest.role, password_hash]
      );
      res.status(201).json({ data: rows[0] });

      logAuditEvent({ req, action: 'user.created', tenantId: req.user!.tenantId, userId: req.user!.userId, metadata: { new_user_id: rows[0].id, username: rest.username } });

      emitWebhookEvent(req.user!.tenantId, 'user.created', {
        user_id: rows[0].id, username: rest.username, email: rest.email, role: rest.role,
      }).catch(() => {});

      sendWelcomeEmail({
        to: rest.email,
        displayName: rest.display_name ?? rest.username,
        tenantSlug: req.tenantSlug!,
        loginUrl: `${process.env.NEXT_PUBLIC_MANAGER_URL ?? 'http://localhost:3002'}/login`,
      }).catch((err) => console.error('[users] Welcome email failed:', err));
    });
  } catch (err: unknown) {
    if ((err as { code?: string }).code === '23505') {
      res.status(409).json({ error: 'Username or email already exists' });
      return;
    }
    console.error('[users] Create error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/users/:id
usersRouter.patch('/:id', requireRole('tenant_admin'), async (req, res) => {
  const parse = updateUserSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: 'Validation failed', details: parse.error.flatten() });
    return;
  }

  const updates = { ...parse.data };
  if (updates.password) {
    (updates as Record<string, unknown>).password_hash = await hashPassword(updates.password);
    delete updates.password;
  }

  const fields = Object.keys(updates).filter(f => UPDATABLE_USER_FIELDS.has(f));
  if (!fields.length) { res.status(400).json({ error: 'No fields to update' }); return; }

  const setClauses = fields.map((f, i) => `${f} = $${i + 2}`).join(', ');
  try {
    await withTenantSchema(req.tenantSlug!, async (db) => {
      const { rows } = await db.query(
        `UPDATE users SET ${setClauses}, updated_at = now() WHERE id = $1
         RETURNING id, username, email, display_name, role, is_active`,
        [req.params.id, ...fields.map(f => (updates as Record<string, unknown>)[f])]
      );
      if (!rows[0]) { res.status(404).json({ error: 'User not found' }); return; }
      res.json({ data: rows[0] });

      logAuditEvent({ req, action: 'user.updated', tenantId: req.user!.tenantId, userId: req.user!.userId, metadata: { target_user_id: req.params.id } });

      emitWebhookEvent(req.user!.tenantId, 'user.updated', {
        user_id: req.params.id,
      }).catch(() => {});
    });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/users/:id — remove user (tenant_admin+)
usersRouter.delete('/:id', requireRole('tenant_admin'), async (req, res) => {
  try {
    await withTenantSchema(req.tenantSlug!, async (db) => {
      // Look up the target user first
      const { rows: [target] } = await db.query(
        'SELECT id, auth_user_id, username FROM users WHERE id = $1',
        [req.params.id],
      );
      if (!target) { res.status(404).json({ error: 'User not found' }); return; }

      // Prevent self-deletion
      if (target.auth_user_id === req.user!.userId) {
        res.status(400).json({ error: 'You cannot delete your own account' });
        return;
      }

      await db.query('DELETE FROM users WHERE id = $1', [req.params.id]);
      res.status(204).send();

      logAuditEvent({ req, action: 'user.deleted', tenantId: req.user!.tenantId, userId: req.user!.userId, metadata: { deleted_user_id: req.params.id, username: target.username } });

      emitWebhookEvent(req.user!.tenantId, 'user.deleted', {
        user_id: req.params.id, username: target.username,
      }).catch(() => {});
    });
  } catch (err) {
    console.error('[users] Delete error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});
