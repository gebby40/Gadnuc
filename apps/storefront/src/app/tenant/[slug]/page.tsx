/**
 * Tenant storefront homepage.
 * Nav, Footer, and ThemeProvider are injected by the parent layout.tsx.
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

  return (
    <>
      <HeroSection
        title={settings.hero_title ?? 'Welcome'}
        subtitle={settings.hero_subtitle ?? null}
        imageUrl={settings.hero_image_url ?? null}
        primaryColor={settings.primary_color ?? '#0070f3'}
        slug={params.slug}
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
