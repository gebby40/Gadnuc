import { NextResponse, type NextRequest } from 'next/server';

const PLATFORM_DOMAIN = process.env.PLATFORM_DOMAIN ?? 'gadnuc.io';

/**
 * Next.js Edge Middleware — resolves tenant from subdomain or custom domain
 * and rewrites requests to the appropriate tenant route.
 *
 * acme.gadnuc.io/products → /tenants/acme/products (internally)
 */
export function middleware(request: NextRequest) {
  const host = request.headers.get('host') ?? '';
  const hostname = host.split(':')[0].toLowerCase();
  const pathname = request.nextUrl.pathname;

  // Skip internal Next.js paths
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api/') ||
    pathname.startsWith('/favicon') ||
    pathname === '/health'
  ) {
    return NextResponse.next();
  }

  // Extract tenant slug from subdomain
  let tenantSlug: string | null = null;

  if (hostname.endsWith(`.${PLATFORM_DOMAIN}`)) {
    tenantSlug = hostname.slice(0, hostname.length - PLATFORM_DOMAIN.length - 1);
  } else if (!hostname.includes(PLATFORM_DOMAIN)) {
    // Custom domain — pass through; server component will do the lookup
    tenantSlug = 'custom';
  }

  if (!tenantSlug) {
    // Root platform domain — redirect to marketing page
    return NextResponse.next();
  }

  // Rewrite to tenant-scoped route with slug in header
  const response = NextResponse.rewrite(
    new URL(`/tenant/${tenantSlug}${pathname}`, request.url)
  );
  response.headers.set('x-tenant-slug', tenantSlug);
  response.headers.set('x-original-host', hostname);

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
