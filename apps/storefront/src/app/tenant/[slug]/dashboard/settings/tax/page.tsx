'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { useAuth } from '../../../../../../components/AuthProvider';
import { tenantGet, tenantPost, tenantDelete } from '../../../../../../lib/api';

interface TaxRate {
  id: string;
  zone_id: string;
  tax_class: string;
  rate_pct: number;
  name: string;
  is_compound: boolean;
  is_shipping: boolean;
}

interface TaxZone {
  id: string;
  name: string;
  country: string;
  state: string | null;
  zip_pattern: string | null;
  priority: number;
  is_active: boolean;
  rates: TaxRate[];
}

export default function TaxSettingsPage() {
  const params = useParams();
  const slug = params.slug as string;
  const { token } = useAuth();

  const [zones, setZones] = useState<TaxZone[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showZoneForm, setShowZoneForm] = useState(false);
  const [zoneForm, setZoneForm] = useState({ name: '', country: 'US', state: '', zip_pattern: '', priority: '0' });
  const [rateForm, setRateForm] = useState({ zone_id: '', rate_pct: '', name: 'Sales Tax', is_compound: false });
  const [saving, setSaving] = useState(false);

  const fetchZones = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await tenantGet<{ data: TaxZone[] }>(slug, token, '/api/products/tax-zones');
      setZones(res.data);
    } catch {
      setError('Failed to load tax zones');
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
      await tenantPost(slug, token!, '/api/products/tax-zones', {
        name: zoneForm.name,
        country: zoneForm.country,
        state: zoneForm.state || null,
        zip_pattern: zoneForm.zip_pattern || null,
        priority: parseInt(zoneForm.priority) || 0,
        is_active: true,
      });
      setZoneForm({ name: '', country: 'US', state: '', zip_pattern: '', priority: '0' });
      setShowZoneForm(false);
      fetchZones();
    } catch (err: any) {
      setError(err.message ?? 'Failed to create zone');
    } finally {
      setSaving(false);
    }
  }

  async function deleteZone(zoneId: string) {
    if (!confirm('Delete this tax zone and all its rates?')) return;
    try {
      await tenantDelete(slug, token!, `/api/products/tax-zones/${zoneId}`);
      setZones(prev => prev.filter(z => z.id !== zoneId));
    } catch (err: any) {
      setError(err.message ?? 'Failed to delete');
    }
  }

  async function addRate(e: React.FormEvent) {
    e.preventDefault();
    if (!rateForm.zone_id) return;
    setSaving(true);
    setError('');
    try {
      await tenantPost(slug, token!, '/api/products/tax-rates', {
        zone_id: rateForm.zone_id,
        rate_pct: parseFloat(rateForm.rate_pct) || 0,
        name: rateForm.name,
        is_compound: rateForm.is_compound,
      });
      setRateForm({ zone_id: '', rate_pct: '', name: 'Sales Tax', is_compound: false });
      fetchZones();
    } catch (err: any) {
      setError(err.message ?? 'Failed to add rate');
    } finally {
      setSaving(false);
    }
  }

  async function deleteRate(rateId: string) {
    try {
      await tenantDelete(slug, token!, `/api/products/tax-rates/${rateId}`);
      fetchZones();
    } catch (err: any) {
      setError(err.message ?? 'Failed to delete rate');
    }
  }

  return (
    <div style={{ padding: '2rem', maxWidth: '800px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#0f172a', margin: 0 }}>Tax Settings</h1>
        <button
          onClick={() => setShowZoneForm(true)}
          style={{
            padding: '0.5rem 1rem', background: '#0f172a', color: '#fff',
            border: 'none', borderRadius: '8px', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer',
          }}
        >
          + Add Tax Zone
        </button>
      </div>

      {error && (
        <div style={{ background: '#fef2f2', color: '#dc2626', padding: '0.6rem 0.75rem', borderRadius: '8px', fontSize: '0.85rem', marginBottom: '1rem' }}>
          {error}
        </div>
      )}

      {/* New zone form */}
      {showZoneForm && (
        <form onSubmit={addZone} style={cardStyle}>
          <h2 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '0.75rem', color: '#0f172a' }}>New Tax Zone</h2>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
            <div>
              <label style={labelStyle}>Zone Name *</label>
              <input value={zoneForm.name} onChange={e => setZoneForm(p => ({ ...p, name: e.target.value }))} required style={inputStyle} placeholder="e.g. California" />
            </div>
            <div>
              <label style={labelStyle}>Country</label>
              <input value={zoneForm.country} onChange={e => setZoneForm(p => ({ ...p, country: e.target.value }))} style={inputStyle} maxLength={2} />
            </div>
            <div>
              <label style={labelStyle}>State</label>
              <input value={zoneForm.state} onChange={e => setZoneForm(p => ({ ...p, state: e.target.value }))} style={inputStyle} placeholder="CA" />
            </div>
            <div>
              <label style={labelStyle}>ZIP Prefix</label>
              <input value={zoneForm.zip_pattern} onChange={e => setZoneForm(p => ({ ...p, zip_pattern: e.target.value }))} style={inputStyle} placeholder="90" />
            </div>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button type="submit" disabled={saving} style={{ padding: '0.45rem 1rem', background: '#0f172a', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer' }}>
              {saving ? 'Creating...' : 'Create Zone'}
            </button>
            <button type="button" onClick={() => setShowZoneForm(false)} style={{ padding: '0.45rem 1rem', background: '#fff', color: '#374151', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '0.85rem', cursor: 'pointer' }}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Zones list */}
      {loading ? (
        <p style={{ color: '#94a3b8' }}>Loading...</p>
      ) : zones.length === 0 ? (
        <p style={{ color: '#94a3b8', textAlign: 'center', padding: '2rem 0' }}>
          No tax zones configured. Create one to start collecting tax.
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {zones.map(zone => (
            <div key={zone.id} style={cardStyle}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                <div>
                  <span style={{ fontWeight: 700, color: '#0f172a' }}>{zone.name}</span>
                  <span style={{ fontSize: '0.8rem', color: '#64748b', marginLeft: '0.5rem' }}>
                    {zone.country}{zone.state ? `/${zone.state}` : ''}{zone.zip_pattern ? ` (ZIP: ${zone.zip_pattern}*)` : ''}
                  </span>
                </div>
                <button onClick={() => deleteZone(zone.id)} style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: '0.8rem' }}>
                  Delete Zone
                </button>
              </div>

              {/* Tax rates for this zone */}
              {zone.rates.length > 0 && (
                <table style={{ width: '100%', fontSize: '0.85rem', marginBottom: '0.75rem', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                      <th style={{ textAlign: 'left', padding: '0.4rem 0', color: '#64748b', fontWeight: 600, fontSize: '0.75rem' }}>Name</th>
                      <th style={{ textAlign: 'right', padding: '0.4rem 0', color: '#64748b', fontWeight: 600, fontSize: '0.75rem' }}>Rate</th>
                      <th style={{ textAlign: 'center', padding: '0.4rem 0', color: '#64748b', fontWeight: 600, fontSize: '0.75rem' }}>Compound</th>
                      <th style={{ width: '40px' }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {zone.rates.map(rate => (
                      <tr key={rate.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '0.4rem 0', color: '#0f172a' }}>{rate.name}</td>
                        <td style={{ padding: '0.4rem 0', color: '#0f172a', textAlign: 'right' }}>{rate.rate_pct}%</td>
                        <td style={{ padding: '0.4rem 0', color: '#64748b', textAlign: 'center' }}>{rate.is_compound ? 'Yes' : 'No'}</td>
                        <td>
                          <button onClick={() => deleteRate(rate.id)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '0.7rem' }}>
                            Del
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {/* Add rate inline form */}
              <form onSubmit={e => { setRateForm(p => ({ ...p, zone_id: zone.id })); addRate(e); }} style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ ...labelStyle, fontSize: '0.7rem' }}>Tax Name</label>
                  <input
                    value={rateForm.zone_id === zone.id ? rateForm.name : 'Sales Tax'}
                    onChange={e => setRateForm(p => ({ ...p, zone_id: zone.id, name: e.target.value }))}
                    onFocus={() => setRateForm(p => ({ ...p, zone_id: zone.id }))}
                    style={{ ...inputStyle, fontSize: '0.8rem', padding: '0.35rem 0.5rem' }}
                  />
                </div>
                <div style={{ width: '80px' }}>
                  <label style={{ ...labelStyle, fontSize: '0.7rem' }}>Rate %</label>
                  <input
                    type="number" step="0.01" min="0" max="100"
                    value={rateForm.zone_id === zone.id ? rateForm.rate_pct : ''}
                    onChange={e => setRateForm(p => ({ ...p, zone_id: zone.id, rate_pct: e.target.value }))}
                    onFocus={() => setRateForm(p => ({ ...p, zone_id: zone.id }))}
                    style={{ ...inputStyle, fontSize: '0.8rem', padding: '0.35rem 0.5rem' }}
                    placeholder="0"
                  />
                </div>
                <button
                  type="submit"
                  onClick={() => setRateForm(p => ({ ...p, zone_id: zone.id }))}
                  disabled={saving}
                  style={{
                    padding: '0.35rem 0.75rem', background: '#f0fdf4', color: '#16a34a',
                    border: '1px solid #bbf7d0', borderRadius: '6px', fontSize: '0.8rem',
                    fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
                  }}
                >
                  + Rate
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
