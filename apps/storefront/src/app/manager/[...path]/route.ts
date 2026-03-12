/**
 * Catch-all proxy: /manager/* → server-manager
 *
 * The server-manager is an internal DO App Platform service.  This Next.js
 * route handler proxies every /manager/* request to it.
 *
 * Path mapping:  /manager/api/auth/login → server-manager /api/auth/login
 */

const UPSTREAM = process.env.MANAGER_SERVER_URL ?? 'http://localhost:3002';

function forwardHeaders(req: Request): HeadersInit {
  const headers: Record<string, string> = {};
  for (const key of ['content-type', 'authorization', 'cookie', 'x-forwarded-for', 'x-real-ip', 'stripe-signature']) {
    const val = req.headers.get(key);
    if (val) headers[key] = val;
  }
  return headers;
}

async function proxy(req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const suffix   = path.join('/');
  const upstream = new URL(`/${suffix}`, UPSTREAM);
  upstream.search = new URL(req.url).search;

  const init: RequestInit = {
    method:  req.method,
    headers: forwardHeaders(req),
  };

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    init.body = await req.arrayBuffer();
    // @ts-expect-error -- Node 18+ fetch supports duplex
    init.duplex = 'half';
  }

  const upstream_res = await fetch(upstream.toString(), init);

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
