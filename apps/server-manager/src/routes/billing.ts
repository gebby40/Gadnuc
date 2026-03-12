import { Router, raw } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole } from '@gadnuc/auth';
import { getPool } from '@gadnuc/db';
import Stripe from 'stripe';

export const billingRouter = Router();

let _stripe: Stripe | null = null;

function getStripe(): Stripe {
  if (!_stripe) {
    if (!process.env.STRIPE_SECRET_KEY) {
      throw new Error('STRIPE_SECRET_KEY is not set');
    }
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2023-10-16' });
  }
  return _stripe;
}

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

// Stripe webhook — no auth (verified by signature)
billingRouter.post(
  '/webhook',
  raw({ type: 'application/json' }),
  async (req, res) => {
    const sig = req.headers['stripe-signature'];
    if (!sig || !process.env.STRIPE_WEBHOOK_SECRET) {
      res.status(400).json({ error: 'Missing Stripe signature or webhook secret' });
      return;
    }

    let event: Stripe.Event;
    try {
      const stripe = getStripe();
      event = stripe.webhooks.constructEvent(
        req.body as Buffer,
        sig as string,
        process.env.STRIPE_WEBHOOK_SECRET,
      );
    } catch (err) {
      console.error('[billing] Webhook signature verification failed:', (err as Error).message);
      res.status(400).json({ error: 'Invalid signature' });
      return;
    }

    const pool = getPool();

    try {
      switch (event.type) {
        case 'customer.subscription.updated':
        case 'customer.subscription.created': {
          const sub = event.data.object as { id: string; customer: string; status: string };
          await pool.query(
            `UPDATE public.tenants
             SET stripe_subscription_id = $1, status = $3, updated_at = now()
             WHERE stripe_customer_id = $2`,
            [sub.id, sub.customer, stripeStatusToTenantStatus(sub.status)],
          );
          break;
        }
        case 'customer.subscription.deleted': {
          const sub = event.data.object as { customer: string };
          await pool.query(
            `UPDATE public.tenants SET status = 'cancelled', updated_at = now()
             WHERE stripe_customer_id = $1`,
            [sub.customer],
          );
          break;
        }
        case 'invoice.payment_failed': {
          const inv = event.data.object as { customer: string };
          await pool.query(
            `UPDATE public.tenants SET status = 'past_due', updated_at = now()
             WHERE stripe_customer_id = $1`,
            [inv.customer],
          );
          break;
        }
        default:
          console.log(`[billing] Unhandled webhook event: ${event.type}`);
      }

      res.json({ received: true });
    } catch (err) {
      console.error('[billing] Webhook processing error:', (err as Error).message);
      res.status(500).json({ error: 'Webhook processing failed' });
    }
  },
);

// Protected billing management routes
billingRouter.use(requireAuth, requireRole('super_admin'));

const assignPlanSchema = z.object({
  tenant_id:          z.string().uuid(),
  stripe_customer_id: z.string().min(1),
  plan_name:          z.enum(['starter', 'professional', 'enterprise']),
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
      'SELECT id FROM public.plans WHERE name = $1',
      [plan_name],
    );
    if (!plan) {
      res.status(400).json({ error: 'Plan not found' });
      return;
    }

    await pool.query(
      `UPDATE public.tenants
       SET plan_id = $2, stripe_customer_id = $3, status = 'active', updated_at = now()
       WHERE id = $1`,
      [tenant_id, plan.id, stripe_customer_id],
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('[billing] Assign plan error:', (err as Error).message);
    res.status(500).json({ error: 'Internal server error' });
  }
});
