'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import { tenantGet, tenantPatch, tenantPost } from '@/lib/api';
import { THEME_NAMES, THEME_META } from '@/lib/themes';
import type { ThemeName } from '@/lib/themes';

const API_BASE = process.env.NEXT_PUBLIC_INVENTORY_URL ?? 'http://localhost:3001';

// ── Types ────────────────────────────────────────────────────────────────────

interface Settings {
  theme?: string;
  store_name?: string | null;
  logo_url?: string | null;
  hero_title?: string;
  hero_subtitle?: string | null;
  hero_image_url?: string | null;
  hero_enabled?: boolean;
  primary_color?: string;
  accent_color?: string;
  nav_bg_color?: string | null;
  nav_text_color?: string | null;
  footer_bg_color?: string | null;
  footer_text_color?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
  social_links?: Record<string, string>;
  seo_title?: string | null;
  seo_description?: string | null;
  custom_css?: string | null;
  custom_homepage_enabled?: boolean;
  custom_homepage_url?: string | null;
}

interface ConnectStatus {
  connected: boolean;
  account_id?: string;
  charges_enabled?: boolean;
  payouts_enabled?: boolean;
  details_submitted?: boolean;
  platform_fee_pct?: number;
}

type Tab = 'custom-page' | 'appearance' | 'payments';

// ── Main Page ────────────────────────────────────────────────────────────────

