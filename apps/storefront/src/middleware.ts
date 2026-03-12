import { NextResponse, type NextRequest } from 'next/server';

/**
 * Next.js Edge Middleware — path-based tenant routing.
 *
 * Tenant stores live at gadnuc.com/tenant/{slug}/...
 * The middleware sets x-tenant-slug and x-original-host headers
 * for server components to use when calling backend APIs.
 */
export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // Skip internal Next.js paths
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api/') ||
    pathname.startsWith('/manager/') ||
    pathname.startsWith('/favicon') ||
    pathname === '/health'
  ) {
    return NextResponse.next();
  }

  // Extract tenant slug from /tenant/{slug}/... paths
  const tenantMatch = pathname.match(/^\/tenant\/([a-z0-9_]+)(\/|$)/);

  if (tenantMatch) {
    const tenantSlug = tenantMatch[1];
    const host = request.headers.get('host') ?? '';

    // Set tenant headers for server components
    const response = NextResponse.next();
    response.headers.set('x-tenant-slug', tenantSlug);
    response.headers.set('x-original-host', host.split(':')[0]);
    return response;
  }

  // All other paths (/, /login, /platform-admin, etc.) are platform routes
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
