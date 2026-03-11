import { notFound } from 'next/navigation';
import { getTenantStorefront } from '@/lib/tenant-api';
import { ProductGrid }    from '@/components/ProductGrid';
import { StorefrontNav }  from '@/components/StorefrontNav';
import { StorefrontFooter } from '@/components/StorefrontFooter';

interface PageProps {
  params: { slug: string };
  searchParams: { category?: string; search?: string };
}

export default async function ProductsPage({ params, searchParams }: PageProps) {
  const data = await getTenantStorefront(params.slug);
  if (!data) notFound();

  const { tenant, settings } = data;

  // Fetch filtered products
  const query = new URLSearchParams();
  if (searchParams.category) query.set('category', searchParams.category);
  if (searchParams.search)   query.set('search', searchParams.search);
  query.set('active', 'true');

  const inventoryUrl = `${process.env.INVENTORY_SERVER_URL}/api/products?${query}`;
  const res = await fetch(inventoryUrl, {
    headers: { 'x-tenant-slug': params.slug },
    next: { revalidate: 60 },
  });
  const { data: products = [] } = res.ok ? await res.json() : { data: [] };

  return (
    <div>
      <StorefrontNav tenant={tenant} settings={settings} />
      <main style={{ maxWidth: '1200px', margin: '2rem auto', padding: '0 1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <h1 style={{ fontSize: '2rem', fontWeight: 700 }}>Products</h1>
          <form style={{ display: 'flex', gap: '0.5rem' }}>
            <input
              name="search"
              defaultValue={searchParams.search}
              placeholder="Search products..."
              style={{ padding: '0.5rem 1rem', border: '1px solid #ddd', borderRadius: '6px' }}
            />
            <button type="submit" style={{ padding: '0.5rem 1rem', background: settings.primary_color, color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>
              Search
            </button>
          </form>
        </div>
        <ProductGrid products={products} tenantSlug={params.slug} />
      </main>
      <StorefrontFooter tenant={tenant} settings={settings} />
    </div>
  );
}
