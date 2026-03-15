import { Router } from 'express';
import { requireAuth, requireRole } from '@gadnuc/auth';
import { getPool } from '@gadnuc/db';

export const auditRouter = Router();
auditRouter.use(requireAuth, requireRole('super_admin'));

// GET /api/audit?tenant_id=&event_type=&limit=&page=
auditRouter.get('/', async (req, res) => {
  const { tenant_id, event_type, page = '1', limit = '50' } = req.query;
  const pageNum  = Math.max(1, parseInt(page as string, 10) || 1);
  const limitNum = Math.min(200, Math.max(1, parseInt(limit as string, 10) || 50));
  const offset   = (pageNum - 1) * limitNum;
  const pool = getPool();

  const params: unknown[] = [limitNum, offset];
  const conds: string[] = ['1=1'];
  if (tenant_id) { params.push(tenant_id); conds.push(`a.tenant_id = $${params.length}`); }
  if (event_type) { params.push(event_type); conds.push(`a.event_type = $${params.length}`); }

  try {
    const { rows } = await pool.query(
      `SELECT a.*, t.slug AS tenant_slug, COUNT(*) OVER() AS total_count
       FROM public.audit_log a
       LEFT JOIN public.tenants t ON a.tenant_id = t.id
       WHERE ${conds.join(' AND ')}
       ORDER BY a.created_at DESC
       LIMIT $1 OFFSET $2`,
      params
    );
    const total = rows[0]?.total_count ?? 0;
    res.json({
      data: rows,
      meta: { page: pageNum, limit: limitNum, total: parseInt(total) },
    });
  } catch (err) {
    console.error('[audit] List error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});