export default function StorefrontSettingsPage() {
  const params = useParams();
  const slug = params.slug as string;
  const { token } = useAuth();

  const [tab, setTab] = useState<Tab>('custom-page');
  const [settings, setSettings] = useState<Settings>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [uploading, setUploading] = useState<'logo' | 'hero' | 'html' | null>(null);
  const [socialEntries, setSocialEntries] = useState<[string, string][]>([]);

  // Stripe state
  const [stripeStatus, setStripeStatus] = useState<ConnectStatus | null>(null);
  const [stripeLoading, setStripeLoading] = useState(true);
  const [stripeActionLoading, setStripeActionLoading] = useState(false);
  const [stripeError, setStripeError] = useState('');
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);

  // ── Load storefront settings ────────────────────────────────────────────────
  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        const res = await tenantGet<{ data: Settings }>(slug, token, '/api/storefront/settings');
        const s = res.data ?? {};
        setSettings(s);
        setSocialEntries(Object.entries(s.social_links ?? {}));
      } catch (err: any) {
        setError(err.message ?? 'Failed to load settings');
      } finally {
        setLoading(false);
      }
    })();
  }, [slug, token]);

  // ── Load Stripe status ──────────────────────────────────────────────────────
  useEffect(() => {
    const tenantHeaders = { 'x-tenant-slug': slug };
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/stripe-connect/status`, {
          credentials: 'include', headers: tenantHeaders,
        });
        const body = res.ok ? await res.json() : { connected: false };
        setStripeStatus(body);
      } catch {
        setStripeStatus({ connected: false });
      } finally {
        setStripeLoading(false);
      }
    })();
  }, [slug]);

  // ── Helpers ─────────────────────────────────────────────────────────────────
  function update(field: keyof Settings, value: unknown) {
    setSettings(prev => ({ ...prev, [field]: value }));
    setSuccess('');
  }

  async function handleImageUpload(file: File, field: 'logo_url' | 'hero_image_url') {
    if (!token) return;
    setUploading(field === 'logo_url' ? 'logo' : 'hero');
    try {
      const presignRes = await tenantPost<{ uploadUrl: string; publicUrl: string; key: string }>(
        slug, token, '/api/uploads/presign', {
          filename: file.name,
          contentType: file.type,
          sizeBytes: file.size,
        }
      );
      await fetch(presignRes.uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': file.type },
        body: file,
      });
      await tenantPost(slug, token, '/api/uploads/confirm', { key: presignRes.key });
      update(field, presignRes.publicUrl);
    } catch (err: any) {
      setError(err.message ?? 'Image upload failed');
    } finally {
      setUploading(null);
    }
  }

  async function handleHtmlUpload(file: File) {
    if (!token) return;
    setUploading('html');
    try {
      const presignRes = await tenantPost<{ uploadUrl: string; publicUrl: string; key: string }>(
        slug, token, '/api/uploads/presign', {
          filename: file.name,
          contentType: 'text/html',
          sizeBytes: file.size,
        }
      );
      await fetch(presignRes.uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': 'text/html' },
        body: file,
      });
      await tenantPost(slug, token, '/api/uploads/confirm', { key: presignRes.key });
      update('custom_homepage_url', presignRes.publicUrl);
      setSuccess('HTML file uploaded successfully!');
    } catch (err: any) {
      setError(err.message ?? 'HTML upload failed');
    } finally {
      setUploading(null);
    }
  }

  async function handleSaveAppearance() {
    if (!token) return;
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const social: Record<string, string> = {};
      socialEntries.forEach(([k, v]) => {
        if (k.trim() && v.trim()) social[k.trim()] = v.trim();
      });
      const payload: Record<string, unknown> = {
        theme: settings.theme || 'default',
        hero_enabled: settings.hero_enabled !== false,
        primary_color: settings.primary_color || '#0070f3',
        accent_color: settings.accent_color || '#ff4f4f',
        social_links: social,
      };
      if (settings.store_name) payload.store_name = settings.store_name;
      if (settings.logo_url) payload.logo_url = settings.logo_url;
      if (settings.hero_title) payload.hero_title = settings.hero_title;
      if (settings.hero_subtitle) payload.hero_subtitle = settings.hero_subtitle;
      if (settings.hero_image_url) payload.hero_image_url = settings.hero_image_url;
      if (settings.nav_bg_color) payload.nav_bg_color = settings.nav_bg_color;
      if (settings.nav_text_color) payload.nav_text_color = settings.nav_text_color;
      if (settings.footer_bg_color) payload.footer_bg_color = settings.footer_bg_color;
      if (settings.footer_text_color) payload.footer_text_color = settings.footer_text_color;
      if (settings.contact_email) payload.contact_email = settings.contact_email;
      if (settings.contact_phone) payload.contact_phone = settings.contact_phone;
      if (settings.seo_title) payload.seo_title = settings.seo_title;
      if (settings.seo_description) payload.seo_description = settings.seo_description;
      if (settings.custom_css !== undefined && settings.custom_css !== null) payload.custom_css = settings.custom_css;

      await tenantPatch(slug, token, '/api/storefront/settings', payload);
      setSuccess('Appearance saved! Changes will appear on your storefront within a minute.');
    } catch (err: any) {
      setError(err.message ?? 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveCustomPage() {
    if (!token) return;
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const payload: Record<string, unknown> = {
        custom_homepage_enabled: !!settings.custom_homepage_enabled,
      };
      if (settings.custom_homepage_url) {
        payload.custom_homepage_url = settings.custom_homepage_url;
      }
      await tenantPatch(slug, token, '/api/storefront/settings', payload);
      setSuccess('Custom page settings saved!');
    } catch (err: any) {
      setError(err.message ?? 'Failed to save custom page settings');
    } finally {
      setSaving(false);
    }
  }

  async function handleRemoveCustomPage() {
    update('custom_homepage_url', null);
    update('custom_homepage_enabled', false);
    if (!token) return;
    try {
      await tenantPatch(slug, token, '/api/storefront/settings', {
        custom_homepage_enabled: false,
        custom_homepage_url: '',
      });
      setSuccess('Custom page removed. Your storefront will show the default layout.');
    } catch (err: any) {
      setError(err.message ?? 'Failed to remove custom page');
    }
  }

  // ── Stripe handlers ─────────────────────────────────────────────────────────
  const tenantHeaders = { 'x-tenant-slug': slug };

  async function handleStripeConnect() {
    setStripeActionLoading(true);
    setStripeError('');
    try {
      const res = await fetch(`${API_BASE}/api/stripe-connect/oauth-url`, {
        credentials: 'include', headers: tenantHeaders,
      });
      if (!res.ok) throw new Error((await res.json()).error ?? 'Failed to get OAuth URL');
      const { url } = await res.json();
      window.location.href = url;
    } catch (err: any) {
      setStripeError(err.message);
      setStripeActionLoading(false);
    }
  }

  async function loadStripeStatus() {
    try {
      const res = await fetch(`${API_BASE}/api/stripe-connect/status`, {
        credentials: 'include', headers: tenantHeaders,
      });
      const body = res.ok ? await res.json() : { connected: false };
      setStripeStatus(body);
    } catch {
      setStripeStatus({ connected: false });
    }
  }

  async function handleStripeDisconnect() {
    setStripeActionLoading(true);
    setStripeError('');
    try {
      const res = await fetch(`${API_BASE}/api/stripe-connect/disconnect`, {
        method: 'POST', credentials: 'include', headers: tenantHeaders,
      });
      if (!res.ok) throw new Error((await res.json()).error ?? 'Disconnect failed');
      setConfirmDisconnect(false);
      await loadStripeStatus();
    } catch (err: any) {
      setStripeError(err.message);
    } finally {
      setStripeActionLoading(false);
    }
  }

  if (loading) {
    return <div style={{ padding: '2rem', color: '#64748b' }}>Loading storefront settings...</div>;
  }

  const tabs: { key: Tab; label: string }[] = [
    { key: 'custom-page', label: 'Custom Page' },
    { key: 'appearance', label: 'Appearance' },
    { key: 'payments', label: 'Payments' },
  ];

  return (
    <div style={{ padding: '2rem', maxWidth: tab === 'custom-page' ? '1100px' : '800px', transition: 'max-width 0.2s' }}>
      {/* Header */}
      <div style={{ marginBottom: '1.5rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#0f172a', margin: 0 }}>
          Storefront Settings
        </h1>
        <p style={{ fontSize: '0.85rem', color: '#64748b', marginTop: '0.25rem' }}>
          Manage your storefront appearance, custom pages, and payment integrations.
        </p>
      </div>

      {/* Tabs */}
      <div style={{
        display: 'flex', gap: '0', borderBottom: '2px solid #e2e8f0', marginBottom: '1.5rem',
      }}>
        {tabs.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => { setTab(key); setError(''); setSuccess(''); }}
            style={{
              padding: '0.6rem 1.25rem',
              background: 'none',
              border: 'none',
              borderBottom: tab === key ? '2px solid #3b82f6' : '2px solid transparent',
              marginBottom: '-2px',
              color: tab === key ? '#3b82f6' : '#64748b',
              fontWeight: tab === key ? 600 : 400,
              fontSize: '0.9rem',
              cursor: 'pointer',
              transition: 'all 0.15s',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Messages */}
      {error && (
        <div style={{ background: '#fef2f2', color: '#dc2626', padding: '0.6rem 0.75rem', borderRadius: '8px', fontSize: '0.85rem', marginBottom: '1rem' }}>
          {error}
        </div>
      )}
      {success && (
        <div style={{ background: '#f0fdf4', color: '#16a34a', padding: '0.6rem 0.75rem', borderRadius: '8px', fontSize: '0.85rem', marginBottom: '1rem' }}>
          {success}
        </div>
      )}

      {/* Tab Content */}
      {tab === 'custom-page' && (
        <CustomPageTab
          settings={settings}
          uploading={uploading}
          saving={saving}
          slug={slug}
          onUpdate={update}
          onUploadHtml={handleHtmlUpload}
          onSave={handleSaveCustomPage}
          onRemove={handleRemoveCustomPage}
        />
      )}
      {tab === 'appearance' && (
        <AppearanceTab
          settings={settings}
          uploading={uploading}
          saving={saving}
          slug={slug}
          socialEntries={socialEntries}
          onUpdate={update}
          onSetSocialEntries={setSocialEntries}
          onImageUpload={handleImageUpload}
          onSave={handleSaveAppearance}
        />
      )}
      {tab === 'payments' && (
        <PaymentsTab
          status={stripeStatus}
          loading={stripeLoading}
          actionLoading={stripeActionLoading}
          error={stripeError}
          confirmDisconnect={confirmDisconnect}
          onConnect={handleStripeConnect}
          onDisconnect={handleStripeDisconnect}
          onSetConfirmDisconnect={setConfirmDisconnect}
        />
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// TAB 1: Custom Page
// ═════════════════════════════════════════════════════════════════════════════

function CustomPageTab({
  settings, uploading, saving, slug, onUpdate, onUploadHtml, onSave, onRemove,
}: {
  settings: Settings;
  uploading: 'logo' | 'hero' | 'html' | null;
  saving: boolean;
  slug: string;
  onUpdate: (field: keyof Settings, value: unknown) => void;
  onUploadHtml: (file: File) => void;
  onSave: () => void;
  onRemove: () => void;
}) {
  const siteBase = typeof window !== 'undefined' ? window.location.origin : '';
  const storeUrl = `${siteBase}/tenant/${slug}`;

  return (
    <div style={{ display: 'flex', gap: '1.25rem', alignItems: 'flex-start' }}>
      {/* ── Left column: Upload controls ─────────────────────────────────── */}
      <div style={{ flex: '1 1 0', minWidth: 0 }}>
        <Section title="Custom Homepage">
          <p style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: '1rem', lineHeight: 1.6 }}>
            Upload your own HTML page to replace the auto-generated storefront homepage.
            When enabled, visitors will see your custom page instead of the default hero banner and product grid.
            You can revert to the default at any time.
          </p>

          {/* Toggle */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem',
            padding: '0.75rem 1rem', background: settings.custom_homepage_enabled ? '#eff6ff' : '#f8fafc',
            borderRadius: '8px', border: `1px solid ${settings.custom_homepage_enabled ? '#bfdbfe' : '#e2e8f0'}`,
          }}>
            <label style={{ position: 'relative', display: 'inline-block', width: '44px', height: '24px', flexShrink: 0 }}>
              <input
                type="checkbox"
                checked={!!settings.custom_homepage_enabled}
                onChange={(e) => onUpdate('custom_homepage_enabled', e.target.checked)}
                style={{ opacity: 0, width: 0, height: 0 }}
              />
              <span style={{
                position: 'absolute', cursor: 'pointer', inset: 0, borderRadius: '24px',
                background: settings.custom_homepage_enabled ? '#3b82f6' : '#cbd5e1',
                transition: 'background 0.2s',
              }}>
                <span style={{
                  position: 'absolute', height: '18px', width: '18px', left: settings.custom_homepage_enabled ? '23px' : '3px',
                  bottom: '3px', background: '#fff', borderRadius: '50%', transition: 'left 0.2s',
                }} />
              </span>
            </label>
            <div>
              <div style={{ fontWeight: 600, fontSize: '0.85rem', color: '#0f172a' }}>
                Use custom homepage
              </div>
              <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                {settings.custom_homepage_enabled
                  ? 'Visitors see your uploaded custom page'
                  : 'Visitors see the auto-generated storefront'}
              </div>
            </div>
          </div>

          {/* Upload area */}
          {settings.custom_homepage_url ? (
            <div style={{
              padding: '1rem', background: '#f8fafc', borderRadius: '8px',
              border: '1px solid #e2e8f0', marginBottom: '1rem',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: '0.85rem', color: '#0f172a', marginBottom: '0.25rem' }}>
                    ✓ Custom page uploaded
                  </div>
                  <div style={{
                    fontSize: '0.75rem', color: '#64748b', overflow: 'hidden',
                    textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {settings.custom_homepage_url}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
                  <a
                    href={settings.custom_homepage_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      padding: '0.35rem 0.75rem', background: '#fff', color: '#374151',
                      border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '0.8rem',
                      textDecoration: 'none',
                    }}
                  >
                    Preview ↗
                  </a>
                  <label style={{
                    padding: '0.35rem 0.75rem', background: '#fff', color: '#3b82f6',
                    border: '1px solid #bfdbfe', borderRadius: '6px', fontSize: '0.8rem',
                    cursor: uploading === 'html' ? 'wait' : 'pointer',
                  }}>
                    {uploading === 'html' ? 'Uploading...' : 'Replace'}
                    <input type="file" accept=".html,.htm" hidden
                      onChange={e => { const f = e.target.files?.[0]; if (f) onUploadHtml(f); }}
                    />
                  </label>
                  <button
                    type="button"
                    onClick={onRemove}
                    style={{
                      padding: '0.35rem 0.75rem', background: '#fff', color: '#ef4444',
                      border: '1px solid #fca5a5', borderRadius: '6px', fontSize: '0.8rem',
                      cursor: 'pointer',
                    }}
                  >
                    Remove
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <label style={{
              display: 'block', padding: '2rem', border: '2px dashed #d1d5db', borderRadius: '8px',
              textAlign: 'center', cursor: uploading === 'html' ? 'wait' : 'pointer',
              color: '#94a3b8', fontSize: '0.85rem', marginBottom: '1rem',
              background: '#fafafa',
            }}>
              <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>📄</div>
              {uploading === 'html' ? 'Uploading HTML file...' : 'Click to upload an HTML file'}
              <div style={{ fontSize: '0.75rem', marginTop: '0.35rem', color: '#94a3b8' }}>
                .html or .htm — max 10 MB
              </div>
              <input type="file" accept=".html,.htm" hidden
                onChange={e => { const f = e.target.files?.[0]; if (f) onUploadHtml(f); }}
              />
            </label>
          )}

          {/* Info note */}
          <div style={{
            background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '8px',
            padding: '0.75rem 1rem', fontSize: '0.8rem', color: '#92400e', lineHeight: 1.5,
          }}>
            <strong>Tip:</strong> Your HTML file can include inline CSS and JavaScript.
            External resources (images, fonts, stylesheets) should use absolute URLs.
            The custom page is displayed in a sandboxed frame for security.
          </div>
        </Section>

        <div style={{ marginTop: '1rem' }}>
          <button
            onClick={onSave}
            disabled={saving}
            style={{
              padding: '0.6rem 1.5rem', background: saving ? '#94a3b8' : '#0f172a', color: '#fff',
              border: 'none', borderRadius: '8px', fontSize: '0.9rem', fontWeight: 600,
              cursor: saving ? 'not-allowed' : 'pointer',
            }}
          >
            {saving ? 'Saving...' : 'Save Custom Page Settings'}
          </button>
        </div>
      </div>

      {/* ── Right column: Embed Reference ────────────────────────────────── */}
      <EmbedReference slug={slug} storeUrl={storeUrl} />
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// TAB 2: Appearance
// ═════════════════════════════════════════════════════════════════════════════

function AppearanceTab({
  settings, uploading, saving, slug, socialEntries,
  onUpdate, onSetSocialEntries, onImageUpload, onSave,
}: {
  settings: Settings;
  uploading: 'logo' | 'hero' | 'html' | null;
  saving: boolean;
  slug: string;
  socialEntries: [string, string][];
  onUpdate: (field: keyof Settings, value: unknown) => void;
  onSetSocialEntries: (entries: [string, string][]) => void;
  onImageUpload: (file: File, field: 'logo_url' | 'hero_image_url') => void;
  onSave: () => void;
}) {
  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1rem', gap: '0.75rem' }}>
        <a
          href={`/tenant/${slug}`}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            padding: '0.5rem 1rem', background: '#fff', color: '#374151',
            border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '0.85rem',
            textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
          }}
        >
          Preview ↗
        </a>
        <button
          onClick={onSave}
          disabled={saving}
          style={{
            padding: '0.5rem 1.25rem', background: saving ? '#94a3b8' : '#0f172a', color: '#fff',
            border: 'none', borderRadius: '8px', fontSize: '0.85rem', fontWeight: 600,
            cursor: saving ? 'not-allowed' : 'pointer',
          }}
        >
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>

      {/* Theme Presets */}
      <Section title="Theme">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '0.75rem' }}>
          {THEME_NAMES.map((name) => {
            const meta = THEME_META[name];
            const isActive = (settings.theme ?? 'default') === name;
            return (
              <button
                key={name}
                onClick={() => onUpdate('theme', name)}
                style={{
                  padding: '1rem', borderRadius: '10px', cursor: 'pointer', textAlign: 'left',
                  border: isActive ? '2px solid #3b82f6' : '2px solid #e5e7eb',
                  background: isActive ? '#eff6ff' : '#fff',
                }}
              >
                <ThemeSwatch theme={name} />
                <div style={{ fontWeight: 600, fontSize: '0.8rem', color: '#0f172a', marginTop: '0.5rem' }}>
                  {meta.label}
                </div>
                <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: '0.15rem' }}>
                  {meta.description}
                </div>
              </button>
            );
          })}
        </div>
      </Section>

      {/* Colors */}
      <Section title="Colors">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
          <ColorPicker label="Primary Color" value={settings.primary_color ?? '#0070f3'} onChange={(v) => onUpdate('primary_color', v)} />
          <ColorPicker label="Accent Color" value={settings.accent_color ?? '#ff4f4f'} onChange={(v) => onUpdate('accent_color', v)} />
          <ColorPicker label="Nav Background" value={settings.nav_bg_color ?? ''} onChange={(v) => onUpdate('nav_bg_color', v)} placeholder="From theme" />
          <ColorPicker label="Nav Text" value={settings.nav_text_color ?? ''} onChange={(v) => onUpdate('nav_text_color', v)} placeholder="From theme" />
          <ColorPicker label="Footer Background" value={settings.footer_bg_color ?? ''} onChange={(v) => onUpdate('footer_bg_color', v)} placeholder="From theme" />
          <ColorPicker label="Footer Text" value={settings.footer_text_color ?? ''} onChange={(v) => onUpdate('footer_text_color', v)} placeholder="From theme" />
        </div>
      </Section>

      {/* Logo */}
      <Section title="Logo">
        {settings.logo_url ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <img src={settings.logo_url} alt="Logo" style={{ width: '60px', height: '60px', objectFit: 'contain', borderRadius: '8px', border: '1px solid #e2e8f0' }} />
            <button
              type="button"
              onClick={() => onUpdate('logo_url', null)}
              style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '0.8rem' }}
            >
              Remove
            </button>
          </div>
        ) : (
          <label style={{
            display: 'block', padding: '1.25rem', border: '2px dashed #d1d5db', borderRadius: '8px',
            textAlign: 'center', cursor: uploading === 'logo' ? 'wait' : 'pointer', color: '#94a3b8', fontSize: '0.85rem',
          }}>
            {uploading === 'logo' ? 'Uploading...' : 'Click to upload logo'}
            <input type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/avif" hidden
              onChange={e => { const f = e.target.files?.[0]; if (f) onImageUpload(f, 'logo_url'); }}
            />
          </label>
        )}
      </Section>

      {/* Hero Section */}
      <Section title="Hero Banner">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
          <input
            type="checkbox"
            id="hero_enabled"
            checked={settings.hero_enabled !== false}
            onChange={e => onUpdate('hero_enabled', e.target.checked)}
          />
          <label htmlFor="hero_enabled" style={{ fontSize: '0.85rem', color: '#374151' }}>
            Show hero banner on homepage
          </label>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
          <InputField label="Hero Title" value={settings.hero_title ?? ''} onChange={(v) => onUpdate('hero_title', v)} placeholder="Welcome" />
          <InputField label="Hero Subtitle" value={settings.hero_subtitle ?? ''} onChange={(v) => onUpdate('hero_subtitle', v)} placeholder="Shop our collection" />
        </div>
        <div>
          <label style={labelStyle}>Hero Image</label>
          {settings.hero_image_url ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <img src={settings.hero_image_url} alt="Hero" style={{ width: '120px', height: '60px', objectFit: 'cover', borderRadius: '8px', border: '1px solid #e2e8f0' }} />
              <button
                type="button"
                onClick={() => onUpdate('hero_image_url', null)}
                style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '0.8rem' }}
              >
                Remove
              </button>
            </div>
          ) : (
            <label style={{
              display: 'block', padding: '1rem', border: '2px dashed #d1d5db', borderRadius: '8px',
              textAlign: 'center', cursor: uploading === 'hero' ? 'wait' : 'pointer', color: '#94a3b8', fontSize: '0.85rem',
            }}>
              {uploading === 'hero' ? 'Uploading...' : 'Click to upload hero image'}
              <input type="file" accept="image/jpeg,image/png,image/webp" hidden
                onChange={e => { const f = e.target.files?.[0]; if (f) onImageUpload(f, 'hero_image_url'); }}
              />
            </label>
          )}
        </div>
      </Section>

      {/* Store Info */}
      <Section title="Store Info">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
          <InputField label="Store Name" value={settings.store_name ?? ''} onChange={(v) => onUpdate('store_name', v)} placeholder="My Store" />
          <InputField label="Contact Email" value={settings.contact_email ?? ''} onChange={(v) => onUpdate('contact_email', v)} placeholder="hello@example.com" />
        </div>
        <div style={{ marginBottom: '1rem' }}>
          <InputField label="Contact Phone" value={settings.contact_phone ?? ''} onChange={(v) => onUpdate('contact_phone', v)} placeholder="+1 (555) 000-0000" />
        </div>

        {/* Social Links */}
        <label style={labelStyle}>Social Links</label>
        {socialEntries.map(([platform, url], i) => (
          <div key={i} style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
            <input
              value={platform}
              onChange={(e) => {
                const next = [...socialEntries];
                next[i] = [e.target.value, url];
                onSetSocialEntries(next);
              }}
              placeholder="Platform"
              style={{ ...inputStyle, flex: '0 0 120px' }}
            />
            <input
              value={url}
              onChange={(e) => {
                const next = [...socialEntries];
                next[i] = [platform, e.target.value];
                onSetSocialEntries(next);
              }}
              placeholder="https://..."
              style={{ ...inputStyle, flex: 1 }}
            />
            <button
              type="button"
              onClick={() => onSetSocialEntries(socialEntries.filter((_, j) => j !== i))}
              style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '1rem', padding: '0 0.25rem' }}
            >
              ×
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => onSetSocialEntries([...socialEntries, ['', '']])}
          style={{ background: 'none', border: 'none', color: '#3b82f6', cursor: 'pointer', fontSize: '0.8rem', padding: 0, fontWeight: 500 }}
        >
          + Add social link
        </button>
      </Section>

      {/* SEO */}
      <Section title="SEO">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1rem' }}>
          <InputField label="SEO Title" value={settings.seo_title ?? ''} onChange={(v) => onUpdate('seo_title', v)} placeholder="Page title for search engines" />
          <div>
            <label style={labelStyle}>SEO Description</label>
            <textarea
              value={settings.seo_description ?? ''}
              onChange={(e) => onUpdate('seo_description', e.target.value)}
              rows={2}
              style={{ ...inputStyle, resize: 'vertical' }}
              placeholder="Brief description for search results"
            />
          </div>
        </div>
      </Section>

      {/* Custom CSS */}
      <Section title="Custom CSS">
        <p style={{ fontSize: '0.75rem', color: '#94a3b8', marginBottom: '0.5rem' }}>
          Advanced: Add custom CSS to further customize your storefront.
        </p>
        <textarea
          value={settings.custom_css ?? ''}
          onChange={(e) => onUpdate('custom_css', e.target.value)}
          rows={5}
          style={{ ...inputStyle, fontFamily: 'monospace', fontSize: '0.8rem', resize: 'vertical' }}
          placeholder="/* Custom styles */"
        />
      </Section>

      {/* Bottom Save */}
      <div style={{ marginTop: '1rem', display: 'flex', gap: '0.75rem' }}>
        <button
          onClick={onSave}
          disabled={saving}
          style={{
            padding: '0.6rem 1.5rem', background: saving ? '#94a3b8' : '#0f172a', color: '#fff',
            border: 'none', borderRadius: '8px', fontSize: '0.9rem', fontWeight: 600,
            cursor: saving ? 'not-allowed' : 'pointer',
          }}
        >
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>
    </>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// TAB 3: Payments
// ═════════════════════════════════════════════════════════════════════════════

function PaymentsTab({
  status, loading, actionLoading, error, confirmDisconnect,
  onConnect, onDisconnect, onSetConfirmDisconnect,
}: {
  status: ConnectStatus | null;
  loading: boolean;
  actionLoading: boolean;
  error: string;
  confirmDisconnect: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
  onSetConfirmDisconnect: (v: boolean) => void;
}) {
  return (
    <div style={{ maxWidth: '640px' }}>
      {/* Stripe Connect card */}
      <div style={{
        background: '#fff', borderRadius: '16px', padding: '1.75rem',
        boxShadow: '0 1px 3px rgba(0,0,0,0.08)', marginBottom: '1.5rem',
      }}>
        {/* Card header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.25rem' }}>
          <div style={{
            width: '48px', height: '48px', borderRadius: '12px',
            background: 'linear-gradient(135deg, #635bff 0%, #0073e6 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '1.5rem', flexShrink: 0,
          }}>
            💳
          </div>
          <div>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#0f172a', margin: 0 }}>
              Stripe Payments
            </h2>
            <p style={{ fontSize: '0.8rem', color: '#64748b', margin: '0.2rem 0 0' }}>
              Accept payments directly in your store
            </p>
          </div>
        </div>

        {error && (
          <div style={{
            background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px',
            padding: '0.75rem 1rem', marginBottom: '1.25rem', color: '#dc2626', fontSize: '0.875rem',
          }}>
            {error}
          </div>
        )}

        {loading ? (
          <div style={{ color: '#94a3b8', fontSize: '0.875rem' }}>Loading status...</div>
        ) : status?.connected ? (
          <>
            <div style={{
              background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '10px',
              padding: '1rem 1.25rem', marginBottom: '1.25rem',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                <span style={{ fontSize: '0.875rem', fontWeight: 600, color: '#15803d' }}>✓ Connected</span>
                <code style={{ fontSize: '0.75rem', color: '#64748b', background: '#f1f5f9', padding: '0.15rem 0.4rem', borderRadius: '4px' }}>
                  {status.account_id}
                </code>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem' }}>
                <StatusBadge ok={!!status.charges_enabled} label="Charges enabled" />
                <StatusBadge ok={!!status.payouts_enabled} label="Payouts enabled" />
                <StatusBadge ok={!!status.details_submitted} label="Details submitted" />
              </div>
            </div>

            <div style={{
              background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '8px',
              padding: '0.75rem 1rem', marginBottom: '1.25rem', fontSize: '0.8rem', color: '#92400e',
            }}>
              Gadnuc collects a <strong>{status.platform_fee_pct ?? 5}% platform fee</strong> on each order processed through your store.
            </div>

            {confirmDisconnect ? (
              <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                <span style={{ fontSize: '0.875rem', color: '#64748b' }}>Are you sure?</span>
                <button
                  onClick={onDisconnect}
                  disabled={actionLoading}
                  style={{
                    padding: '0.5rem 1rem', background: '#dc2626', color: '#fff',
                    border: 'none', borderRadius: '6px', fontSize: '0.875rem', cursor: 'pointer',
                  }}
                >
                  {actionLoading ? 'Disconnecting...' : 'Yes, disconnect'}
                </button>
                <button
                  onClick={() => onSetConfirmDisconnect(false)}
                  style={{
                    padding: '0.5rem 1rem', background: '#fff', color: '#374151',
                    border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '0.875rem', cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => onSetConfirmDisconnect(true)}
                style={{
                  padding: '0.5rem 1.25rem', background: '#fff', color: '#dc2626',
                  border: '1px solid #fca5a5', borderRadius: '8px',
                  fontSize: '0.875rem', fontWeight: 500, cursor: 'pointer',
                }}
              >
                Disconnect Stripe
              </button>
            )}
          </>
        ) : (
          <>
            <p style={{ fontSize: '0.875rem', color: '#64748b', marginBottom: '1.25rem', lineHeight: 1.6 }}>
              Connect your Stripe account to start accepting payments in your store.
              Your customers pay directly to your Stripe account — Gadnuc collects a small
              platform fee per transaction.
            </p>
            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem', marginBottom: '1.5rem',
            }}>
              {[
                ['⚡', 'Instant payouts', 'Funds land in your bank account directly'],
                ['🛡️', 'Secure by Stripe', 'PCI-compliant payments out of the box'],
                ['📊', 'Full dashboard', 'Analytics and dispute management in Stripe'],
              ].map(([icon, title, desc]) => (
                <div key={title} style={{
                  background: '#f8fafc', borderRadius: '8px', padding: '0.875rem',
                  fontSize: '0.8rem', color: '#64748b',
                }}>
                  <div style={{ fontSize: '1.25rem', marginBottom: '0.375rem' }}>{icon}</div>
                  <div style={{ fontWeight: 600, color: '#0f172a', marginBottom: '0.25rem' }}>{title}</div>
                  {desc}
                </div>
              ))}
            </div>
            <button
              onClick={onConnect}
              disabled={actionLoading}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
                padding: '0.7rem 1.5rem',
                background: actionLoading ? '#a5b4fc' : '#635bff',
                color: '#fff', border: 'none', borderRadius: '8px',
                fontSize: '0.9rem', fontWeight: 600, cursor: actionLoading ? 'not-allowed' : 'pointer',
              }}
            >
              {actionLoading ? 'Redirecting...' : 'Connect with Stripe'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// Embed Reference Panel (shown beside Custom Page tab)
// ═════════════════════════════════════════════════════════════════════════════

function EmbedReference({ slug, storeUrl }: { slug: string; storeUrl: string }) {
  const apiBase = `${storeUrl.replace(/\/tenant\/.*$/, '')}/api/storefront`;

  return (
    <div style={{
      flex: '0 0 340px', background: '#f8fafc', borderRadius: '12px',
      border: '1px solid #e2e8f0', padding: '1.25rem', fontSize: '0.8rem',
      color: '#334155', maxHeight: 'calc(100vh - 200px)', overflowY: 'auto',
    }}>
      <h3 style={{ fontSize: '0.9rem', fontWeight: 700, color: '#0f172a', marginTop: 0, marginBottom: '0.75rem' }}>
        Embed Reference
      </h3>
      <p style={{ fontSize: '0.75rem', color: '#64748b', marginBottom: '1rem', lineHeight: 1.5 }}>
        Use these URLs and snippets in your custom HTML page to display store data and link to products.
      </p>

      {/* ── Store Links ─────────────────────────────────────────────────── */}
      <RefSection title="Store Links">
        <RefRow label="All Products">
          <CopyBlock text={`${storeUrl}/products`} />
        </RefRow>
        <RefRow label="Single Product">
          <CopyBlock text={`${storeUrl}/products/{id}`} />
        </RefRow>
        <RefRow label="Shopping Cart">
          <CopyBlock text={`${storeUrl}/cart`} />
        </RefRow>
      </RefSection>

      {/* ── Product API ─────────────────────────────────────────────────── */}
      <RefSection title="Products API (JSON)">
        <RefRow label="List products">
          <CopyBlock text={`${apiBase}/products?slug=${slug}`} />
        </RefRow>
        <RefRow label="Single product">
          <CopyBlock text={`${apiBase}/products/{id}?slug=${slug}`} />
        </RefRow>
        <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginTop: '0.35rem', lineHeight: 1.5 }}>
          Query params: <code style={codeInline}>category</code>, <code style={codeInline}>search</code>,
          {' '}<code style={codeInline}>page</code>, <code style={codeInline}>limit</code>,
          {' '}<code style={codeInline}>sort</code> (name_asc, price_asc, etc.)
        </div>
      </RefSection>

      {/* ── Product Data Fields ─────────────────────────────────────────── */}
      <RefSection title="Product Fields">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem' }}>
          {['id', 'sku', 'name', 'description', 'category', 'price_cents', 'stock_qty', 'image_url'].map((f) => (
            <code key={f} style={{
              ...codeInline, background: '#e2e8f0', fontSize: '0.7rem', padding: '0.15rem 0.4rem',
            }}>
              {f}
            </code>
          ))}
        </div>
        <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginTop: '0.35rem' }}>
          Prices are in cents — divide by 100 for display.
        </div>
      </RefSection>

      {/* ── HTML Snippets ───────────────────────────────────────────────── */}
      <RefSection title="HTML Snippets">
        <RefRow label="Product link">
          <CopyBlock text={`<a href="${storeUrl}/products/{id}">View Product</a>`} />
        </RefRow>
        <RefRow label="Product image">
          <CopyBlock text={`<img src="{image_url}" alt="{name}" />`} />
        </RefRow>
        <RefRow label="Add to cart link">
          <CopyBlock text={`<a href="${storeUrl}/products/{id}">Add to Cart</a>`} />
        </RefRow>
        <RefRow label="Browse all link">
          <CopyBlock text={`<a href="${storeUrl}/products">Shop Now</a>`} />
        </RefRow>
      </RefSection>

      {/* ── Fetch example ───────────────────────────────────────────────── */}
      <RefSection title="JavaScript Example">
        <CopyBlock text={`<script>
fetch('${apiBase}/products?slug=${slug}')
  .then(r => r.json())
  .then(data => {
    data.products.forEach(p => {
      document.getElementById('grid')
        .innerHTML += \`
          <div>
            <img src="\${p.image_url}" />
            <h3>\${p.name}</h3>
            <p>$\${(p.price_cents/100).toFixed(2)}</p>
            <a href="${storeUrl}/products/\${p.id}">
              View
            </a>
          </div>\`;
    });
  });
</script>`} />
      </RefSection>

      {/* ── Cart integration note ───────────────────────────────────────── */}
      <div style={{
        background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px',
        padding: '0.65rem 0.75rem', fontSize: '0.7rem', color: '#1e40af', lineHeight: 1.5,
        marginTop: '0.25rem',
      }}>
        <strong>Cart tip:</strong> Link customers to individual product pages
        ({storeUrl}/products/&#123;id&#125;) where they can use the built-in &ldquo;Add to Cart&rdquo;
        button, or link directly to the cart page.
      </div>
    </div>
  );
}

/** Section heading inside the embed reference panel */
function RefSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: '1rem' }}>
      <div style={{
        fontSize: '0.75rem', fontWeight: 700, color: '#475569', marginBottom: '0.4rem',
        textTransform: 'uppercase', letterSpacing: '0.04em',
      }}>
        {title}
      </div>
      {children}
    </div>
  );
}

