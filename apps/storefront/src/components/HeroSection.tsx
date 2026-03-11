interface HeroProps {
  title:        string;
  subtitle?:    string | null;
  imageUrl?:    string | null;
  primaryColor: string;
}

export function HeroSection({ title, subtitle, imageUrl, primaryColor }: HeroProps) {
  return (
    <section style={{
      position: 'relative',
      minHeight: '420px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: imageUrl
        ? `linear-gradient(rgba(0,0,0,0.45), rgba(0,0,0,0.45)), url(${imageUrl}) center/cover no-repeat`
        : `linear-gradient(135deg, ${primaryColor}22, ${primaryColor}55)`,
      color: imageUrl ? '#fff' : '#111',
      padding: '4rem 2rem',
      textAlign: 'center',
    }}>
      <div>
        <h1 style={{ fontSize: 'clamp(2rem, 5vw, 4rem)', fontWeight: 800, margin: '0 0 1rem' }}>
          {title}
        </h1>
        {subtitle && (
          <p style={{ fontSize: 'clamp(1rem, 2.5vw, 1.5rem)', opacity: 0.9, margin: '0 0 2rem' }}>
            {subtitle}
          </p>
        )}
        <a
          href="#products"
          style={{
            display: 'inline-block',
            background: primaryColor,
            color: '#fff',
            padding: '0.875rem 2.5rem',
            borderRadius: '8px',
            textDecoration: 'none',
            fontWeight: 700,
            fontSize: '1.1rem',
          }}
        >
          Shop Now
        </a>
      </div>
    </section>
  );
}
