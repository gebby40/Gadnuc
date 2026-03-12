/**
 * Email service — re-exports from nodemailer implementation.
 *
 * The original Resend-based service has been replaced by Nodemailer (SMTP).
 * This module re-exports everything so existing imports continue to work.
 */

export {
  sendOrderConfirmation,
  sendWelcomeEmail,
  sendOrderStatusEmail,
  type OrderConfirmationParams,
  type WelcomeEmailParams,
  type OrderStatusEmailParams,
} from './nodemailer.js';
