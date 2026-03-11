import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole } from '@gadnuc/auth';
import { getPool } from '@gadnuc/db';

export const billingRouter = Router();

// Stripe webhook — no auth (verified by signature)
billingRouter.post('/webhook', express_raw(), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  if (!sig || !process.env.STRIPE_WEBHOOK_SECRET) {
    res.status(400).json({ error: 'Missing Stripe signature' });
    return;
  }

  try {
    const stripe = await getStripe();
    const event = stripe.webhooks.constructEvent(
      req.body as Buffer,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );

    const pool = getPool();

    switch (event.type) {
      case 'customer.subscription.updated':
      case 'customer.subscription.created': {
        const sub = event.data.object as { id: string; customer: string; status: string };
        await pool.query(
          `UPDATE public.tenants
           SET stripe_subscription_id = $1, status = $3, updated_at = now()
           WHERE stripe_customer_id = $2`,
          [sub.id, sub.customer, stripeStatusToTenantStatus(sub.status)]
        );
        break;
      }
      case 'customer.subscription.deleted': {
        const sub = event.data.object as { customer: string };
        await pool.query(
          `UPDATE public.tenants SET status = 'cancelled', updated_at = now()
           WHERE stripe_customer_id = $1`,
          [sub.customer]
        );
        break;
      }
      case 'invoice.payment_failed': {
        const inv = event.data.object as { customer: string };
        await pool.query(
          `UPDATE public.tenants SET status = 'past_due', updated_at = now()
           WHERE stripe_customer_id = $1`,
          [inv.customer]
        );
        break;
      }
    }

    res.json({ received: true });
  } catch (err: unknown) {
    console.error('[billing] Webhook error:', (err as Error).message);
    res.status(400).json({ error: 'Webhook processing failed' });
  }
});

// Protected billing management routes
billingRouter.use(requireAuth, requireRole('super_admin'));

const assignPlanSchema = z.object({
  tenant_id:       z.string().uuid(),
  stripe_customer_id: z.string().min(1),
  plan_name:       z.enum(['starter', 'professional', 'enterprise']),
});

// POST /api/billing/assign-plan
billingRouter.post('/assign-plan', async (req, res) => {
  const parse = assignPlanSchema.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ error: 'Validation failed', details: parse.error.flatten() });
    return;
  }

  const { tenant_id, stripe_customer_id, plan_name } = parse.data;
  const pool = getPool();

  try {
    const { rows: [plan] } = await pool.query(
      'SELECT id FROM public.plans WHERE name = $1', [plan_name]
    );
    if (!plan) { res.status(400).json({ error: 'Plan not found' }); return; }

    await pool.query(
      `UPDATE public.tenants
       SET plan_id = $2, stripe_customer_id = $3, status = 'active', updated_at = now()
       WHERE id = $1`,
      [tenant_id, plan.id, stripe_customer_id]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Helpers
function stripeStatusToTenantStatus(stripeStatus: string): string {
  const map: Record<string, string> = {
    active:     'active',
    trialing:   'trialing',
    past_due:   'past_due',
    canceled:   'cancelled',
    unpaid:     'past_due',
    incomplete: 'past_due',
  };
  return map[stripeStatus] ?? 'past_due';
}

async function getStripe() {
  const { default: Stripe } = await import('stripe');
  return new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2024-04-10' });
}

// express.raw() for webhook body parsing
function express_raw() {
  const { raw } = require('express');
  return raw({ type: 'application/json' });
}
