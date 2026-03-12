import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole } from '@gadnuc/auth';
import { withTenantSchema } from '@gadnuc/db';
import { emitWebhookEvent } from '../services/webhooks.js';
import { logAuditEvent } from '../middleware/audit.js';

export const ordersRouter = Router();
ordersRouter.use(requireAuth);

const orderItemSchema = z.object({
  product_id:      z.string().uuid().optional(),
  sku:             z.string().min(1),
  name:            z.string().min(1),
  quantity:        z.number().int().positive(),
  unit_price_cents: z.number().int().min(0),
});

const createOrderSchema = z.object({
  customer_name:  z.string().min(1).max(255),
  customer_email: z.string().email().optional(),
  shipping_address: z.object({
    line1:   z.string(),
    line2:   z.string().optional(),
    city:    z.string(),
    state:   z.string().optional(),
    postal:  z.string(),
    country: z.string().length(2),
  }).optional(),
  notes: z.string().max(1000).optional(),
  items: z.array(orderItemSchema).min(1),
});

const STATUS_TRANSITIONS: Record<string, string[]> = {
  pending:    ['processing', 'cancelled'],
  processing: ['shipped', 'cancelled'],
  shipped:    ['delivered'],
  delivered:  ['refunded'],
  cancelled:  [],
  refunded:   [],
};

// GET /api/orders
ordersRouter.get('/', async (req, res) => {
  const { status, page = '1', limit = '20' } = req.query;
  const offset = (parseInt(page as string) - 1) * parseInt(limit as string);

  try {
    await withTenantSchema(req.tenantSlug!, async (db) => {
      const params: unknown[] = [parseInt(limit as string), offset];
      const where = status ? `WHERE o.status = $${params.push(status)}` : '';

      const { rows } = await db.query(
        `SELECT o.*, COUNT(*) OVER() AS total_count
         FROM orders o ${where}
         ORDER BY o.created_at DESC
         LIMIT $1 OFFSET $2`,
        params
      );

      const total = rows[0]?.total_count ?? 0;
      res.json({
        data:  rows,
        meta:  { page: parseInt(page as string), limit: parseInt(limit as string), total: parseInt(total) },
      });
    });
  } catch (err) {
    console.error('[orders] List error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/orders/:id
ordersRouter.get('/:id', async (req, res) => {
  try {
    await withTenantSchema(req.tenantSlug!, async (db) => {
      const { rows: [order] } = await db.query(
        'SELECT * FROM orders WHERE id = $1', [req.params.id]
      );
      if (!order) { res.status(404).json({ error: 'Order not found' }); return; }

      const { rows: items } = await db.query(
        'SELECT * FROM order_items WHERE order_id = $1 ORDER BY created_at', [req.params.id]
      );
      res.json({ data: { ...order, items } });
    });
  } catch (err) {
    console.error('[orders] Get error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/orders
ordersRouter.post('/', requireRole('operator'), async (req, res) => {
  const parse = createOrderSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: 'Validation failed', details: parse.error.flatten() });
    return;
  }

  const { items, ...orderData } = parse.data;
  const totalCents = items.reduce((sum, i) => sum + i.quantity * i.unit_price_cents, 0);
  const orderNumber = `ORD-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

  try {
    await withTenantSchema(req.tenantSlug!, async (db) => {
      const { rows: [order] } = await db.query(
        `INSERT INTO orders
           (order_number, customer_name, customer_email, shipping_address, notes,
            total_cents, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
        [orderNumber, orderData.customer_name, orderData.customer_email ?? null,
         orderData.shipping_address ? JSON.stringify(orderData.shipping_address) : null,
         orderData.notes ?? null, totalCents, req.user!.userId]
      );

      for (const item of items) {
        await db.query(
          `INSERT INTO order_items (order_id, product_id, sku, name, quantity, unit_price_cents)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [order.id, item.product_id ?? null, item.sku, item.name, item.quantity, item.unit_price_cents]
        );
      }

      res.status(201).json({ data: { ...order, items } });

      logAuditEvent({ req, action: 'order.created', tenantId: req.user!.tenantId, userId: req.user!.userId, metadata: { order_id: order.id, order_number: orderNumber } });

      emitWebhookEvent(req.user!.tenantId, 'order.created', {
        order_id: order.id, order_number: orderNumber, total_cents: totalCents,
      }).catch(() => {});
    });
  } catch (err) {
    console.error('[orders] Create error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PATCH /api/orders/:id/status — update order status
ordersRouter.patch('/:id/status', requireRole('operator'), async (req, res) => {
  const { status } = req.body as { status?: string };
  if (!status) { res.status(400).json({ error: 'status field required' }); return; }

  try {
    await withTenantSchema(req.tenantSlug!, async (db) => {
      const { rows: [order] } = await db.query(
        'SELECT status FROM orders WHERE id = $1', [req.params.id]
      );
      if (!order) { res.status(404).json({ error: 'Order not found' }); return; }

      const allowed = STATUS_TRANSITIONS[order.status] ?? [];
      if (!allowed.includes(status)) {
        res.status(422).json({
          error: `Cannot transition from "${order.status}" to "${status}"`,
          allowed,
        });
        return;
      }

      const { rows: [updated] } = await db.query(
        `UPDATE orders SET status = $2, updated_at = now() WHERE id = $1 RETURNING *`,
        [req.params.id, status]
      );
      res.json({ data: updated });

      logAuditEvent({ req, action: 'order.status_changed', tenantId: req.user!.tenantId, userId: req.user!.userId, metadata: { order_id: req.params.id, old_status: order.status, new_status: status } });

      const webhookEvent = status === 'shipped' ? 'order.shipped'
        : status === 'cancelled' ? 'order.cancelled'
        : status === 'refunded' ? 'order.refunded'
        : 'order.updated';
      emitWebhookEvent(req.user!.tenantId, webhookEvent, {
        order_id: req.params.id, old_status: order.status, new_status: status,
      }).catch(() => {});
    });
  } catch (err) {
    console.error('[orders] Status update error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});
