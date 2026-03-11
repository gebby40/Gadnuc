import type { Metadata } from 'next';
import { getTenantSettings } from '@/lib/tenant-api';
import { MessagingWidget }   from '@/components/MessagingWidget';

export const metadata: Metadata = { title: 'Customer Support' };

interface PageProps {
  params: { slug: string };
}

export default async function SupportPage({ params }: PageProps) {
  const settings = await getTenantSettings(params.slug);
  const storeName = settings.seo_title ?? params.slug;

  return (
    <>
      {/* Page content */}
      <div className="max-w-2xl mx-auto px-4 py-20 text-center">
        <div className="text-7xl mb-6">🛠️</div>

        <h1
          className="text-3xl font-bold mb-3"
          style={{ color: 'var(--color-text)', fontFamily: 'var(--font-heading)' }}
        >
          How can we help?
        </h1>

        <p className="text-lg mb-4" style={{ color: 'var(--color-text-muted)' }}>
          Our support team is here to answer your questions.
        </p>

        <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
          Click the <strong>Support Chat</strong> button in the bottom-right corner to start a live
          conversation with our team.
        </p>

        {settings.contact_email && (
          <p className="mt-6 text-sm" style={{ color: 'var(--color-text-muted)' }}>
            Or email us at{' '}
            <a
              href={`mailto:${settings.contact_email}`}
              style={{ color: 'var(--color-primary)', textDecoration: 'none' }}
            >
              {settings.contact_email}
            </a>
          </p>
        )}
      </div>

      {/* Floating support widget — renders client-side */}
      <MessagingWidget
        slug={params.slug}
        buttonLabel="Support Chat"
        supportName={storeName}
      />
    </>
  );
}
