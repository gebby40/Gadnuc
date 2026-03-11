import type { Product } from '@/lib/tenant-api';

interface Props {
  products:    Product[];
  tenantSlug:  string;
}

function formatPrice(cents: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
}

export function ProductGrid({ products, tenantSlug }: Props) {
  if (!products.length) {
    return (
      <div style={{ textAlign: 'center', padding: '4rem', color: '#888' }}>
        <p style={{ fontSize: '1.25rem' }}>No products available yet.</p>
      </div>
    );
  }

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
      gap: '1.5rem',
    }}>
      {products.map((product) => (
        <a
          key={product.id}
          href={`/tenant/${tenantSlug}/products/${product.id}`}
          style={{ textDecoration: 'none', color: 'inherit' }}
        >
          <article style={{
            border: '1px solid #e5e7eb',
            borderRadius: '12px',
            overflow: 'hidden',
            transition: 'box-shadow 0.2s, transform 0.2s',
            cursor: 'pointer',
            background: '#fff',
          }}>
            <div style={{
              height: '200px',
              background: '#f3f4f6',
              overflow: 'hidden',
            }}>
              {product.image_url ? (
                <img
                  src={product.image_url}
                  alt={product.name}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              ) : (
                <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#bbb', fontSize: '3rem' }}>
                  📦
                </div>
              )}
            </div>
            <div style={{ padding: '1rem' }}>
              <p style={{ fontSize: '0.75rem', color: '#6b7280', margin: '0 0 0.25rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {product.category ?? 'General'}
              </p>
              <h3 style={{ fontSize: '1rem', fontWeight: 600, margin: '0 0 0.5rem' }}>
                {product.name}
              </h3>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '1.125rem', fontWeight: 700 }}>
                  {formatPrice(product.price_cents)}
                </span>
                <span style={{
                  fontSize: '0.75rem',
                  color: product.stock_qty > 0 ? '#16a34a' : '#dc2626',
                  fontWeight: 500,
                }}>
                  {product.stock_qty > 0 ? `${product.stock_qty} in stock` : 'Out of stock'}
                </span>
              </div>
            </div>
          </article>
        </a>
      ))}
    </div>
  );
}
