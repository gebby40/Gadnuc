/**
 * Catch-all proxy: /api/* → inventory-server
 *
 * The inventory-server is an internal DO App Platform service (not publicly
 * reachable).  This Next.js route handler proxies every /api/* request to it,
 * preserving headers and the raw body (required for Stripe webhook signature
 * verification).
 */

const UPSTREAM = process.env.INVENTORY_SERVER_URL ?? 'http://localhost:3001';

function forwardHeaders(req: Request): HeadersInit {
  const headers: Record<string, string> = {};
  // Forward standard headers the backends need
  for (const key of ['content-type', 'authorization', 'x-tenant-slug', 'x-forwarded-for', 'x-real-ip', 'stripe-signature']) {
    const val = req.headers.get(key);
    if (val) headers[key] = val;
  }
  return headers;
}

async function proxy(req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const suffix   = path.join('/');
  const upstream = new URL(`/api/${suffix}`, UPSTREAM);
  upstream.search = new URL(req.url).search;

  const init: RequestInit = {
    method:  req.method,
    headers: forwardHeaders(req),
  };

  // Forward body for non-GET/HEAD
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    init.body = await req.arrayBuffer();
    // @ts-expect-error -- Node 18+ fetch supports duplex
    init.duplex = 'half';
  }

  const upstream_res = await fetch(upstream.toString(), init);

  // Build response headers (skip hop-by-hop)
  const resHeaders = new Headers();
  for (const [k, v] of upstream_res.headers.entries()) {
    if (!['transfer-encoding', 'connection', 'keep-alive'].includes(k.toLowerCase())) {
      resHeaders.set(k, v);
    }
  }

  return new Response(upstream_res.body, {
    status:  upstream_res.status,
    headers: resHeaders,
  });
}

export const GET     = proxy;
export const POST    = proxy;
export const PUT     = proxy;
export const PATCH   = proxy;
export const DELETE  = proxy;
export const OPTIONS = proxy;
