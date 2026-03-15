'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { useAuth } from '../../../../../../components/AuthProvider';
import { tenantGet, tenantPost, tenantDelete } from '../../../../../../lib/api';

interface ShippingMethod {
  id: string;
  zone_id: string;
  type: string;
  title: string;
  cost_cents: number;
  free_above_cents: number | null;
  per_item_cents: number;
  weight_rate_cents_per_oz: number;
  is_active: boolean;
  position: number;
}

interface ShippingZone {
  id: string;
  name: string;
  countries: string[];
  states: string[];
  zip_patterns: string[];
  priority: number;
  is_active: boolean;
  methods: ShippingMethod[];
}

const typeLabels: Record<string, string> = {
  flat_rate: 'Flat Rate',
  free_shipping: 'Free Shipping',
  local_pickup: 'Local Pickup',
  weight_based: 'Weight Based',
};

export default function ShippingSettingsPage() {
  const params = useParams();
  const slug = params.slug as string;
  const { token } = useAuth();

  const [zones, setZones] = useState<ShippingZone[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showZoneForm, setShowZoneForm] = useState(false);
  const [zoneForm, setZoneForm] = useState({ name: '', countries: 'US', states: '' });
  const [methodForm, setMethodForm] = useState({ zone_id: '', type: 'flat_rate', title: 'Standard Shipping', cost: '' });
  const [saving, setSaving] = useState(false);

  const fetchZones = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await tenantGet<{ data: ShippingZone[] }>(slug, token, '/api/products/shipping-zones');
      setZones(res.data);
    } catch {
      setError('Failed to load shipping zones');
    } finally {
      setLoading(false);
    }
  }, [slug, token]);

  useEffect(() => { fetchZones(); }, [fetchZones]);

  async function addZone(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await tenantPost(slug, token!, '/api/products/shipping-zones', {
        name: zoneForm.name,
        countries: zoneForm.countries.split(',').map(s => s.trim()).filter(Boolean),
        states: zoneForm.states ? zoneForm.states.split(',').map(s => s.trim()).filter(Boolean) : [],
        is_active: true,
      });
      setZoneForm({ name: '', countries: 'US', states: '' });
      setShowZoneForm(false);
      fetchZones();
    } catch (err: any) {
      setError(err.message ?? 'Failed to create zone');
    } finally {
      setSaving(false);
    }
  }

  async function deleteZone(zoneId: string) {
    if (!confirm('Delete this shipping zone and all its methods?')) return;
    try {
      await tenantDelete(slug, token!, `/api/products/shipping-zones/${zoneId}`);
      setZones(prev => prev.filter(z => z.id !== zoneId));
    } catch (err: any) {
      setError(err.message ?? 'Failed to delete');
    }
  }

  async function addMethod(e: React.FormEvent) {
    e.preventDefault();
    if (!methodForm.zone_id) return;
    setSaving(true);
    setError('');
    try {
      await tenantPost(slug, token!, '/api/products/shipping-methods', {
        zone_id: methodForm.zone_id,
        type: methodForm.type,
        title: methodForm.title,
        cost_cents: Math.round((parseFloat(methodForm.cost) || 0) * 100),
        is_active: true,
      });
      setMethodForm({ zone_id: '', type: 'flat_rate', title: 'Standard Shipping', cost: '' });
      fetchZones();
    } catch (err: any) {
      setError(err.message ?? 'Failed to add method');
    } finally {
      setSaving(false);
    }
  }

  async function deleteMethod(methodId: string) {
    try {
      await tenantDelete(slug, token!, `/api/products/shipping-methods/${methodId}`);
      fetchZones();
    } catch (err: any) {
      setError(err.message ?? 'Failed to delete method');
    }
  }

  function formatDollars(cents: number): string {
    return `$${(cents / 100).toFixed(2)}`;
  }

  return (
    <div style={{ padding: '2rem', maxWidth: '800px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#0f172a', margin: 0 }}>Shipping Settings</h1>
        <button
          onClick={() => setShowZoneForm(true)}
          style={{
            padding: '0.5rem 1rem', background: '#0f172a', color: '#fff',
            border: 'none', borderRadius: '8px', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer',
          }}
        >
          + Add Shipping Zone
        </button>
      </div>

      {error && (
        <div style={{ background: '#fef2f2', color: '#dc2626', padding: '0.6rem 0.75rem', borderRadius: '8px', fontSize: '0.85rem', marginBottom: '1rem' }}>
          {error}
        </div>
      )}

      {showZoneForm && (
        <form onSubmit={addZone} style={cardStyle}>
          <h2 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '0.75rem', color: '#0f172a' }}>New Shipping Zone</h2>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
            <div>
              <label style={labelStyle}>Zone Name *</label>
              <input value={zoneForm.name} onChange={e => setZoneForm(p => ({ ...p, name: e.target.value }))} required style={inputStyle} placeholder="e.g. United States" />
            </div>
            <div>
              <label style={labelStyle}>Countries</label>
              <input value={zoneForm.countries} onChange={e => setZoneForm(p => ({ ...p, countries: e.target.value }))} style={inputStyle} placeholder="US, CA" />
            </div>
            <div>
              <label style={labelStyle}>States (optional)</label>
              <input value={zoneForm.states} onChange={e => setZoneForm(p => ({ ...p, states: e.target.value }))} style={inputStyle} placeholder="CA, NY" />
            </div>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button type="submit" disabled={saving} style={{ padding: '0.45rem 1rem', background: '#0f172a', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer' }}>
              Create Zone
            </button>
            <button type="button" onClick={() => setShowZoneForm(false)} style={{ padding: '0.45rem 1rem', background: '#fff', color: '#374151', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '0.85rem', cursor: 'pointer' }}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <p style={{ color: '#94a3b8' }}>Loading...</p>
      ) : zones.length === 0 ? (
        <p style={{ color: '#94a3b8', textAlign: 'center', padding: '2rem 0' }}>
          No shipping zones configured. Create one to offer shipping options.
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {zones.map(zone => (
            <div key={zone.id} style={cardStyle}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                <div>
                  <span style={{ fontWeight: 700, color: '#0f172a' }}>{zone.name}</span>
                  <span style={{ fontSize: '0.8rem', color: '#64748b', marginLeft: '0.5rem' }}>
                    {zone.countries.join(', ')}{zone.states.length > 0 ? ` / ${zone.states.join(', ')}` : ''}
                  </span>
                </div>
                <button onClick={() => deleteZone(zone.id)} style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: '0.8rem' }}>
                  Delete Zone
                </button>
              </div>

              {zone.methods.length > 0 && (
                <table style={{ width: '100%', fontSize: '0.85rem', marginBottom: '0.75rem', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                      <th style={{ textAlign: 'left', padding: '0.4rem 0', color: '#64748b', fontWeight: 600, fontSize: '0.75rem' }}>Method</th>
                      <th style={{ textAlign: 'left', padding: '0.4rem 0', color: '#64748b', fontWeight: 600, fontSize: '0.75rem' }}>Type</th>
                      <th style={{ textAlign: 'right', padding: '0.4rem 0', color: '#64748b', fontWeight: 600, fontSize: '0.75rem' }}>Cost</th>
                      <th style={{ width: '40px' }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {zone.methods.map(m => (
                      <tr key={m.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '0.4rem 0', color: '#0f172a' }}>{m.title}</td>
                        <td style={{ padding: '0.4rem 0', color: '#64748b' }}>{typeLabels[m.type] ?? m.type}</td>
                        <td style={{ padding: '0.4rem 0', color: '#0f172a', textAlign: 'right' }}>
                          {m.type === 'free_shipping' || m.type === 'local_pickup' ? 'Free' : formatDollars(m.cost_cents)}
                        </td>
                        <td>
                          <button onClick={() => deleteMethod(m.id)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '0.7rem' }}>
                            Del
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {/* Add method inline */}
              <form onSubmit={e => { setMethodForm(p => ({ ...p, zone_id: zone.id })); addMethod(e); }} style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ ...labelStyle, fontSize: '0.7rem' }}>Title</label>
                  <input
                    value={methodForm.zone_id === zone.id ? methodForm.title : 'Standard Shipping'}
                    onChange={e => setMethodForm(p => ({ ...p, zone_id: zone.id, title: e.target.value }))}
                    onFocus={() => setMethodForm(p => ({ ...p, zone_id: zone.id }))}
                    style={{ ...inputStyle, fontSize: '0.8rem', padding: '0.35rem 0.5rem' }}
                  />
                </div>
                <div style={{ width: '120px' }}>
                  <label style={{ ...labelStyle, fontSize: '0.7rem' }}>Type</label>
                  <select
                    value={methodForm.zone_id === zone.id ? methodForm.type : 'flat_rate'}
                    onChange={e => setMethodForm(p => ({ ...p, zone_id: zone.id, type: e.target.value }))}
                    onFocus={() => setMethodForm(p => ({ ...p, zone_id: zone.id }))}
                    style={{ ...inputStyle, fontSize: '0.8rem', padding: '0.35rem 0.5rem' }}
                  >
                    <option value="flat_rate">Flat Rate</option>
                    <option value="free_shipping">Free</option>
                    <option value="local_pickup">Pickup</option>
                    <option value="weight_based">Weight</option>
                  </select>
                </div>
                <div style={{ width: '80px' }}>
                  <label style={{ ...labelStyle, fontSize: '0.7rem' }}>Cost ($)</label>
                  <input
                    type="number" step="0.01" min="0"
                    value={methodForm.zone_id === zone.id ? methodForm.cost : ''}
                    onChange={e => setMethodForm(p => ({ ...p, zone_id: zone.id, cost: e.target.value }))}
                    onFocus={() => setMethodForm(p => ({ ...p, zone_id: zone.id }))}
                    style={{ ...inputStyle, fontSize: '0.8rem', padding: '0.35rem 0.5rem' }}
                    placeholder="0"
                  />
                </div>
                <button
                  type="submit"
                  onClick={() => setMethodForm(p => ({ ...p, zone_id: zone.id }))}
                  disabled={saving}
                  style={{
                    padding: '0.35rem 0.75rem', background: '#f0fdf4', color: '#16a34a',
                    border: '1px solid #bbf7d0', borderRadius: '6px', fontSize: '0.8rem',
                    fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
                  }}
                >
                  + Method
                </button>
              </form>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const cardStyle: React.CSSProperties = {
  background: '#fff', borderRadius: '12px', padding: '1rem 1.25rem',
  boxShadow: '0 1px 3px rgba(0,0,0,0.08)', border: '1px solid #e2e8f0',
  marginBottom: '0.75rem',
};

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#374151', marginBottom: '0.3rem',
};

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '0.45rem 0.65rem', borderRadius: '8px',
  border: '1px solid #d1d5db', fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box',
};
