// Platform landing page — gadnuc.com
import Link from 'next/link';

const features = [
  { icon: '🏪', title: 'Multi-Tenant Stores', desc: 'Each business gets their own branded storefront with custom domain support.' },
  { icon: '📦', title: 'Inventory Management', desc: 'Track products, stock levels, and low-stock alerts in real time.' },
  { icon: '💬', title: 'Team Messaging', desc: 'Built-in workspace chat for your team and customer support.' },
  { icon: '💳', title: 'Stripe Payments', desc: 'Stripe Connect integration for seamless checkout and payouts.' },
  { icon: '🎨', title: 'Custom Theming', desc: 'Multiple themes with customizable colors, fonts, and branding.' },
  { icon: '📊', title: 'Analytics Dashboard', desc: 'Track page views, conversions, and revenue across your store.' },
];

const plans = [
  { name: 'Starter', price: 29, users: 5, products: 100, features: ['Storefront', 'Inventory', 'Basic analytics'] },
  { name: 'Professional', price: 99, users: 25, products: 1000, features: ['Everything in Starter', 'Team messaging', 'Custom domain', 'API access'] },
  { name: 'Enterprise', price: 299, users: -1, products: -1, features: ['Everything in Pro', 'Dedicated support', 'Custom integrations', 'SLA guarantee'] },
];

const steps = [
  { num: '1', title: 'Sign Up', desc: 'Create your account and configure your store in minutes.' },
  { num: '2', title: 'Add Products', desc: 'Import or create your product catalog with images and pricing.' },
  { num: '3', title: 'Start Selling', desc: 'Share your store link and start accepting orders immediately.' },
];

