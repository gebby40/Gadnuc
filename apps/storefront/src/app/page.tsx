// Root platform homepage — shown at gadnuc.io
export default function PlatformHomePage() {
  return (
    <main style={{ padding: '4rem 2rem', maxWidth: '800px', margin: '0 auto', textAlign: 'center' }}>
      <h1 style={{ fontSize: '3rem', fontWeight: 800, marginBottom: '1rem' }}>
        Gadnuc
      </h1>
      <p style={{ fontSize: '1.25rem', color: '#555', marginBottom: '2rem' }}>
        The inventory & store management SaaS platform for growing businesses.
      </p>
      <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
        <a
          href="/signup"
          style={{
            background: '#0070f3', color: '#fff',
            padding: '0.75rem 2rem', borderRadius: '8px',
            textDecoration: 'none', fontWeight: 600,
          }}
        >
          Start Free Trial
        </a>
        <a
          href="/pricing"
          style={{
            border: '2px solid #0070f3', color: '#0070f3',
            padding: '0.75rem 2rem', borderRadius: '8px',
            textDecoration: 'none', fontWeight: 600,
          }}
        >
          See Pricing
        </a>
      </div>
    </main>
  );
}
