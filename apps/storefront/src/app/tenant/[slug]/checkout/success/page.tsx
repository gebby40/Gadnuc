import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = { title: 'Order Confirmed' };

interface PageProps {
  params:       { slug: string };
  searchParams: { session_id?: string; order?: string };
}

export default function CheckoutSuccessPage({ params, searchParams }: PageProps) {
  return (
    <div className="max-w-lg mx-auto px-4 py-20 text-center">
      <div className="text-7xl mb-6">🎉</div>

      <h1
        className="text-3xl font-bold mb-3"
        style={{ color: 'var(--color-text)', fontFamily: 'var(--font-heading)' }}
      >
        Order Confirmed!
      </h1>

      <p className="mb-2" style={{ color: 'var(--color-text-muted)' }}>
        Thank you for your purchase. We&apos;ve received your order and are processing it now.
      </p>

      {searchParams.session_id && (
        <p className="text-xs mb-6" style={{ color: 'var(--color-text-muted)' }}>
          Session: {searchParams.session_id}
        </p>
      )}

      <p className="text-sm mb-8" style={{ color: 'var(--color-text-muted)' }}>
        A confirmation email will be sent if you provided your email during checkout.
      </p>

      <div className="flex flex-col sm:flex-row gap-3 justify-center">
        <Link
          href={`/tenant/${params.slug}/products`}
          className="px-8 py-3 rounded-lg font-semibold text-sm"
          style={{ background: 'var(--color-primary)', color: 'var(--color-primary-fg)', textDecoration: 'none' }}
        >
          Continue Shopping
        </Link>
        <Link
          href={`/tenant/${params.slug}`}
          className="px-8 py-3 rounded-lg font-semibold text-sm"
          style={{ border: '1px solid var(--color-border)', color: 'var(--color-text)', textDecoration: 'none' }}
        >
          Go to Homepage
        </Link>
      </div>
    </div>
  );
}
