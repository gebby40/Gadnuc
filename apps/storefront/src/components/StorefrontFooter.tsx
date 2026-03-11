interface Props {
  storeName:    string;
  contactEmail: string | null;
  contactPhone: string | null;
  socialLinks:  Record<string, string>;
}

export function StorefrontFooter({ storeName, contactEmail, contactPhone, socialLinks }: Props) {
  const hasSocial = Object.keys(socialLinks).length > 0;

  return (
    <footer
      className="mt-16"
      style={{
        backgroundColor: 'var(--color-bg-secondary)',
        borderTop: '1px solid var(--color-border)',
        color: 'var(--color-text-muted)',
      }}
    >
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-8">
        {/* Brand / contact */}
        <div>
          <h3 className="font-bold mb-3" style={{ color: 'var(--color-text)' }}>{storeName}</h3>
          {contactEmail && (
            <p className="mb-1 text-sm">
              <a
                href={`mailto:${contactEmail}`}
                style={{ color: 'var(--color-text-muted)', textDecoration: 'none' }}
              >
                {contactEmail}
              </a>
            </p>
          )}
          {contactPhone && (
            <p className="text-sm">{contactPhone}</p>
          )}
        </div>

        {/* Shop links */}
        <div>
          <h4 className="font-semibold mb-3 text-sm uppercase tracking-wider" style={{ color: 'var(--color-text)' }}>Shop</h4>
          <ul className="list-none p-0 m-0 space-y-2 text-sm">
            <li>
              <a href="products" style={{ color: 'var(--color-text-muted)', textDecoration: 'none' }}>
                All Products
              </a>
            </li>
            <li>
              <a href="cart" style={{ color: 'var(--color-text-muted)', textDecoration: 'none' }}>
                Cart
              </a>
            </li>
          </ul>
        </div>

        {/* Social links */}
        {hasSocial && (
          <div>
            <h4 className="font-semibold mb-3 text-sm uppercase tracking-wider" style={{ color: 'var(--color-text)' }}>Follow Us</h4>
            <ul className="list-none p-0 m-0 space-y-2 text-sm">
              {Object.entries(socialLinks).map(([platform, url]) => (
                <li key={platform}>
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: 'var(--color-text-muted)', textDecoration: 'none', textTransform: 'capitalize' }}
                  >
                    {platform}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div
        className="border-t text-center text-xs py-4"
        style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-muted)' }}
      >
        © {new Date().getFullYear()} {storeName}. Powered by{' '}
        <a href="https://gadnuc.io" style={{ color: 'var(--color-text-muted)', textDecoration: 'none' }}>
          Gadnuc
        </a>.
      </div>
    </footer>
  );
}
