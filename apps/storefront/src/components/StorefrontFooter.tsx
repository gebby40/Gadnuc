interface Props {
  slug:         string;
  storeName:    string;
  contactEmail: string | null;
  contactPhone: string | null;
  socialLinks:  Record<string, string>;
}

export function StorefrontFooter({ slug, storeName, contactEmail, contactPhone, socialLinks }: Props) {
  const base = `/tenant/${slug}`;
  const hasSocial = Object.keys(socialLinks).length > 0;

  return (
    <footer
      className="mt-auto"
      style={{
        backgroundColor: 'var(--color-footer-bg)',
        color: 'var(--color-footer-text)',
      }}
    >
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-8">
        {/* Brand / contact */}
        <div>
          <h3
            className="font-bold text-base mb-3"
            style={{ color: 'var(--color-footer-text)', opacity: 1 }}
          >
            {storeName}
          </h3>
          {contactEmail && (
            <p className="mb-1 text-sm" style={{ opacity: 0.7 }}>
              <a
                href={`mailto:${contactEmail}`}
                style={{ color: 'var(--color-footer-text)', textDecoration: 'none' }}
              >
                {contactEmail}
              </a>
            </p>
          )}
          {contactPhone && (
            <p className="text-sm" style={{ opacity: 0.7 }}>{contactPhone}</p>
          )}
        </div>

        {/* Shop links */}
        <div>
          <h4
            className="font-semibold mb-3 text-xs uppercase tracking-widest"
            style={{ opacity: 0.5 }}
          >
            Shop
          </h4>
          <ul className="list-none p-0 m-0 space-y-2 text-sm">
            <li>
              <a
                href={`${base}/products`}
                style={{ color: 'var(--color-footer-text)', textDecoration: 'none', opacity: 0.7 }}
              >
                All Products
              </a>
            </li>
            <li>
              <a
                href={`${base}/cart`}
                style={{ color: 'var(--color-footer-text)', textDecoration: 'none', opacity: 0.7 }}
              >
                Cart
              </a>
            </li>
          </ul>
        </div>

        {/* Social links */}
        {hasSocial && (
          <div>
            <h4
              className="font-semibold mb-3 text-xs uppercase tracking-widest"
              style={{ opacity: 0.5 }}
            >
              Follow Us
            </h4>
            <ul className="list-none p-0 m-0 space-y-2 text-sm">
              {Object.entries(socialLinks).map(([platform, url]) => (
                <li key={platform}>
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      color: 'var(--color-footer-text)',
                      textDecoration: 'none',
                      textTransform: 'capitalize',
                      opacity: 0.7,
                    }}
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
        className="text-center text-xs py-4"
        style={{
          borderTop: '1px solid rgba(255,255,255,0.1)',
          opacity: 0.4,
        }}
      >
        &copy; {new Date().getFullYear()} {storeName}. Powered by{' '}
        <a
          href="https://gadnuc.com"
          style={{ color: 'var(--color-footer-text)', textDecoration: 'none' }}
        >
          Gadnuc
        </a>.
      </div>
    </footer>
  );
}
