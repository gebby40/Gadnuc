/**
 * Webhook management routes.
 *
 * Tenants can CRUD their webhook endpoints and view delivery logs.
 *
 * POST   /api/webhooks         — register a new webhook
 * GET    /api/webhooks         — list tenant's webhooks
 * GET    /api/webhooks/:id     — get webhook details
 * PATCH  /api/webhooks/:id     — update webhook (URL, events, active)
 * DELETE /api/webhooks/:id     — delete webhook
 * GET    /api/webhooks/:id/deliveries — view recent deliveries
 * POST   /api/webhooks/:id/test       — send a test event
 */

import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole } from '@gadnuc/auth';
import { getPool } from '@gadnuc/db';
import { WEBHOOK_EVENTS, generateSigningSecret, emitWebhookEvent, isInternalUrl, type WebhookEventType } from '../services/webhooks.js';
import { tenantRateLimit } from '../middleware/tenant-rate-limit.js';

export const webhooksRouter = Router();
webhooksRouter.use(requireAuth, requireRole('tenant_admin'));

// ── Validation schemas ────────────────────────────────────────────────────────

const createWebhookSchema = z.object({
  url:    z.string().url().max(2048),
  events: z.array(z.enum([...WEBHOOK_EVENTS, '*'] as [string, ...string[]])).min(1),
  name:   z.string().min(1).max(100).optional(),
});

const updateWebhookSchema = z.object({
  url:       z.string().url().max(2048).optional(),
  events:    z.array(z.enum([...WEBHOOK_EVENTS, '*'] as [string, ...string[]])).min(1).optional(),
  name:      z.string().min(1).max(100).optional(),
  is_active: z.boolean().optional(),
}).strict();

// ── POST /api/webhooks ────────────────────────────────────────────────────────

webhooksRouter.post('/', tenantRateLimit({ max: 20 }), async (req, res) => {
  const parse = createWebhookSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(422).json({ error: 'Validation failed', details: parse.error.flatten() });
    return;
  }

  const tenantId = req.user!.tenantId;
  const { url, events, name } = parse.data;

  if (isInternalUrl(url)) {
    res.status(422).json({ error: 'Webhook URL must be a publicly accessible endpoint' });
    return;
  }

  const signingSecret = generateSigningSecret();
  const pool = getPool();

  try {
    const { rows: [hook] } = await pool.query(
      `INSERT INTO public.webhooks (tenant_id, url, events, signing_secret, name)
       VALUES ($1, $2, $3::jsonb, $4, $5)
       RETURNING id, url, events, name, is_active, created_at`,
      [tenantId, url, JSON.stringify(events), signingSecret, name ?? null],
    );

    // Return the signing secret only once at creation
    res.status(201).json({
      data: { ...hook, signing_secret: signingSecret },
      message: 'Save the signing_secret — it will not be shown again.',
    });
  } catch (err) {
    console.error('[webhooks] Create error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── GET /api/webhooks ─────────────────────────────────────────────────────────

webhooksRouter.get('/', async (req, res) => {
  const tenantId = req.user!.tenantId;
  const pool = getPool();

  try {
    const { rows } = await pool.query(
      `SELECT id, url, events, name, is_active, consecutive_failures, created_at, updated_at
       FROM public.webhooks
       WHERE tenant_id = $1
       ORDER BY created_at DESC`,
      [tenantId],
    );
    res.json({ data: rows });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── GET /api/webhooks/:id ─────────────────────────────────────────────────────

webhooksRouter.get('/:id', async (req, res) => {
  const pool = getPool();
  try {
    const { rows } = await pool.query(
      `SELECT id, url, events, name, is_active, consecutive_failures, created_at, updated_at
       FROM public.webhooks
       WHERE id = $1 AND tenant_id = $2`,
      [req.params.id, req.user!.tenantId],
    );
    if (!rows[0]) {
      res.status(404).json({ error: 'Webhook not found' });
      return;
    }
    res.json({ data: rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── PATCH /api/webhooks/:id ───────────────────────────────────────────────────

webhooksRouter.patch('/:id', async (req, res) => {
  const parse = updateWebhookSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(422).json({ error: 'Validation failed', details: parse.error.flatten() });
    return;
  }

  const pool = getPool();
  const data = parse.data as Record<string, unknown>;

  // SSRF protection: validate URL if being updated
  if (data.url && isInternalUrl(data.url as string)) {
    res.status(422).json({ error: 'Webhook URL must be a publicly accessible endpoint' });
    return;
  }

  // Build dynamic SET clause
  const fields: string[] = [];
  const values: unknown[] = [req.params.id, req.user!.tenantId];
  let paramIdx = 3;

  for (const [key, val] of Object.entries(data)) {
    if (val === undefined) continue;
    if (key === 'events') {
      fields.push(`events = $${paramIdx}::jsonb`);
      values.push(JSON.stringify(val));
    } else {
      fields.push(`${key} = $${paramIdx}`);
      values.push(val);
    }
    paramIdx++;
  }

  if (fields.length === 0) {
    res.status(400).json({ error: 'No fields to update' });
    return;
  }

  // If re-activating, reset consecutive failures
  if (data.is_active === true) {
    fields.push('consecutive_failures = 0');
  }

  try {
    const { rows } = await pool.query(
      `UPDATE public.webhooks
       SET ${fields.join(', ')}, updated_at = now()
       WHERE id = $1 AND tenant_id = $2
       RETURNING id, url, events, name, is_active, created_at, updated_at`,
      values,
    );

    if (!rows[0]) {
      res.status(404).json({ error: 'Webhook not found' });
      return;
    }
    res.json({ data: rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── DELETE /api/webhooks/:id ──────────────────────────────────────────────────

webhooksRouter.delete('/:id', async (req, res) => {
  const pool = getPool();
  try {
    const { rowCount } = await pool.query(
      'DELETE FROM public.webhooks WHERE id = $1 AND tenant_id = $2',
      [req.params.id, req.user!.tenantId],
    );
    if (!rowCount) {
      res.status(404).json({ error: 'Webhook not found' });
      return;
    }
    res.status(204).send();
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── GET /api/webhooks/:id/deliveries ──────────────────────────────────────────

webhooksRouter.get('/:id/deliveries', async (req, res) => {
  const pool = getPool();
  const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);

  try {
    // Verify ownership
    const { rows: [hook] } = await pool.query(
      'SELECT id FROM public.webhooks WHERE id = $1 AND tenant_id = $2',
      [req.params.id, req.user!.tenantId],
    );
    if (!hook) {
      res.status(404).json({ error: 'Webhook not found' });
      return;
    }

    const { rows } = await pool.query(
      `SELECT id, event_type, success, response_status, created_at
       FROM public.webhook_deliveries
       WHERE webhook_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [req.params.id, limit],
    );
    res.json({ data: rows });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── POST /api/webhooks/:id/test ───────────────────────────────────────────────

webhooksRouter.post('/:id/test', async (req, res) => {
  const pool = getPool();

  try {
    const { rows: [hook] } = await pool.query(
      'SELECT id, url, signing_secret, events FROM public.webhooks WHERE id = $1 AND tenant_id = $2',
      [req.params.id, req.user!.tenantId],
    );
    if (!hook) {
      res.status(404).json({ error: 'Webhook not found' });
      return;
    }

    // Send a test event synchronously
    await emitWebhookEvent(
      req.user!.tenantId,
      'order.created' as WebhookEventType,
      {
        test:         true,
        order_number: 'TEST-0001',
        total_cents:  4999,
        status:       'pending',
      },
    );

    res.json({ message: 'Test event dispatched' });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});
