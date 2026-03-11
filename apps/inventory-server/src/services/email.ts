/**
 * Email service using Resend
 * https://resend.com/docs/send-with-nodejs
 */

import { Resend } from 'resend';

let _resend: Resend | null = null;

function getResend(): Resend {
  if (!_resend) {
    const key = process.env.RESEND_API_KEY;
    if (!key) throw new Error('RESEND_API_KEY is not set');
    _resend = new Resend(key);
  }
  return _resend;
}

const FROM = process.env.EMAIL_FROM ?? 'orders@gadnuc.io';

// ── Order confirmation ─────────────────────────────────────────────────────
export interface OrderConfirmationParams {
  to:            string;
  orderNumber:   string;
  totalCents:    number;
  items:         Array<{ name: string; quantity: number; unitPriceCents: number }>;
  tenantSlug:    string;
}

export async function sendOrderConfirmation(params: OrderConfirmationParams): Promise<void> {
  const { to, orderNumber, totalCents, items, tenantSlug } = params;

  const itemRows = items
    .map(
      (i) =>
        `<tr>
          <td style="padding:8px 12px;border-bottom:1px solid #eee">${escapeHtml(i.name)}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:center">${i.quantity}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right">$${formatCents(i.unitPriceCents)}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:right">$${formatCents(i.unitPriceCents * i.quantity)}</td>
        </tr>`,
    )
    .join('');

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"/><title>Order Confirmation</title></head>
<body style="font-family:sans-serif;color:#111;max-width:600px;margin:0 auto;padding:24px">
  <h2 style="color:#0070f3">Order Confirmed!</h2>
  <p>Thank you for your order. Here is your summary:</p>

  <p><strong>Order #:</strong> ${escapeHtml(orderNumber)}</p>

  <table style="width:100%;border-collapse:collapse;margin:16px 0">
    <thead>
      <tr style="background:#f5f5f5">
        <th style="padding:8px 12px;text-align:left">Item</th>
        <th style="padding:8px 12px;text-align:center">Qty</th>
        <th style="padding:8px 12px;text-align:right">Unit Price</th>
        <th style="padding:8px 12px;text-align:right">Subtotal</th>
      </tr>
    </thead>
    <tbody>${itemRows}</tbody>
    <tfoot>
      <tr>
        <td colspan="3" style="padding:8px 12px;font-weight:bold;text-align:right">Total</td>
        <td style="padding:8px 12px;font-weight:bold;text-align:right">$${formatCents(totalCents)}</td>
      </tr>
    </tfoot>
  </table>

  <p>You can check your order status at any time on our website.</p>

  <hr style="margin:24px 0;border:none;border-top:1px solid #eee"/>
  <p style="color:#888;font-size:12px">This email was sent by Gadnuc for ${escapeHtml(tenantSlug)}.</p>
</body>
</html>`;

  const resend = getResend();
  await resend.emails.send({
    from:    FROM,
    to,
    subject: `Order Confirmed — ${orderNumber}`,
    html,
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatCents(cents: number): string {
  return (cents / 100).toFixed(2);
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
