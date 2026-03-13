'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '../../../../../components/AuthProvider';
import { tenantGet, tenantFetch } from '../../../../../lib/api';

interface Product {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  category: string | null;
  price_cents: number;
  wholesale_price_cents: number | null;
  stock_qty: number;
  low_stock_threshold: number;
  image_url: string | null;
  is_active: boolean;
  wholesale_only: boolean;
  created_at: string;
  updated_at: string;
}

interface ProductsResponse {
  data: Product[];
  pagination: { total: number; limit: number; offset: number };
}

const PAGE_SIZE = 25;

export default function ProductListPage() {
  const params = useParams();
  const router = useRouter();
  const slug = params.slug as string;
  const { user, token } = useAuth();

  const [products, setProducts] = useState<Product[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [categories, setCategories] = useState<string[]>([]);

  const fetchProducts = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        offset: String(page * PAGE_SIZE),
      });
      if (search) params.set('search', search);
      if (categoryFilter) params.set('category', categoryFilter);

      const res = await tenantGet<ProductsResponse>(slug, token, `/api/products?${params}`);
      setProducts(res.data);
      setTotal(res.pagination.total);

      // Collect unique categories for filter
      if (!categoryFilter && page === 0) {
        const allRes = await tenantGet<ProductsResponse>(slug, token, '/api/products?limit=200');
        const cats = [...new Set(allRes.data.map(p => p.category).filter(Boolean))] as string[];
        setCategories(cats.sort());
      }
    } catch (err) {
      console.error('Failed to load products:', err);
    } finally {
      setLoading(false);
    }
  }, [slug, token, page, search, categoryFilter]);

  useEffect(() => { fetchProducts(); }, [fetchProducts]);

  // Reset page when filters change
  useEffect(() => { setPage(0); }, [search, categoryFilter]);

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const allSelected = products.length > 0 && products.every(p => selected.has(p.id));

  function toggleSelect(id: string) {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(products.map(p => p.id)));
    }
  }

  async function handleExport() {
    if (!token) return;
    try {
      const res = await tenantFetch(slug, token, '/api/products/export');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'products.csv';
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export failed:', err);
    }
  }

  function formatPrice(cents: number) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
  }

  const canManage = user?.role === 'operator' || user?.role === 'tenant_admin';

  return (
    <div style={{ padding: '2rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#0f172a', margin: 0 }}>Products</h1>
          <p style={{ color: '#64748b', fontSize: '0.85rem', marginTop: '0.25rem' }}>
            {total} product{total !== 1 ? 's' : ''} total
          </p>
        </div>
        {canManage && (
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button onClick={handleExport} style={secondaryBtnStyle}>Export CSV</button>
            <button onClick={() => router.push(`/tenant/${slug}/dashboard/products/import`)} style={secondaryBtnStyle}>
              Import CSV
            </button>
            {selected.size > 0 && (
              <button
                onClick={() => router.push(`/tenant/${slug}/dashboard/products/bulk-edit?ids=${[...selected].join(',')}`)}
                style={secondaryBtnStyle}
              >
                Bulk Edit ({selected.size})
              </button>
            )}
            <button onClick={() => router.push(`/tenant/${slug}/dashboard/products/new`)} style={primaryBtnStyle}>
              + Add Product
            </button>
          </div>
        )}
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem' }}>
        <input
          type="text"
          placeholder="Search by name or SKU..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            flex: 1, padding: '0.5rem 0.75rem', borderRadius: '8px',
            border: '1px solid #d1d5db', fontSize: '0.85rem', outline: 'none',
          }}
        />
        <select
          value={categoryFilter}
          onChange={e => setCategoryFilter(e.target.value)}
          style={{
            padding: '0.5rem 0.75rem', borderRadius: '8px',
            border: '1px solid #d1d5db', fontSize: '0.85rem', outline: 'none',
            background: '#fff', minWidth: '150px',
          }}
        >
          <option value="">All categories</option>
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {/* Table */}
      <div style={{
        background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0',
        overflow: 'hidden',
      }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
          <thead>
            <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
              {canManage && (
                <th style={{ ...thStyle, width: '40px' }}>
                  <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} />
                </th>
              )}
              <th style={{ ...thStyle, width: '50px' }}></th>
              <th style={thStyle}>SKU</th>
              <th style={thStyle}>Name</th>
              <th style={thStyle}>Category</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>Price</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>W/S Price</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>Stock</th>
              <th style={{ ...thStyle, textAlign: 'center' }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={canManage ? 9 : 8} style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>Loading...</td></tr>
            ) : products.length === 0 ? (
              <tr>
                <td colSpan={canManage ? 9 : 8} style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>
                  {search || categoryFilter ? 'No products match your filters.' : 'No products yet. Add your first product!'}
                </td>
              </tr>
            ) : products.map(p => (
              <tr
                key={p.id}
                onClick={() => router.push(`/tenant/${slug}/dashboard/products/${p.id}`)}
                style={{
                  borderBottom: '1px solid #f1f5f9', cursor: 'pointer',
                  background: selected.has(p.id) ? '#eff6ff' : undefined,
                }}
                onMouseEnter={e => { if (!selected.has(p.id)) (e.currentTarget as HTMLElement).style.background = '#f8fafc'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = selected.has(p.id) ? '#eff6ff' : ''; }}
              >
                {canManage && (
                  <td style={tdStyle} onClick={e => { e.stopPropagation(); toggleSelect(p.id); }}>
                    <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggleSelect(p.id)} />
                  </td>
                )}
                <td style={tdStyle}>
                  {p.image_url ? (
                    <img src={p.image_url} alt="" style={{ width: '36px', height: '36px', objectFit: 'cover', borderRadius: '6px' }} />
                  ) : (
                    <div style={{ width: '36px', height: '36px', background: '#f1f5f9', borderRadius: '6px' }} />
                  )}
                </td>
                <td style={{ ...tdStyle, fontFamily: 'monospace', fontSize: '0.8rem', color: '#64748b' }}>{p.sku}</td>
                <td style={{ ...tdStyle, fontWeight: 600, color: '#0f172a' }}>{p.name}</td>
                <td style={{ ...tdStyle, color: '#64748b' }}>{p.category ?? '—'}</td>
                <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 500 }}>{formatPrice(p.price_cents)}</td>
                <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 500 }}>
                  {p.wholesale_price_cents != null ? (
                    <span style={{ color: '#7c3aed' }}>{formatPrice(p.wholesale_price_cents)}</span>
                  ) : (
                    <span style={{ color: '#d1d5db' }}>—</span>
                  )}
                  {p.wholesale_only && (
                    <span style={{
                      display: 'inline-block', marginLeft: '0.35rem', padding: '0.1rem 0.35rem',
                      borderRadius: '999px', fontSize: '0.65rem', fontWeight: 700,
                      background: '#f5f3ff', color: '#7c3aed', verticalAlign: 'middle',
                    }}>
                      W/S Only
                    </span>
                  )}
                </td>
                <td style={{
                  ...tdStyle, textAlign: 'right', fontWeight: 500,
                  color: p.stock_qty <= p.low_stock_threshold ? '#ef4444' : '#059669',
                }}>
                  {p.stock_qty}
                </td>
                <td style={{ ...tdStyle, textAlign: 'center' }}>
                  <span style={{
                    display: 'inline-block', padding: '0.15rem 0.5rem', borderRadius: '999px',
                    fontSize: '0.75rem', fontWeight: 600,
                    background: p.is_active ? '#dcfce7' : '#f1f5f9',
                    color: p.is_active ? '#16a34a' : '#94a3b8',
                  }}>
                    {p.is_active ? 'Active' : 'Inactive'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1rem' }}>
          <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
            Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total}
          </span>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              disabled={page === 0}
              onClick={() => setPage(p => p - 1)}
              style={{ ...pageBtnStyle, opacity: page === 0 ? 0.4 : 1 }}
            >
              ← Prev
            </button>
            <button
              disabled={page >= totalPages - 1}
              onClick={() => setPage(p => p + 1)}
              style={{ ...pageBtnStyle, opacity: page >= totalPages - 1 ? 0.4 : 1 }}
            >
              Next →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const thStyle: React.CSSProperties = {
  padding: '0.6rem 0.75rem', textAlign: 'left', fontSize: '0.75rem',
  fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em',
};

const tdStyle: React.CSSProperties = {
  padding: '0.6rem 0.75rem', verticalAlign: 'middle',
};

const primaryBtnStyle: React.CSSProperties = {
  padding: '0.5rem 1rem', background: '#0f172a', color: '#fff',
  border: 'none', borderRadius: '8px', fontSize: '0.85rem',
  fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
};

const secondaryBtnStyle: React.CSSProperties = {
  padding: '0.5rem 1rem', background: '#fff', color: '#374151',
  border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '0.85rem',
  fontWeight: 500, cursor: 'pointer', whiteSpace: 'nowrap',
};

const pageBtnStyle: React.CSSProperties = {
  padding: '0.4rem 0.75rem', background: '#fff', color: '#374151',
  border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '0.8rem',
  cursor: 'pointer',
};
