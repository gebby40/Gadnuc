/**
 * Webhook dispatcher service.
 *
 * Tenants register webhook URLs and subscribe to specific event types.
 * When an event fires, we POST a signed JSON payload to each matching URL.
 *
 * Event types follow a `resource.action` naming convention:
 *   order.created, order.updated, order.shipped, order.cancelled, order.refunded
 *   product.created, product.updated, product.deleted
 *   user.created, user.updated, user.deactivated
 *   inventory.low_stock
 *   messaging.room_created, messaging.message_sent
 *
 * Signing:
 *   Each webhook has a signing secret. We compute HMAC-SHA256 of the raw
 *   JSON body and send it in the `X-Gadnuc-Signature` header so recipients
 *   can verify authenticity.
 *
 * Retry policy:
 *   Failed deliveries are retried up to 3 times with exponential backoff
 *   (5s, 30s, 120s). After all retries fail, the delivery is marked as
 *   permanently failed. Webhooks with 10+ consecutive failures are
 *   auto-disabled.
 */

import { createHmac, randomBytes } from 'crypto';
import { getPool } from '@gadnuc/db';

// ── Types ─────────────────────────────────────────────────────────────────────

export const WEBHOOK_EVENTS = [
  'order.created',
  'order.updated',
  'order.shipped',
  'order.cancelled',
  'order.refunded',
  'product.created',
  'product.updated',
  'product.deleted',
  'user.created',
  'user.updated',
  'user.deactivated',
  'inventory.low_stock',
  'messaging.room_created',
  'messaging.message_sent',
] as const;

export type WebhookEventType = typeof WEBHOOK_EVENTS[number];

export interface WebhookPayload {
  event:      WebhookEventType;
  tenant_id:  string;
  timestamp:  string;
  data:       Record<string, unknown>;
}

interface WebhookRow {
  id: string;
  url: string;
  signing_secret: string;
  events: string[];
}

// ── Signing ───────────────────────────────────────────────────────────────────

function sign(body: string, secret: string): string {
  return createHmac('sha256', secret).update(body).digest('hex');
}

export function generateSigningSecret(): string {
  return `whsec_${randomBytes(24).toString('hex')}`;
}

// ── SSRF Protection ──────────────────────────────────────────────────────────

const PRIVATE_IP_PATTERNS = [
  /^localhost$/i,
  /^127\./,
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^169\.254\./,
  /^0\./,
  /^\[::1\]/,
  /^\[fc/i,
  /^\[fd/i,
  /^\[fe80:/i,
];

export function isInternalUrl(urlStr: string): boolean {
  try {
    const parsed = new URL(urlStr);
    return PRIVATE_IP_PATTERNS.some((p) => p.test(parsed.hostname));
  } catch {
    return true; // Unparseable URLs are rejected
  }
}

// ── Dispatch ──────────────────────────────────────────────────────────────────

const MAX_RETRIES = 3;
const RETRY_DELAYS_MS = [5_000, 30_000, 120_000];
const DELIVERY_TIMEOUT_MS = 10_000;

async function deliverWithRetry(
  url: string,
  body: string,
  signature: string,
  webhookId: string,
  attempt = 0,
): Promise<boolean> {
  // SSRF protection — refuse to deliver to private/internal addresses
  if (isInternalUrl(url)) {
    console.warn(`[webhooks] Blocked delivery to internal URL for ${webhookId}`);
    return false;
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), DELIVERY_TIMEOUT_MS);

    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type':        'application/json',
        'X-Gadnuc-Signature':  signature,
        'X-Gadnuc-Webhook-Id': webhookId,
        'User-Agent':          'Gadnuc-Webhooks/1.0',
      },
      body,
      signal: controller.signal,
    });

    clearTimeout(timer);

    if (resp.ok || resp.status < 500) {
      // 2xx or 4xx — we consider this "delivered" (4xx is a client problem, not ours)
      return true;
    }

    throw new Error(`HTTP ${resp.status}`);
  } catch (err) {
    if (attempt < MAX_RETRIES) {
      const delay = RETRY_DELAYS_MS[attempt] ?? 120_000;
      console.warn(
        `[webhooks] Delivery failed for ${webhookId} (attempt ${attempt + 1}/${MAX_RETRIES}), ` +
        `retrying in ${delay / 1000}s: ${(err as Error).message}`,
      );
      await new Promise((r) => setTimeout(r, delay));
      return deliverWithRetry(url, body, signature, webhookId, attempt + 1);
    }

    console.error(
      `[webhooks] Delivery permanently failed for ${webhookId}: ${(err as Error).message}`,
    );
    return false;
  }
}

/**
 * Emit a webhook event for a specific tenant.
 *
 * Queries all active webhooks for this tenant that subscribe to the event
 * type, then delivers payloads in parallel (fire-and-forget from the
 * caller's perspective).
 */
export async function emitWebhookEvent(
  tenantId: string,
  event: WebhookEventType,
  data: Record<string, unknown>,
): Promise<void> {
  const pool = getPool();

  let hooks: WebhookRow[];
  try {
    const { rows } = await pool.query<WebhookRow>(
      `SELECT id, url, signing_secret, events
       FROM public.webhooks
       WHERE tenant_id = $1 AND is_active = true
         AND (events @> $2::jsonb OR events = '["*"]'::jsonb)`,
      [tenantId, JSON.stringify([event])],
    );
    hooks = rows;
  } catch (err) {
    console.error('[webhooks] Failed to query webhooks:', err);
    return;
  }

  if (hooks.length === 0) return;

  const payload: WebhookPayload = {
    event,
    tenant_id: tenantId,
    timestamp: new Date().toISOString(),
    data,
  };
  const bodyStr = JSON.stringify(payload);

  // Deliver to all matching webhooks in parallel (fire-and-forget)
  const deliveries = hooks.map(async (hook) => {
    const signature = sign(bodyStr, hook.signing_secret);
    const success = await deliverWithRetry(hook.url, bodyStr, signature, hook.id);

    // Log delivery result
    try {
      await pool.query(
        `INSERT INTO public.webhook_deliveries
           (webhook_id, event_type, payload, response_status, success)
         VALUES ($1, $2, $3, $4, $5)`,
        [hook.id, event, payload, success ? 200 : 0, success],
      );

      if (success) {
        // Reset consecutive failure count
        await pool.query(
          'UPDATE public.webhooks SET consecutive_failures = 0 WHERE id = $1',
          [hook.id],
        );
      } else {
        // Increment failure count, auto-disable at threshold
        await pool.query(
          `UPDATE public.webhooks
           SET consecutive_failures = consecutive_failures + 1,
               is_active = CASE WHEN consecutive_failures + 1 >= 10 THEN false ELSE is_active END,
               updated_at = now()
           WHERE id = $1`,
          [hook.id],
        );
      }
    } catch (logErr) {
      console.error('[webhooks] Failed to log delivery:', logErr);
    }
  });

  // Don't await — let deliveries happen in the background
  Promise.allSettled(deliveries).catch(() => {});
}