/** Label + child pair in the embed reference */
function RefRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: '0.5rem' }}>
      <div style={{ fontSize: '0.7rem', color: '#64748b', marginBottom: '0.2rem' }}>{label}</div>
      {children}
    </div>
  );
}

/** Copyable code block with a small copy button */
function CopyBlock({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <div style={{
      position: 'relative', background: '#1e293b', color: '#e2e8f0', borderRadius: '6px',
      padding: '0.5rem 0.65rem', fontFamily: 'monospace', fontSize: '0.7rem',
      lineHeight: 1.5, overflowX: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all',
    }}>
      <button
        onClick={handleCopy}
        style={{
          position: 'absolute', top: '4px', right: '4px', background: 'rgba(255,255,255,0.1)',
          border: 'none', borderRadius: '4px', color: copied ? '#4ade80' : '#94a3b8',
          cursor: 'pointer', fontSize: '0.6rem', padding: '0.2rem 0.4rem',
          transition: 'color 0.15s',
        }}
        title="Copy to clipboard"
      >
        {copied ? '✓' : 'Copy'}
      </button>
      {text}
    </div>
  );
}

const codeInline: React.CSSProperties = {
  background: '#f1f5f9', padding: '0.1rem 0.35rem', borderRadius: '3px',
  fontFamily: 'monospace', fontSize: '0.75rem', color: '#334155',
};

