import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = { title: 'Checkout Cancelled' };

interface PageProps {
  params: { slug: string };
}

export default function CheckoutCancelPage({ params }: PageProps) {
  return (
    <div className="max-w-lg mx-auto px-4 py-20 text-center">
      <div className="text-7xl mb-6">😕</div>

      <h1
        className="text-3xl font-bold mb-3"
        style={{ color: 'var(--color-text)', fontFamily: 'var(--font-heading)' }}
      >
        Checkout Cancelled
      </h1>

      <p className="mb-8" style={{ color: 'var(--color-text-muted)' }}>
        Your order was not placed. Your cart has been saved — you can return whenever you&apos;re ready.
      </p>

      <div className="flex flex-col sm:flex-row gap-3 justify-center">
        <Link
          href={`/tenant/${params.slug}/cart`}
          className="px-8 py-3 rounded-lg font-semibold text-sm"
          style={{ background: 'var(--color-primary)', color: 'var(--color-primary-fg)', textDecoration: 'none' }}
        >
          Return to Cart
        </Link>
        <Link
          href={`/tenant/${params.slug}/products`}
          className="px-8 py-3 rounded-lg font-semibold text-sm"
          style={{ border: '1px solid var(--color-border)', color: 'var(--color-text)', textDecoration: 'none' }}
        >
          Browse Products
        </Link>
      </div>
    </div>
  );
}
