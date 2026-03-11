/**
 * Stripe Connect OAuth routes
 *
 * GET  /api/stripe-connect/oauth-url  — generate OAuth URL (tenant_admin)
 * GET  /api/stripe-connect/callback   — handle OAuth callback (tenant_admin)
 * GET  /api/stripe-connect/status     — connection status (tenant_admin)
 * POST /api/stripe-connect/disconnect — disconnect account (tenant_admin)
 */

import { Router }     from 'express';
import Stripe         from 'stripe';
import crypto         from 'node:crypto';
import { getPool }    from '@gadnuc/db';
import { requireAuth, requireRole } from '@gadnuc/auth';
import type { Request, Response }   from 'express';

export const stripeConnectRouter = Router();

const PLATFORM_FEE_PCT = Number(process.env.PLATFORM_FEE_PCT ?? 5);

function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY is not set');
  return new Stripe(key, { apiVersion: '2023-10-16' });
}

// ── GET /api/stripe-connect/oauth-url ─────────────────────────────────────────
stripeConnectRouter.get(
  '/oauth-url',
  requireAuth,
  requireRole('tenant_admin'),
  async (req: Request, res: Response) => {
    const tenant = (req as any).tenant as { id: string; slug: string } | undefined;
    if (!tenant) { res.status(400).json({ error: 'Tenant not resolved' }); return; }

    const clientId    = process.env.STRIPE_CONNECT_CLIENT_ID;
    const redirectUri = process.env.STRIPE_CONNECT_REDIRECT_URI;
    if (!clientId || !redirectUri) {
      res.status(503).json({ error: 'Stripe Connect not configured' });
      return;
    }

    // Generate CSRF state token
    const state = crypto.randomBytes(32).toString('hex');

    try {
      const pool = getPool();
      // Clean up expired states first
      await pool.query(`DELETE FROM public.stripe_connect_states WHERE expires_at < now()`);

      await pool.query(
        `INSERT INTO public.stripe_connect_states (tenant_id, state) VALUES ($1, $2)`,
        [tenant.id, state],
      );

      const params = new URLSearchParams({
        response_type: 'code',
        client_id:     clientId,
        scope:         'read_write',
        redirect_uri:  redirectUri,
        state,
        'stripe_user[business_type]': 'company',
      });

      const url = `https://connect.stripe.com/oauth/authorize?${params.toString()}`;
      res.json({ url });
    } catch (err) {
      console.error('[stripe-connect] oauth-url error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

// ── GET /api/stripe-connect/callback ──────────────────────────────────────────
stripeConnectRouter.get(
  '/callback',
  requireAuth,
  requireRole('tenant_admin'),
  async (req: Request, res: Response) => {
    const tenant = (req as any).tenant as { id: string; slug: string } | undefined;
    if (!tenant) { res.status(400).json({ error: 'Tenant not resolved' }); return; }

    const { code, state, error: oauthError } = req.query as Record<string, string>;

    if (oauthError) {
      res.status(400).json({ error: oauthError });
      return;
    }
    if (!code || !state) {
      res.status(400).json({ error: 'Missing code or state' });
      return;
    }

    const pool = getPool();
    try {
      // Verify CSRF state
      const { rows } = await pool.query(
        `DELETE FROM public.stripe_connect_states
         WHERE state = $1 AND tenant_id = $2 AND expires_at > now()
         RETURNING id`,
        [state, tenant.id],
      );
      if (!rows.length) {
        res.status(400).json({ error: 'Invalid or expired state token' });
        return;
      }

      // Exchange code for access token
      const stripe = getStripe();
      const response = await stripe.oauth.token({ grant_type: 'authorization_code', code });
      const stripeAccountId = response.stripe_user_id;

      if (!stripeAccountId) {
        res.status(400).json({ error: 'No account ID in Stripe response' });
        return;
      }

      // Persist the connected account
      await pool.query(
        `UPDATE public.tenants
         SET stripe_connect_account_id = $1,
             stripe_connect_enabled    = true,
             updated_at                = now()
         WHERE id = $2`,
        [stripeAccountId, tenant.id],
      );

      res.json({ success: true, account_id: stripeAccountId });
    } catch (err) {
      console.error('[stripe-connect] callback error:', err);
      res.status(500).json({ error: 'Failed to complete Stripe Connect' });
    }
  },
);

// ── GET /api/stripe-connect/status ────────────────────────────────────────────
stripeConnectRouter.get(
  '/status',
  requireAuth,
  requireRole('tenant_admin'),
  async (req: Request, res: Response) => {
    const tenant = (req as any).tenant as { id: string; slug: string } | undefined;
    if (!tenant) { res.status(400).json({ error: 'Tenant not resolved' }); return; }

    try {
      const pool = getPool();
      const { rows: [row] } = await pool.query(
        `SELECT stripe_connect_account_id, stripe_connect_enabled
         FROM public.tenants WHERE id = $1`,
        [tenant.id],
      );

      if (!row?.stripe_connect_enabled || !row?.stripe_connect_account_id) {
        res.json({ connected: false });
        return;
      }

      // Fetch live account details from Stripe
      const stripe  = getStripe();
      const account = await stripe.accounts.retrieve(row.stripe_connect_account_id);

      res.json({
        connected:          true,
        account_id:         row.stripe_connect_account_id,
        charges_enabled:    account.charges_enabled,
        payouts_enabled:    account.payouts_enabled,
        details_submitted:  account.details_submitted,
        platform_fee_pct:   PLATFORM_FEE_PCT,
      });
    } catch (err) {
      console.error('[stripe-connect] status error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);

// ── POST /api/stripe-connect/disconnect ───────────────────────────────────────
stripeConnectRouter.post(
  '/disconnect',
  requireAuth,
  requireRole('tenant_admin'),
  async (req: Request, res: Response) => {
    const tenant = (req as any).tenant as { id: string; slug: string } | undefined;
    if (!tenant) { res.status(400).json({ error: 'Tenant not resolved' }); return; }

    const pool = getPool();
    try {
      const { rows: [row] } = await pool.query(
        `SELECT stripe_connect_account_id FROM public.tenants WHERE id = $1`,
        [tenant.id],
      );

      if (row?.stripe_connect_account_id) {
        try {
          const clientId = process.env.STRIPE_CONNECT_CLIENT_ID;
          if (clientId) {
            const stripe = getStripe();
            await stripe.oauth.deauthorize({
              client_id:      clientId,
              stripe_user_id: row.stripe_connect_account_id,
            });
          }
        } catch (stripeErr) {
          // Log but don't fail — still clear locally
          console.warn('[stripe-connect] Deauthorize call failed:', stripeErr);
        }
      }

      await pool.query(
        `UPDATE public.tenants
         SET stripe_connect_account_id = NULL,
             stripe_connect_enabled    = false,
             updated_at                = now()
         WHERE id = $1`,
        [tenant.id],
      );

      res.json({ success: true });
    } catch (err) {
      console.error('[stripe-connect] disconnect error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  },
);
