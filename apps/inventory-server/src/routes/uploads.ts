/**
 * Media upload pre-signing
 *
 * POST /api/uploads/presign  — returns a pre-signed PUT URL for DigitalOcean Spaces
 */

import { Router }            from 'express';
import { z }                 from 'zod';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl }      from '@aws-sdk/s3-request-presigner';
import { requireAuth }       from '@gadnuc/auth';
import { withTenantSchema }  from '@gadnuc/db';
import type { Request, Response } from 'express';

export const uploadsRouter = Router();

const ALLOWED_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif',
]);
const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

function getS3(): S3Client {
  const endpoint = process.env.DO_SPACES_ENDPOINT;
  const region   = process.env.DO_SPACES_REGION ?? 'nyc3';
  const key      = process.env.DO_SPACES_KEY;
  const secret   = process.env.DO_SPACES_SECRET;

  if (!endpoint || !key || !secret) {
    throw new Error('DO_SPACES_ENDPOINT, DO_SPACES_KEY, and DO_SPACES_SECRET must be set');
  }

  return new S3Client({
    endpoint: `https://${endpoint}`,
    region,
    credentials: { accessKeyId: key, secretAccessKey: secret },
    forcePathStyle: false,
  });
}

const presignSchema = z.object({
  filename:    z.string().min(1).max(255),
  contentType: z.string().refine((t) => ALLOWED_TYPES.has(t), {
    message: 'Content type not allowed. Supported: JPEG, PNG, WebP, GIF, AVIF',
  }),
  sizeBytes:   z.number().int().min(1).max(MAX_SIZE_BYTES),
});

uploadsRouter.post(
  '/presign',
  requireAuth,
  async (req: Request, res: Response) => {
    const tenant = (req as any).tenant as { id: number; slug: string } | undefined;
    if (!tenant) { res.status(400).json({ error: 'Tenant not resolved' }); return; }

    const parsed = presignSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(422).json({ error: 'Validation failed', issues: parsed.error.issues });
      return;
    }

    const { filename, contentType, sizeBytes } = parsed.data;
    const bucket  = process.env.DO_SPACES_BUCKET;
    const cdnBase = process.env.DO_SPACES_CDN_URL;

    if (!bucket) { res.status(500).json({ error: 'DO_SPACES_BUCKET not configured' }); return; }

    // Sanitise filename and build object key
    const ext         = filename.split('.').pop()?.toLowerCase() ?? 'bin';
    const safe        = filename.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 100);
    const timestamp   = Date.now();
    const objectKey   = `tenants/${tenant.slug}/uploads/${timestamp}-${safe}`;
    const publicUrl   = cdnBase
      ? `${cdnBase.replace(/\/$/, '')}/${objectKey}`
      : `https://${bucket}.${process.env.DO_SPACES_ENDPOINT}/${objectKey}`;

    try {
      const s3  = getS3();
      const cmd = new PutObjectCommand({
        Bucket:        bucket,
        Key:           objectKey,
        ContentType:   contentType,
        ContentLength: sizeBytes,
        ACL:           'public-read',
        Metadata:      { 'x-tenant-slug': tenant.slug },
      });
      const uploadUrl = await getSignedUrl(s3, cmd, { expiresIn: 300 });

      // Record the upload intent in DB (finalized when client confirms PUT succeeded)
      const userId = (req as any).user?.id ?? null;
      await withTenantSchema(tenant.slug, async (db: any) => {
        await db.query(
          `INSERT INTO media_uploads (key, url, filename, mime_type, size_bytes, uploaded_by)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (key) DO NOTHING`,
          [objectKey, publicUrl, filename, contentType, sizeBytes, userId],
        );
      });

      res.json({
        uploadUrl,
        publicUrl,
        key: objectKey,
        expiresIn: 300,
      });
    } catch (err) {
      console.error('[uploads] presign error:', err);
      res.status(500).json({ error: 'Failed to generate upload URL' });
    }
  },
);
