import type { Metadata } from 'next';
import { notFound }  from 'next/navigation';
import Link          from 'next/link';
import Image         from 'next/image';
import { getOrder }  from '@/lib/tenant-api';

interface PageProps {
  params: { slug: string; orderNumber: string };
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  return { title: `Order ${params.orderNumber}` };
}

function formatPrice(cents: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
}

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }).format(new Date(iso));
}

const STATUS_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  pending:     { label: 'Pending',     color: '#92400e', bg: '#fef3c7' },
  processing:  { label: 'Processing',  color: '#1d4ed8', bg: '#dbeafe' },
  shipped:     { label: 'Shipped',     color: '#6d28d9', bg: '#ede9fe' },
  delivered:   { label: 'Delivered',   color: '#15803d', bg: '#dcfce7' },
  cancelled:   { label: 'Cancelled',   color: '#991b1b', bg: '#fee2e2' },
  refunded:    { label: 'Refunded',    color: '#374151', bg: '#f3f4f6' },
};

export default async function OrderStatusPage({ params }: PageProps) {
  const order = await getOrder(params.slug, params.orderNumber);
  if (!order) notFound();

  const statusInfo = STATUS_LABELS[order.status] ?? STATUS_LABELS.pending;

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10">
      {/* Back link */}
      <Link
        href={`/tenant/${params.slug}`}
        className="text-sm mb-6 inline-block"
        style={{ color: 'var(--color-primary)', textDecoration: 'none' }}
      >
        ← Back to Store
      </Link>

      {/* Header */}
      <div
        className="p-6 rounded-2xl mb-6"
        style={{ background: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)' }}
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1
              className="text-2xl font-bold mb-1"
              style={{ color: 'var(--color-text)', fontFamily: 'var(--font-heading)' }}
            >
              Order {order.order_number}
            </h1>
            <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
              Placed {formatDate(order.created_at)}
            </p>
            {order.customer_name && (
              <p className="text-sm mt-1" style={{ color: 'var(--color-text-muted)' }}>
                {order.customer_name}
                {order.customer_email && ` · ${order.customer_email}`}
              </p>
            )}
          </div>

          {/* Status badge */}
          <span
            className="px-4 py-1.5 rounded-full text-sm font-semibold"
            style={{ background: statusInfo.bg, color: statusInfo.color }}
          >
            {statusInfo.label}
          </span>
        </div>

        {/* Progress bar */}
        {!['cancelled', 'refunded'].includes(order.status) && (
          <div className="mt-6">
            <div className="flex justify-between text-xs mb-2" style={{ color: 'var(--color-text-muted)' }}>
              {['pending', 'processing', 'shipped', 'delivered'].map((s) => (
                <span
                  key={s}
                  className="capitalize font-medium"
                  style={{
                    color: ['pending', 'processing', 'shipped', 'delivered'].indexOf(s) <=
                           ['pending', 'processing', 'shipped', 'delivered'].indexOf(order.status)
                      ? 'var(--color-primary)' : 'var(--color-text-muted)',
                  }}
                >
                  {s}
                </span>
              ))}
            </div>
            <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--color-border)' }}>
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  background: 'var(--color-primary)',
                  width: `${((['pending', 'processing', 'shipped', 'delivered'].indexOf(order.status) + 1) / 4) * 100}%`,
                }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Items */}
      <div
        className="rounded-2xl overflow-hidden mb-6"
        style={{ border: '1px solid var(--color-border)' }}
      >
        <div
          className="px-6 py-4 font-semibold"
          style={{ borderBottom: '1px solid var(--color-border)', background: 'var(--color-bg-secondary)', color: 'var(--color-text)' }}
        >
          Items ({order.items.length})
        </div>

        <div className="divide-y" style={{ background: 'var(--color-surface)' }}>
          {order.items.map((item, idx) => (
            <div key={idx} className="flex items-center gap-4 p-4">
              {/* Image */}
              <div
                className="relative flex-shrink-0 rounded-lg overflow-hidden"
                style={{ width: 56, height: 56, background: 'var(--color-bg-secondary)' }}
              >
                {item.image_url ? (
                  <Image src={item.image_url} alt={item.name} fill className="object-cover" unoptimized />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-xl">📦</div>
                )}
              </div>

              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm truncate" style={{ color: 'var(--color-text)' }}>
                  {item.name}
                </p>
                <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                  {item.sku} · Qty: {item.quantity}
                </p>
              </div>

              <div className="text-right flex-shrink-0">
                <p className="font-medium text-sm" style={{ color: 'var(--color-text)' }}>
                  {formatPrice(item.unit_price_cents * item.quantity)}
                </p>
                <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                  {formatPrice(item.unit_price_cents)} each
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* Total */}
        <div
          className="flex justify-between items-center px-6 py-4 font-bold"
          style={{
            borderTop: '1px solid var(--color-border)',
            background: 'var(--color-bg-secondary)',
            color: 'var(--color-text)',
          }}
        >
          <span>Total</span>
          <span style={{ color: 'var(--color-primary)' }}>{formatPrice(order.total_cents)}</span>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-3 flex-wrap">
        <Link
          href={`/tenant/${params.slug}/products`}
          className="px-6 py-2.5 rounded-lg text-sm font-semibold"
          style={{ background: 'var(--color-primary)', color: 'var(--color-primary-fg)', textDecoration: 'none' }}
        >
          Shop Again
        </Link>
      </div>
    </div>
  );
}
