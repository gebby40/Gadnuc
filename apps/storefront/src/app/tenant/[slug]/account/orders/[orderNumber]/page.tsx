'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '../../../../../../components/AuthProvider';
import { tenantGet } from '../../../../../../lib/api';

interface OrderItem {
  sku: string;
  name: string;
  quantity: number;
  unit_price_cents: number;
  image_url: string | null;
  product_id: string;
}

interface OrderDetail {
  id: string;
  order_number: string;
  customer_name: string;
  customer_email: string;
  status: string;
  total_cents: number;
  shipping_address: {
    line1: string; line2?: string; city: string; state: string; zip: string; country: string;
  } | null;
  created_at: string;
  items: OrderItem[];
}

export default function CustomerOrderDetailPage() {
  const params = useParams();
  const router = useRouter();
  const slug = params.slug as string;
  const orderNumber = params.orderNumber as string;
  const { user, token } = useAuth();
  const base = `/tenant/${slug}`;

  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!user || user.role !== 'customer') {
      router.push(`${base}/account/login`);
      return;
    }
    async function fetchOrder() {
      if (!token) return;
      try {
        // Use the public storefront order lookup
        const res = await tenantGet<{ data: OrderDetail }>(slug, token, `/api/storefront/orders/${orderNumber}`);
        setOrder(res.data);
      } catch (err) {
        setError('Order not found');
      } finally {
        setLoading(false);
      }
    }
    fetchOrder();
  }, [slug, token, orderNumber, user, router, base]);

  function formatPrice(cents: number) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
  }

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString('en-US', {
      weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
    });
  }

  const statusColors: Record<string, { bg: string; fg: string }> = {
    pending:    { bg: '#fef3c7', fg: '#92400e' },
    processing: { bg: '#dbeafe', fg: '#1e40af' },
    shipped:    { bg: '#e0e7ff', fg: '#3730a3' },
    delivered:  { bg: '#dcfce7', fg: '#166534' },
    cancelled:  { bg: '#fee2e2', fg: '#991b1b' },
    refunded:   { bg: '#f3e8ff', fg: '#6b21a8' },
  };

  if (loading) {
    return <div style={{ padding: '4rem 2rem', textAlign: 'center', color: '#94a3b8' }}>Loading order...</div>;
  }

  if (error || !order) {
    return (
      <div style={{ padding: '4rem 2rem', textAlign: 'center' }}>
        <p style={{ color: '#dc2626', marginBottom: '1rem' }}>{error || 'Order not found'}</p>
        <Link href={`${base}/account`} style={{ color: '#2563eb', textDecoration: 'none' }}>← Back to account</Link>
      </div>
    );
  }

  const sc = statusColors[order.status] ?? { bg: '#f1f5f9', fg: '#64748b' };

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', padding: '2rem 1.5rem' }}>
      {/* Breadcrumb */}
      <div style={{ marginBottom: '1.5rem' }}>
        <Link href={`${base}/account`} style={{ color: '#64748b', textDecoration: 'none', fontSize: '0.85rem' }}>
          ← Back to Account
        </Link>
      </div>

      {/* Order Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 700, color: '#0f172a', margin: '0 0 0.25rem' }}>
            Order {order.order_number}
          </h1>
          <p style={{ color: '#64748b', fontSize: '0.85rem', margin: 0 }}>
            Placed on {formatDate(order.created_at)}
          </p>
        </div>
        <span style={{
          padding: '0.3rem 0.8rem', borderRadius: '999px', fontSize: '0.8rem',
          fontWeight: 600, background: sc.bg, color: sc.fg, textTransform: 'capitalize',
        }}>
          {order.status}
        </span>
      </div>

      {/* Items */}
      <div style={{
        background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0',
        overflow: 'hidden', marginBottom: '1.5rem',
      }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
          <thead>
            <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
              <th style={thStyle}></th>
              <th style={thStyle}>Product</th>
              <th style={{ ...thStyle, textAlign: 'center' }}>Qty</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>Price</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {order.items.map((item, i) => (
              <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                <td style={{ ...tdStyle, width: '50px' }}>
                  {item.image_url ? (
                    <img src={item.image_url} alt="" style={{ width: '40px', height: '40px', objectFit: 'cover', borderRadius: '6px' }} />
                  ) : (
                    <div style={{ width: '40px', height: '40px', background: '#f1f5f9', borderRadius: '6px' }} />
                  )}
                </td>
                <td style={{ ...tdStyle, fontWeight: 500, color: '#0f172a' }}>
                  {item.name}
                  <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>SKU: {item.sku}</div>
                </td>
                <td style={{ ...tdStyle, textAlign: 'center' }}>{item.quantity}</td>
                <td style={{ ...tdStyle, textAlign: 'right' }}>{formatPrice(item.unit_price_cents)}</td>
                <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 600 }}>
                  {formatPrice(item.unit_price_cents * item.quantity)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Total */}
        <div style={{
          display: 'flex', justifyContent: 'flex-end', padding: '1rem 0.75rem',
          borderTop: '1px solid #e2e8f0', background: '#f8fafc',
        }}>
          <div style={{ fontSize: '1rem', fontWeight: 700, color: '#0f172a' }}>
            Total: {formatPrice(order.total_cents)}
          </div>
        </div>
      </div>

      {/* Shipping Address */}
      {order.shipping_address && (
        <div style={{
          background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0',
          padding: '1.25rem',
        }}>
          <h3 style={{ fontSize: '0.9rem', fontWeight: 600, color: '#0f172a', margin: '0 0 0.5rem' }}>
            Shipping Address
          </h3>
          <div style={{ fontSize: '0.85rem', color: '#374151', lineHeight: 1.6 }}>
            <div>{order.shipping_address.line1}</div>
            {order.shipping_address.line2 && <div>{order.shipping_address.line2}</div>}
            <div>
              {order.shipping_address.city}, {order.shipping_address.state} {order.shipping_address.zip}
            </div>
            <div>{order.shipping_address.country}</div>
          </div>
        </div>
      )}
    </div>
  );
}

const thStyle: React.CSSProperties = {
  padding: '0.6rem 0.75rem', textAlign: 'left', fontSize: '0.75rem',
  fontWeight: 600, color: '#64748b', textTransform: 'uppercase',
};

const tdStyle: React.CSSProperties = {
  padding: '0.6rem 0.75rem', verticalAlign: 'middle',
};
