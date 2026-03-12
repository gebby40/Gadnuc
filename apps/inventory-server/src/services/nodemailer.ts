/**
 * Email service using Nodemailer (SMTP).
 *
 * Supports any SMTP provider (Mailgun, SES, Postfix, etc.)
 * via standard SMTP configuration.
 *
 * Environment variables:
 *   SMTP_HOST       — SMTP server hostname (e.g. smtp.mailgun.org)
 *   SMTP_PORT       — SMTP port (default: 587)
 *   SMTP_SECURE     — Use TLS (default: false; STARTTLS used on port 587)
 *   SMTP_USER       — SMTP auth username
 *   SMTP_PASS       — SMTP auth password
 *   EMAIL_FROM      — Default From address (e.g. orders@gadnuc.com)
 */

import { createTransport, type Transporter } from 'nodemailer';

let _transporter: Transporter | null = null;

function getTransporter(): Transporter {
  if (!_transporter) {
    const host = process.env.SMTP_HOST;
    if (!host) throw new Error('SMTP_HOST is not set');

    _transporter = createTransport({
      host,
      port:   parseInt(process.env.SMTP_PORT ?? '587', 10),
      secure: process.env.SMTP_SECURE === 'true',
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS ?? '' }
        : undefined,
    });
  }
  return _transporter;
}

const FROM = process.env.EMAIL_FROM ?? 'orders@gadnuc.com';

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

// ── Order confirmation ─────────────────────────────────────────────────────

export interface OrderConfirmationParams {
  to:          string;
  orderNumber: string;
  totalCents:  number;
  items:       Array<{ name: string; quantity: number; unitPriceCents: number }>;
  tenantSlug:  string;
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

  const transporter = getTransporter();
  await transporter.sendMail({
    from:    FROM,
    to,
    subject: `Order Confirmed — ${orderNumber}`,
    html,
  });
}

// ── Welcome email ──────────────────────────────────────────────────────────

export interface WelcomeEmailParams {
  to:          string;
  displayName: string;
  tenantSlug:  string;
  loginUrl:    string;
}

export async function sendWelcomeEmail(params: WelcomeEmailParams): Promise<void> {
  const { to, displayName, tenantSlug, loginUrl } = params;

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"/><title>Welcome</title></head>
<body style="font-family:sans-serif;color:#111;max-width:600px;margin:0 auto;padding:24px">
  <h2 style="color:#0070f3">Welcome to Gadnuc, ${escapeHtml(displayName)}!</h2>
  <p>Your account has been created for <strong>${escapeHtml(tenantSlug)}</strong>.</p>
  <p>
    <a href="${escapeHtml(loginUrl)}"
       style="display:inline-block;padding:12px 24px;background:#0070f3;color:#fff;text-decoration:none;border-radius:6px">
      Log In
    </a>
  </p>
  <p style="color:#888;font-size:12px">If you didn't request this account, you can safely ignore this email.</p>
</body>
</html>`;

  const transporter = getTransporter();
  await transporter.sendMail({
    from:    FROM,
    to,
    subject: `Welcome to ${tenantSlug} on Gadnuc`,
    html,
  });
}

// ── Order status update ────────────────────────────────────────────────────

export interface OrderStatusEmailParams {
  to:          string;
  orderNumber: string;
  oldStatus:   string;
  newStatus:   string;
  tenantSlug:  string;
}

export async function sendOrderStatusEmail(params: OrderStatusEmailParams): Promise<void> {
  const { to, orderNumber, oldStatus, newStatus, tenantSlug } = params;

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"/><title>Order Update</title></head>
<body style="font-family:sans-serif;color:#111;max-width:600px;margin:0 auto;padding:24px">
  <h2 style="color:#0070f3">Order #${escapeHtml(orderNumber)} Updated</h2>
  <p>Your order status has changed:</p>
  <p style="font-size:18px">
    <span style="color:#888">${escapeHtml(oldStatus)}</span>
    &rarr;
    <strong style="color:#0070f3">${escapeHtml(newStatus)}</strong>
  </p>
  <hr style="margin:24px 0;border:none;border-top:1px solid #eee"/>
  <p style="color:#888;font-size:12px">This email was sent by Gadnuc for ${escapeHtml(tenantSlug)}.</p>
</body>
</html>`;

  const transporter = getTransporter();
  await transporter.sendMail({
    from:    FROM,
    to,
    subject: `Order #${orderNumber} — ${newStatus}`,
    html,
  });
}
