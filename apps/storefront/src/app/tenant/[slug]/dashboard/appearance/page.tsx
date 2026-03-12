'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { useAuth } from '@/components/AuthProvider';
import { tenantGet, tenantPatch, tenantPost } from '@/lib/api';
import { THEME_NAMES, THEME_META } from '@/lib/themes';
import type { ThemeName } from '@/lib/themes';

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
}

export default function AppearancePage() {
  const params = useParams();
  const slug = params.slug as string;
  const { token } = useAuth();

  const [settings, setSettings] = useState<Settings>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [uploading, setUploading] = useState<'logo' | 'hero' | null>(null);

  // Social links as mutable array for editing
  const [socialEntries, setSocialEntries] = useState<[string, string][]>([]);

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

  async function handleSave() {
    if (!token) return;
    setSaving(true);
    setError('');
    setSuccess('');

    try {
      // Rebuild social_links from entries
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

      // Only include string fields if they have values
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

  if (loading) {
    return <div style={{ padding: '2rem', color: '#64748b' }}>Loading appearance settings...</div>;
  }

  return (
    <div style={{ padding: '2rem', maxWidth: '800px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#0f172a', margin: 0 }}>Appearance</h1>
          <p style={{ fontSize: '0.85rem', color: '#64748b', marginTop: '0.25rem' }}>
            Customize your storefront theme, colors, and branding.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
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
            onClick={handleSave}
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
      </div>

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

      {/* Theme Presets */}
      <Section title="Theme">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '0.75rem' }}>
          {THEME_NAMES.map((name) => {
            const meta = THEME_META[name];
            const isActive = (settings.theme ?? 'default') === name;
            return (
              <button
                key={name}
                onClick={() => update('theme', name)}
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
          <ColorPicker label="Primary Color" value={settings.primary_color ?? '#0070f3'} onChange={(v) => update('primary_color', v)} />
          <ColorPicker label="Accent Color" value={settings.accent_color ?? '#ff4f4f'} onChange={(v) => update('accent_color', v)} />
          <ColorPicker label="Nav Background" value={settings.nav_bg_color ?? ''} onChange={(v) => update('nav_bg_color', v)} placeholder="From theme" />
          <ColorPicker label="Nav Text" value={settings.nav_text_color ?? ''} onChange={(v) => update('nav_text_color', v)} placeholder="From theme" />
          <ColorPicker label="Footer Background" value={settings.footer_bg_color ?? ''} onChange={(v) => update('footer_bg_color', v)} placeholder="From theme" />
          <ColorPicker label="Footer Text" value={settings.footer_text_color ?? ''} onChange={(v) => update('footer_text_color', v)} placeholder="From theme" />
        </div>
      </Section>

      {/* Logo */}
      <Section title="Logo">
        {settings.logo_url ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <img src={settings.logo_url} alt="Logo" style={{ width: '60px', height: '60px', objectFit: 'contain', borderRadius: '8px', border: '1px solid #e2e8f0' }} />
            <button
              type="button"
              onClick={() => update('logo_url', null)}
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
              onChange={e => { const f = e.target.files?.[0]; if (f) handleImageUpload(f, 'logo_url'); }}
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
            onChange={e => update('hero_enabled', e.target.checked)}
          />
          <label htmlFor="hero_enabled" style={{ fontSize: '0.85rem', color: '#374151' }}>
            Show hero banner on homepage
          </label>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
          <InputField label="Hero Title" value={settings.hero_title ?? ''} onChange={(v) => update('hero_title', v)} placeholder="Welcome" />
          <InputField label="Hero Subtitle" value={settings.hero_subtitle ?? ''} onChange={(v) => update('hero_subtitle', v)} placeholder="Shop our collection" />
        </div>
        <div>
          <label style={labelStyle}>Hero Image</label>
          {settings.hero_image_url ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <img src={settings.hero_image_url} alt="Hero" style={{ width: '120px', height: '60px', objectFit: 'cover', borderRadius: '8px', border: '1px solid #e2e8f0' }} />
              <button
                type="button"
                onClick={() => update('hero_image_url', null)}
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
                onChange={e => { const f = e.target.files?.[0]; if (f) handleImageUpload(f, 'hero_image_url'); }}
              />
            </label>
          )}
        </div>
      </Section>

      {/* Store Info */}
      <Section title="Store Info">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
          <InputField label="Store Name" value={settings.store_name ?? ''} onChange={(v) => update('store_name', v)} placeholder="My Store" />
          <InputField label="Contact Email" value={settings.contact_email ?? ''} onChange={(v) => update('contact_email', v)} placeholder="hello@example.com" />
        </div>
        <div style={{ marginBottom: '1rem' }}>
          <InputField label="Contact Phone" value={settings.contact_phone ?? ''} onChange={(v) => update('contact_phone', v)} placeholder="+1 (555) 000-0000" />
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
                setSocialEntries(next);
              }}
              placeholder="Platform"
              style={{ ...inputStyle, flex: '0 0 120px' }}
            />
            <input
              value={url}
              onChange={(e) => {
                const next = [...socialEntries];
                next[i] = [platform, e.target.value];
                setSocialEntries(next);
              }}
              placeholder="https://..."
              style={{ ...inputStyle, flex: 1 }}
            />
            <button
              type="button"
              onClick={() => setSocialEntries(socialEntries.filter((_, j) => j !== i))}
              style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '1rem', padding: '0 0.25rem' }}
            >
              ×
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => setSocialEntries([...socialEntries, ['', '']])}
          style={{ background: 'none', border: 'none', color: '#3b82f6', cursor: 'pointer', fontSize: '0.8rem', padding: 0, fontWeight: 500 }}
        >
          + Add social link
        </button>
      </Section>

      {/* SEO */}
      <Section title="SEO">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '1rem' }}>
          <InputField label="SEO Title" value={settings.seo_title ?? ''} onChange={(v) => update('seo_title', v)} placeholder="Page title for search engines" />
          <div>
            <label style={labelStyle}>SEO Description</label>
            <textarea
              value={settings.seo_description ?? ''}
              onChange={(e) => update('seo_description', e.target.value)}
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
          onChange={(e) => update('custom_css', e.target.value)}
          rows={5}
          style={{ ...inputStyle, fontFamily: 'monospace', fontSize: '0.8rem', resize: 'vertical' }}
          placeholder="/* Custom styles */"
        />
      </Section>

      {/* Bottom Save */}
      <div style={{ marginTop: '1.5rem', display: 'flex', gap: '0.75rem' }}>
        <button
          onClick={handleSave}
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
    </div>
  );
}

// ── Helper Components ─────────────────────────────────────────────────────────

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
  const displayValue = value || placeholder || '#000000';
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

/** Tiny color swatch showing theme palette */
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

// ── Shared Styles ─────────────────────────────────────────────────────────────

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#374151', marginBottom: '0.35rem',
};

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '0.5rem 0.75rem', borderRadius: '8px',
  border: '1px solid #d1d5db', fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box',
};
