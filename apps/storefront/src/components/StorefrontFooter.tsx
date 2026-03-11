import type { TenantInfo, StorefrontSettings } from '@/lib/tenant-api';

interface Props {
  tenant:   TenantInfo;
  settings: StorefrontSettings;
}

export function StorefrontFooter({ tenant, settings }: Props) {
  return (
    <footer style={{
      background: '#111',
      color: '#ccc',
      padding: '3rem 2rem',
      marginTop: '4rem',
    }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '2rem' }}>
        <div>
          <h3 style={{ color: '#fff', margin: '0 0 0.75rem' }}>{tenant.display_name}</h3>
          {settings.contact_email && (
            <p style={{ margin: '0.25rem 0' }}>
              <a href={`mailto:${settings.contact_email}`} style={{ color: '#aaa', textDecoration: 'none' }}>
                {settings.contact_email}
              </a>
            </p>
          )}
          {settings.contact_phone && (
            <p style={{ margin: '0.25rem 0', color: '#aaa' }}>{settings.contact_phone}</p>
          )}
        </div>

        <div>
          <h4 style={{ color: '#fff', margin: '0 0 0.75rem' }}>Shop</h4>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
            <li><a href={`/tenant/${tenant.slug}/products`} style={{ color: '#aaa', textDecoration: 'none' }}>All Products</a></li>
            <li><a href={`/tenant/${tenant.slug}/cart`}     style={{ color: '#aaa', textDecoration: 'none' }}>Cart</a></li>
            <li><a href={`/tenant/${tenant.slug}/orders`}   style={{ color: '#aaa', textDecoration: 'none' }}>My Orders</a></li>
          </ul>
        </div>

        {Object.keys(settings.social_links).length > 0 && (
          <div>
            <h4 style={{ color: '#fff', margin: '0 0 0.75rem' }}>Follow Us</h4>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {Object.entries(settings.social_links).map(([platform, url]) => (
                <li key={platform}>
                  <a href={url} target="_blank" rel="noopener noreferrer" style={{ color: '#aaa', textDecoration: 'none', textTransform: 'capitalize' }}>
                    {platform}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div style={{ maxWidth: '1200px', margin: '2rem auto 0', paddingTop: '1.5rem', borderTop: '1px solid #333', textAlign: 'center', fontSize: '0.875rem', color: '#666' }}>
        © {new Date().getFullYear()} {tenant.display_name}. Powered by{' '}
        <a href="https://gadnuc.io" style={{ color: '#888', textDecoration: 'none' }}>Gadnuc</a>.
      </div>
    </footer>
  );
}