// ═════════════════════════════════════════════════════════════════════════════
// Shared Components
// ═════════════════════════════════════════════════════════════════════════════

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{
      background: '#fff', borderRadius: '12px', padding: '1.5rem',
      boxShadow: '0 1px 3px rgba(0,0,0,0.08)', border: '1px solid #e2e8f0',
      marginBottom: '1rem',
    }}>
      <h2 style={{ fontSize: '1rem', fontWeight: 700, color: '#0f172a', marginTop: 0, marginBottom: '1rem' }}>{title}</h2>
      {children}
    </div>
  );
}

function InputField({
  label, value, onChange, placeholder,
}: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string;
}) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={inputStyle}
      />
    </div>
  );
}

function ColorPicker({
  label, value, onChange, placeholder,
}: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string;
}) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
        <input
          type="color"
          value={value || '#000000'}
          onChange={(e) => onChange(e.target.value)}
          style={{ width: '36px', height: '36px', border: '1px solid #d1d5db', borderRadius: '6px', cursor: 'pointer', padding: '2px' }}
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder ?? '#000000'}
          style={{ ...inputStyle, flex: 1, fontFamily: 'monospace', fontSize: '0.8rem' }}
          maxLength={7}
        />
        {value && (
          <button
            type="button"
            onClick={() => onChange('')}
            style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '0.75rem' }}
          >
            Reset
          </button>
        )}
      </div>
    </div>
  );
}

