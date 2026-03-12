import Link from 'next/link';

interface HeroProps {
  title:        string;
  subtitle?:    string | null;
  imageUrl?:    string | null;
  primaryColor: string;
  slug:         string;
  enabled?:     boolean;
}

export function HeroSection({ title, subtitle, imageUrl, primaryColor, slug, enabled = true }: HeroProps) {
  if (!enabled) return null;

  return (
    <section
      style={{
        position:   'relative',
        minHeight:  '420px',
        display:    'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: imageUrl
          ? `linear-gradient(rgba(0,0,0,0.45), rgba(0,0,0,0.45)), url(${imageUrl}) center/cover no-repeat`
          : `linear-gradient(135deg, var(--color-primary) 0%, var(--color-accent) 100%)`,
        color: '#fff',
        padding: '4rem 2rem',
        textAlign: 'center',
      }}
    >
      <div style={{ maxWidth: '720px' }}>
        <h1
          style={{
            fontSize: 'clamp(2rem, 5vw, 4rem)',
            fontWeight: 800,
            margin: '0 0 1rem',
            fontFamily: 'var(--font-heading)',
          }}
        >
          {title}
        </h1>
        {subtitle && (
          <p style={{ fontSize: 'clamp(1rem, 2.5vw, 1.4rem)', opacity: 0.9, margin: '0 0 2rem' }}>
            {subtitle}
          </p>
        )}
        <Link
          href={`/tenant/${slug}/products`}
          style={{
            display: 'inline-block',
            background: 'rgba(255,255,255,0.2)',
            border: '2px solid #fff',
            color: '#fff',
            padding: '0.875rem 2.5rem',
            borderRadius: 'var(--radius-card)',
            textDecoration: 'none',
            fontWeight: 700,
            fontSize: '1.1rem',
            backdropFilter: 'blur(4px)',
          }}
        >
          Shop Now
        </Link>
      </div>
    </section>
  );
}
