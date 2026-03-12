'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '../../../../../../components/AuthProvider';
import { tenantGet, tenantPatch } from '../../../../../../lib/api';

interface Product {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  category: string | null;
  price_cents: number;
  stock_qty: number;
  low_stock_threshold: number;
  image_url: string | null;
  is_active: boolean;
}

interface EditRow {
  id: string;
  sku: string;
  name: string;
  category: string;
  price: string;
  stock_qty: string;
  low_stock_threshold: string;
  is_active: boolean;
}

interface OriginalRow {
  id: string;
  sku: string;
  name: string;
  category: string;
  price: string;
  stock_qty: string;
  low_stock_threshold: string;
  is_active: boolean;
}

const EDITABLE_FIELDS = ['sku', 'name', 'category', 'price', 'stock_qty', 'low_stock_threshold', 'is_active'] as const;
type EditableField = typeof EDITABLE_FIELDS[number];

export default function BulkEditPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const slug = params.slug as string;
  const { token } = useAuth();

  const ids = (searchParams.get('ids') ?? '').split(',').filter(Boolean);
  const [rows, setRows] = useState<EditRow[]>([]);
  const [originals, setOriginals] = useState<OriginalRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ updated: number; errors: { id: string; error: string }[] } | null>(null);

  // Apply-to-all row
  const [applyValues, setApplyValues] = useState<Record<string, string>>({
    category: '', price: '', stock_qty: '', low_stock_threshold: '',
  });

  useEffect(() => {
    if (!token || ids.length === 0) return;
    (async () => {
      try {
        // Fetch each product
        const products = await Promise.all(
          ids.map(id => tenantGet<{ data: Product }>(slug, token, `/api/products/${id}`).then(r => r.data))
        );

        const editRows: EditRow[] = products.map(p => ({
          id: p.id,
          sku: p.sku,
          name: p.name,
          category: p.category ?? '',
          price: (p.price_cents / 100).toFixed(2),
          stock_qty: String(p.stock_qty),
          low_stock_threshold: String(p.low_stock_threshold),
          is_active: p.is_active,
        }));

        setRows(editRows);
        setOriginals(editRows.map(r => ({ ...r })));
      } catch (err: any) {
        setError(err.message ?? 'Failed to load products');
      } finally {
        setLoading(false);
      }
    })();
  }, [slug, token]);

  function updateRow(index: number, field: EditableField, value: string | boolean) {
    setRows(prev => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  }

  function applyToAll(field: string) {
    const val = applyValues[field];
    if (!val && val !== '0') return;
    setRows(prev => prev.map(r => ({ ...r, [field]: val })));
    setApplyValues(prev => ({ ...prev, [field]: '' }));
  }

  function hasChanged(rowIdx: number, field: EditableField): boolean {
    const orig = originals[rowIdx];
    if (!orig) return false;
    return String(rows[rowIdx][field]) !== String(orig[field]);
  }

  async function handleSave() {
    setError('');
    setSaving(true);
    setResult(null);

    try {
      // Build updates: only changed fields per product
      const updates: { id: string; [key: string]: unknown }[] = [];

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const orig = originals[i];
        const changed: Record<string, unknown> = {};

        if (row.sku !== orig.sku) changed.sku = row.sku;
        if (row.name !== orig.name) changed.name = row.name;
        if (row.category !== orig.category) changed.category = row.category || undefined;
        if (row.price !== orig.price) changed.price_cents = Math.round(parseFloat(row.price) * 100);
        if (row.stock_qty !== orig.stock_qty) changed.stock_qty = parseInt(row.stock_qty) || 0;
        if (row.low_stock_threshold !== orig.low_stock_threshold) changed.low_stock_threshold = parseInt(row.low_stock_threshold) || 0;
        if (row.is_active !== orig.is_active) changed.is_active = row.is_active;

        if (Object.keys(changed).length > 0) {
          updates.push({ id: row.id, ...changed });
        }
      }

      if (updates.length === 0) {
        setError('No changes detected');
        setSaving(false);
        return;
      }

      const res = await tenantPatch<{ updated: number; errors: { id: string; error: string }[] }>(
        slug, token!, '/api/products/bulk', { updates }
      );
      setResult(res);

      if (res.errors.length === 0) {
        // All succeeded — update originals to match current rows
        setOriginals(rows.map(r => ({ ...r })));
      }
    } catch (err: any) {
      setError(err.message ?? 'Bulk update failed');
    } finally {
      setSaving(false);
    }
  }

  if (ids.length === 0) {
    return (
      <div style={{ padding: '2rem', color: '#94a3b8' }}>
        No products selected. <a href={`/tenant/${slug}/dashboard/products`} style={{ color: '#3b82f6' }}>Go back</a>
      </div>
    );
  }

  if (loading) {
    return <div style={{ padding: '2rem', color: '#94a3b8' }}>Loading products...</div>;
  }

  return (
    <div style={{ padding: '2rem' }}>
      <button
        onClick={() => router.push(`/tenant/${slug}/dashboard/products`)}
        style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: '0.85rem', padding: 0, marginBottom: '1rem' }}
      >
        ← Back to products
      </button>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#0f172a', margin: 0 }}>
          Bulk Edit ({rows.length} products)
        </h1>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button onClick={() => router.push(`/tenant/${slug}/dashboard/products`)} style={cancelBtnStyle}>Cancel</button>
          <button onClick={handleSave} disabled={saving} style={{
            ...saveBtnStyle, background: saving ? '#94a3b8' : '#0f172a', cursor: saving ? 'not-allowed' : 'pointer',
          }}>
            {saving ? 'Saving...' : 'Save All Changes'}
          </button>
        </div>
      </div>

      {error && (
        <div style={{ background: '#fef2f2', color: '#dc2626', padding: '0.6rem 0.75rem', borderRadius: '8px', fontSize: '0.85rem', marginBottom: '1rem' }}>
          {error}
        </div>
      )}

      {result && (
        <div style={{
          background: result.errors.length > 0 ? '#fffbeb' : '#f0fdf4',
          color: result.errors.length > 0 ? '#92400e' : '#166534',
          padding: '0.6rem 0.75rem', borderRadius: '8px', fontSize: '0.85rem', marginBottom: '1rem',
        }}>
          {result.updated} product{result.updated !== 1 ? 's' : ''} updated.
          {result.errors.length > 0 && ` ${result.errors.length} error(s): ${result.errors.map(e => e.error).join(', ')}`}
        </div>
      )}

      <div style={{ overflowX: 'auto', background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
          <thead>
            <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
              <th style={thStyle}>SKU</th>
              <th style={thStyle}>Name</th>
              <th style={thStyle}>Category</th>
              <th style={{ ...thStyle, width: '100px' }}>Price ($)</th>
              <th style={{ ...thStyle, width: '80px' }}>Stock</th>
              <th style={{ ...thStyle, width: '80px' }}>Low Threshold</th>
              <th style={{ ...thStyle, width: '70px' }}>Active</th>
            </tr>
            {/* Apply-to-all row */}
            <tr style={{ background: '#eff6ff', borderBottom: '2px solid #bfdbfe' }}>
              <td style={tdStyle} colSpan={2}>
                <span style={{ color: '#3b82f6', fontWeight: 600, fontSize: '0.75rem' }}>⬇ APPLY TO ALL</span>
              </td>
              <td style={tdStyle}>
                <div style={{ display: 'flex', gap: '0.25rem' }}>
                  <input value={applyValues.category} onChange={e => setApplyValues(p => ({ ...p, category: e.target.value }))}
                    style={cellInputStyle} placeholder="..." />
                  <button onClick={() => applyToAll('category')} style={applyBtnStyle}>Apply</button>
                </div>
              </td>
              <td style={tdStyle}>
                <div style={{ display: 'flex', gap: '0.25rem' }}>
                  <input value={applyValues.price} onChange={e => setApplyValues(p => ({ ...p, price: e.target.value }))}
                    type="number" step="0.01" style={cellInputStyle} placeholder="..." />
                  <button onClick={() => applyToAll('price')} style={applyBtnStyle}>Apply</button>
                </div>
              </td>
              <td style={tdStyle}>
                <div style={{ display: 'flex', gap: '0.25rem' }}>
                  <input value={applyValues.stock_qty} onChange={e => setApplyValues(p => ({ ...p, stock_qty: e.target.value }))}
                    type="number" style={cellInputStyle} placeholder="..." />
                  <button onClick={() => applyToAll('stock_qty')} style={applyBtnStyle}>Apply</button>
                </div>
              </td>
              <td style={tdStyle}>
                <div style={{ display: 'flex', gap: '0.25rem' }}>
                  <input value={applyValues.low_stock_threshold} onChange={e => setApplyValues(p => ({ ...p, low_stock_threshold: e.target.value }))}
                    type="number" style={cellInputStyle} placeholder="..." />
                  <button onClick={() => applyToAll('low_stock_threshold')} style={applyBtnStyle}>Apply</button>
                </div>
              </td>
              <td style={tdStyle}></td>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={row.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                <td style={tdStyle}>
                  <input value={row.sku} onChange={e => updateRow(i, 'sku', e.target.value)}
                    style={{ ...cellInputStyle, background: hasChanged(i, 'sku') ? '#fef3c7' : undefined }} />
                </td>
                <td style={tdStyle}>
                  <input value={row.name} onChange={e => updateRow(i, 'name', e.target.value)}
                    style={{ ...cellInputStyle, background: hasChanged(i, 'name') ? '#fef3c7' : undefined }} />
                </td>
                <td style={tdStyle}>
                  <input value={row.category} onChange={e => updateRow(i, 'category', e.target.value)}
                    style={{ ...cellInputStyle, background: hasChanged(i, 'category') ? '#fef3c7' : undefined }} />
                </td>
                <td style={tdStyle}>
                  <input type="number" step="0.01" min="0" value={row.price} onChange={e => updateRow(i, 'price', e.target.value)}
                    style={{ ...cellInputStyle, background: hasChanged(i, 'price') ? '#fef3c7' : undefined, textAlign: 'right' }} />
                </td>
                <td style={tdStyle}>
                  <input type="number" min="0" value={row.stock_qty} onChange={e => updateRow(i, 'stock_qty', e.target.value)}
                    style={{ ...cellInputStyle, background: hasChanged(i, 'stock_qty') ? '#fef3c7' : undefined, textAlign: 'right' }} />
                </td>
                <td style={tdStyle}>
                  <input type="number" min="0" value={row.low_stock_threshold} onChange={e => updateRow(i, 'low_stock_threshold', e.target.value)}
                    style={{ ...cellInputStyle, background: hasChanged(i, 'low_stock_threshold') ? '#fef3c7' : undefined, textAlign: 'right' }} />
                </td>
                <td style={{ ...tdStyle, textAlign: 'center' }}>
                  <input type="checkbox" checked={row.is_active} onChange={e => updateRow(i, 'is_active', e.target.checked)}
                    style={{ accentColor: hasChanged(i, 'is_active') ? '#f59e0b' : undefined }} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '0.75rem' }}>
        Changed cells are highlighted in yellow. Only modified fields will be sent to the server.
      </p>
    </div>
  );
}

const thStyle: React.CSSProperties = {
  padding: '0.5rem 0.6rem', textAlign: 'left', fontSize: '0.7rem',
  fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em',
};

const tdStyle: React.CSSProperties = {
  padding: '0.3rem 0.4rem', verticalAlign: 'middle',
};

const cellInputStyle: React.CSSProperties = {
  width: '100%', padding: '0.35rem 0.5rem', borderRadius: '4px',
  border: '1px solid #e2e8f0', fontSize: '0.8rem', outline: 'none', boxSizing: 'border-box',
};

const applyBtnStyle: React.CSSProperties = {
  padding: '0.25rem 0.5rem', background: '#3b82f6', color: '#fff',
  border: 'none', borderRadius: '4px', fontSize: '0.7rem', cursor: 'pointer', whiteSpace: 'nowrap',
};

const saveBtnStyle: React.CSSProperties = {
  padding: '0.5rem 1rem', color: '#fff', border: 'none', borderRadius: '8px',
  fontSize: '0.85rem', fontWeight: 600,
};

const cancelBtnStyle: React.CSSProperties = {
  padding: '0.5rem 1rem', background: '#fff', color: '#374151',
  border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '0.85rem', cursor: 'pointer',
};