function ThemeSwatch({ theme }: { theme: ThemeName }) {
  const colors: Record<ThemeName, { bg: string; primary: string; accent: string; text: string }> = {
    default: { bg: '#ffffff', primary: '#0070f3', accent: '#ff4f4f', text: '#111827' },
    dark:    { bg: '#0f0f0f', primary: '#3b82f6', accent: '#f97316', text: '#f0f0f0' },
    minimal: { bg: '#fafafa', primary: '#18181b', accent: '#22c55e', text: '#1f2937' },
    bold:    { bg: '#ffffff', primary: '#7c3aed', accent: '#dc2626', text: '#000000' },
    clean:   { bg: '#ffffff', primary: '#111827', accent: '#111827', text: '#111827' },
  };
  const c = colors[theme];
  return (
    <div style={{ display: 'flex', gap: '3px', height: '24px' }}>
      <div style={{ width: '24px', borderRadius: '4px', background: c.bg, border: '1px solid #e5e7eb' }} />
      <div style={{ width: '24px', borderRadius: '4px', background: c.primary }} />
      <div style={{ width: '24px', borderRadius: '4px', background: c.accent }} />
      <div style={{ width: '24px', borderRadius: '4px', background: c.text }} />
    </div>
  );
}

function StatusBadge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem' }}>
      <span style={{
        width: '8px', height: '8px', borderRadius: '50%',
        background: ok ? '#22c55e' : '#94a3b8', display: 'inline-block', flexShrink: 0,
      }} />
      <span style={{ color: ok ? '#15803d' : '#94a3b8' }}>{label}</span>
    </div>
  );
}

// ── Shared Styles ─────────────────────────────────────────────────────────────

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#374151', marginBottom: '0.35rem',
};

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '0.5rem 0.75rem', borderRadius: '8px',
  border: '1px solid #d1d5db', fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box',
};
