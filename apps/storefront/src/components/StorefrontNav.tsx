import type { TenantInfo, StorefrontSettings } from '@/lib/tenant-api';

interface Props {
  tenant:   TenantInfo;
  settings: StorefrontSettings;
}

export function StorefrontNav({ tenant, settings }: Props) {
  const base = `/${tenant.slug}`;

  return (
    <nav style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '1rem 2rem',
      background: settings.primary_color,
      color: '#fff',
      boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
    }}>
      <a href={`${base}`} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', textDecoration: 'none', color: '#fff' }}>
        {settings.logo_url && (
          <img src={settings.logo_url} alt="Logo" style={{ height: '36px', objectFit: 'contain' }} />
        )}
        <span style={{ fontSize: '1.25rem', fontWeight: 700 }}>{tenant.display_name}</span>
      </a>

      <ul style={{ display: 'flex', gap: '1.5rem', listStyle: 'none', margin: 0, padding: 0 }}>
        <li><a href={`${base}/products`} style={{ color: '#fff', textDecoration: 'none', fontWeight: 500 }}>Products</a></li>
        <li><a href={`${base}/cart`}     style={{ color: '#fff', textDecoration: 'none', fontWeight: 500 }}>Cart</a></li>
        <li><a href={`${base}/account`}  style={{ color: '#fff', textDecoration: 'none', fontWeight: 500 }}>Account</a></li>
      </ul>
    </nav>
  );
}
