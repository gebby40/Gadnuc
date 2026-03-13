/**
 * Tenant storefront homepage.
 * Nav, Footer, and ThemeProvider are injected by the parent layout.tsx.
 *
 * If the tenant has uploaded a custom HTML page and enabled it,
 * we render that in a full-width sandboxed iframe instead of the
 * auto-generated hero + product grid.
 */
import { getTenantStorefront } from '@/lib/tenant-api';
import { HeroSection }  from '@/components/HeroSection';
import { ProductGrid }  from '@/components/ProductGrid';
import Link             from 'next/link';

interface PageProps {
  params: { slug: string };
}

export default async function TenantHomePage({ params }: PageProps) {
  const { settings, products } = await getTenantStorefront(params.slug);

  // ── Custom homepage: render iframe ────────────────────────────────────────
  if (settings.custom_homepage_enabled && settings.custom_homepage_url) {
    return (
      <iframe
        src={settings.custom_homepage_url}
        title="Custom storefront"
        sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
        style={{
          width: '100%',
          minHeight: 'calc(100vh - 64px)',
          border: 'none',
          display: 'block',
        }}
      />
    );
  }

  // ── Default auto-generated storefront ────────────────────────────────────
  return (
    <>
      <HeroSection
        title={settings.hero_title ?? 'Welcome'}
        subtitle={settings.hero_subtitle ?? null}
        imageUrl={settings.hero_image_url ?? null}
        primaryColor={settings.primary_color ?? '#0070f3'}
        slug={params.slug}
        enabled={settings.hero_enabled !== false}
      />

      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-12">
        <div className="flex items-center justify-between mb-8">
          <h2 className="text-2xl font-bold" style={{ color: 'var(--color-text)' }}>
            Featured Products
          </h2>
          <Link
            href={`/tenant/${params.slug}/products`}
            className="text-sm font-medium hover:opacity-75 transition-opacity"
            style={{ color: 'var(--color-primary)', textDecoration: 'none' }}
          >
            View all →
          </Link>
        </div>

        <ProductGrid products={products} tenantSlug={params.slug} />
      </section>
    </>
  );
}
