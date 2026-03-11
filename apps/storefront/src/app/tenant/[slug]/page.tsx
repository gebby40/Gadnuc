import { notFound } from 'next/navigation';
import { getTenantStorefront } from '@/lib/tenant-api';
import { HeroSection }    from '@/components/HeroSection';
import { ProductGrid }    from '@/components/ProductGrid';
import { StorefrontNav }  from '@/components/StorefrontNav';
import { StorefrontFooter } from '@/components/StorefrontFooter';

interface PageProps {
  params: { slug: string };
}

export async function generateMetadata({ params }: PageProps) {
  const data = await getTenantStorefront(params.slug);
  if (!data) return {};
  return {
    title:       data.settings.seo_title ?? data.tenant.display_name,
    description: data.settings.seo_description ?? `Welcome to ${data.tenant.display_name}`,
  };
}

export default async function TenantHomePage({ params }: PageProps) {
  const data = await getTenantStorefront(params.slug);
  if (!data) notFound();

  const { tenant, settings, products } = data;

  return (
    <div style={{ '--primary': settings.primary_color, '--accent': settings.accent_color } as React.CSSProperties}>
      <StorefrontNav tenant={tenant} settings={settings} />

      <HeroSection
        title={settings.hero_title}
        subtitle={settings.hero_subtitle}
        imageUrl={settings.hero_image_url}
        primaryColor={settings.primary_color}
      />

      <main style={{ maxWidth: '1200px', margin: '0 auto', padding: '2rem' }}>
        <h2 style={{ fontSize: '1.75rem', fontWeight: 700, marginBottom: '1.5rem' }}>
          Our Products
        </h2>
        <ProductGrid products={products} tenantSlug={params.slug} />
      </main>

      <StorefrontFooter tenant={tenant} settings={settings} />
    </div>
  );
}
