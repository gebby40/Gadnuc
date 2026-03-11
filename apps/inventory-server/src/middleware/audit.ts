/**
 * Audit-log helper — fire-and-forget writes to public.audit_log.
 *
 * Errors are caught and logged to stderr so that a DB hiccup never breaks
 * the primary request path.
 */

import { getPool } from '@gadnuc/db';
import type { Request } from 'express';

export interface AuditEventOpts {
  req:      Request;
  action:   string;           // e.g. 'auth.login', 'auth.mfa_verify'
  tenantId: number | null;
  userId:   number | null;
  metadata?: Record<string, unknown>;
}

export function logAuditEvent(opts: AuditEventOpts): void {
  const pool = getPool();
  const ip   = (opts.req.headers['x-forwarded-for'] as string | undefined)
                 ?.split(',')[0]?.trim()
               ?? opts.req.socket.remoteAddress
               ?? null;

  pool
    .query(
      `INSERT INTO public.audit_log
         (tenant_id, user_id, action, ip_address, metadata)
       VALUES ($1, $2, $3, $4, $5)`,
      [opts.tenantId, opts.userId, opts.action, ip, opts.metadata ?? null],
    )
    .catch((err: Error) => {
      console.error('[audit] Failed to write audit log:', err.message);
    });
}