export default function PlatformHomePage() {
  return (
    <div style={{ minHeight: '100vh', background: '#fff' }}>
      {/* ── Nav ─────────────────────────────────────────────────────────── */}
      <nav style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '1rem 2rem', maxWidth: '1200px', margin: '0 auto',
      }}>
        <div style={{ fontWeight: 800, fontSize: '1.5rem', color: '#0f172a' }}>Gadnuc</div>
        <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center' }}>
          <a href="#features" style={{ color: '#64748b', textDecoration: 'none', fontSize: '0.9rem' }}>Features</a>
          <a href="#pricing" style={{ color: '#64748b', textDecoration: 'none', fontSize: '0.9rem' }}>Pricing</a>
          <Link href="/login" style={{
            background: '#0f172a', color: '#fff', padding: '0.5rem 1.25rem',
            borderRadius: '8px', textDecoration: 'none', fontSize: '0.9rem', fontWeight: 600,
          }}>
            Log In
          </Link>
        </div>
      </nav>

      {/* ── Hero ────────────────────────────────────────────────────────── */}
      <section style={{
        background: 'linear-gradient(135deg, #0f172a 0%, #1e3a5f 100%)',
        color: '#fff', padding: '5rem 2rem', textAlign: 'center',
      }}>
        <div style={{ maxWidth: '800px', margin: '0 auto' }}>
          <h1 style={{ fontSize: 'clamp(2rem, 5vw, 3.5rem)', fontWeight: 800, marginBottom: '1.5rem', lineHeight: 1.2 }}>
            Everything you need to run your online store
          </h1>
          <p style={{ fontSize: '1.25rem', color: '#94a3b8', marginBottom: '2.5rem', lineHeight: 1.6 }}>
            Gadnuc is the all-in-one inventory and store management platform for growing businesses.
            Get your store online in minutes with built-in payments, team tools, and analytics.
          </p>
          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link href="/login" style={{
              background: '#3b82f6', color: '#fff', padding: '0.875rem 2rem',
              borderRadius: '8px', textDecoration: 'none', fontWeight: 600, fontSize: '1rem',
            }}>
              Get Started
            </Link>
            <a href="#pricing" style={{
              border: '2px solid rgba(255,255,255,0.3)', color: '#fff',
              padding: '0.875rem 2rem', borderRadius: '8px',
              textDecoration: 'none', fontWeight: 600, fontSize: '1rem',
            }}>
              View Pricing
            </a>
          </div>
        </div>
      </section>

      {/* ── Features ────────────────────────────────────────────────────── */}
      <section id="features" style={{ padding: '5rem 2rem', maxWidth: '1100px', margin: '0 auto' }}>
        <h2 style={{ textAlign: 'center', fontSize: '2rem', fontWeight: 700, color: '#0f172a', marginBottom: '0.5rem' }}>
          Built for modern commerce
        </h2>
        <p style={{ textAlign: 'center', color: '#64748b', marginBottom: '3rem', fontSize: '1.1rem' }}>
          Everything your business needs in one platform.
        </p>
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
          gap: '1.5rem',
        }}>
          {features.map((f) => (
            <div key={f.title} style={{
              background: '#f8fafc', borderRadius: '12px', padding: '2rem',
              border: '1px solid #e2e8f0',
            }}>
              <div style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>{f.icon}</div>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 600, color: '#0f172a', marginBottom: '0.5rem' }}>{f.title}</h3>
              <p style={{ color: '#64748b', fontSize: '0.9rem', lineHeight: 1.6, margin: 0 }}>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── How it works ────────────────────────────────────────────────── */}
      <section style={{ background: '#f8fafc', padding: '5rem 2rem' }}>
        <div style={{ maxWidth: '900px', margin: '0 auto', textAlign: 'center' }}>
          <h2 style={{ fontSize: '2rem', fontWeight: 700, color: '#0f172a', marginBottom: '3rem' }}>
            Up and running in three steps
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '2rem' }}>
            {steps.map((s) => (
              <div key={s.num}>
                <div style={{
                  width: '48px', height: '48px', borderRadius: '50%',
                  background: '#3b82f6', color: '#fff', display: 'inline-flex',
                  alignItems: 'center', justifyContent: 'center',
                  fontSize: '1.25rem', fontWeight: 700, marginBottom: '1rem',
                }}>
                  {s.num}
                </div>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 600, color: '#0f172a', marginBottom: '0.5rem' }}>{s.title}</h3>
                <p style={{ color: '#64748b', fontSize: '0.9rem', lineHeight: 1.6, margin: 0 }}>{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Pricing ─────────────────────────────────────────────────────── */}
      <section id="pricing" style={{ padding: '5rem 2rem', maxWidth: '1100px', margin: '0 auto' }}>
        <h2 style={{ textAlign: 'center', fontSize: '2rem', fontWeight: 700, color: '#0f172a', marginBottom: '0.5rem' }}>
          Simple, transparent pricing
        </h2>
        <p style={{ textAlign: 'center', color: '#64748b', marginBottom: '3rem', fontSize: '1.1rem' }}>
          Start free for 14 days. No credit card required.
        </p>
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
          gap: '1.5rem', alignItems: 'start',
        }}>
          {plans.map((p, i) => {
            const highlight = i === 1;
            return (
              <div key={p.name} style={{
                background: highlight ? '#0f172a' : '#fff',
                color: highlight ? '#f8fafc' : '#0f172a',
                borderRadius: '12px', padding: '2rem',
                border: highlight ? 'none' : '1px solid #e2e8f0',
                boxShadow: highlight ? '0 8px 30px rgba(15,23,42,0.15)' : '0 1px 3px rgba(0,0,0,0.08)',
              }}>
                {highlight && (
                  <div style={{
                    display: 'inline-block', background: '#3b82f6', color: '#fff',
                    padding: '0.2rem 0.75rem', borderRadius: '999px',
                    fontSize: '0.75rem', fontWeight: 600, marginBottom: '1rem',
                  }}>
                    Most Popular
                  </div>
                )}
                <h3 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.5rem' }}>{p.name}</h3>
                <div style={{ fontSize: '2.5rem', fontWeight: 800, marginBottom: '0.25rem' }}>
                  ${p.price}<span style={{ fontSize: '1rem', fontWeight: 400, color: highlight ? '#94a3b8' : '#64748b' }}>/mo</span>
                </div>
                <p style={{ fontSize: '0.85rem', color: highlight ? '#94a3b8' : '#64748b', marginBottom: '1.5rem' }}>
                  {p.users === -1 ? 'Unlimited' : `Up to ${p.users}`} users · {p.products === -1 ? 'Unlimited' : `${p.products}`} products
                </p>
                <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 1.5rem' }}>
                  {p.features.map((f) => (
                    <li key={f} style={{
                      padding: '0.4rem 0', fontSize: '0.9rem',
                      color: highlight ? '#cbd5e1' : '#475569',
                    }}>
                      ✓ {f}
                    </li>
                  ))}
                </ul>
                <Link href="/login" style={{
                  display: 'block', textAlign: 'center',
                  background: highlight ? '#3b82f6' : '#0f172a',
                  color: '#fff', padding: '0.75rem',
                  borderRadius: '8px', textDecoration: 'none', fontWeight: 600,
                }}>
                  Start Free Trial
                </Link>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      <footer style={{
        background: '#0f172a', color: '#94a3b8', padding: '3rem 2rem',
        textAlign: 'center', fontSize: '0.85rem',
      }}>
        <div style={{ maxWidth: '800px', margin: '0 auto' }}>
          <div style={{ fontWeight: 700, fontSize: '1.1rem', color: '#f8fafc', marginBottom: '1rem' }}>Gadnuc</div>
          <div style={{ display: 'flex', gap: '1.5rem', justifyContent: 'center', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
            <Link href="/login" style={{ color: '#94a3b8', textDecoration: 'none' }}>Log In</Link>
            <a href="#features" style={{ color: '#94a3b8', textDecoration: 'none' }}>Features</a>
            <a href="#pricing" style={{ color: '#94a3b8', textDecoration: 'none' }}>Pricing</a>
          </div>
          <div>© {new Date().getFullYear()} Gadnuc. All rights reserved.</div>
        </div>
      </footer>
    </div>
  );
}
