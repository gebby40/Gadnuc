import { authenticator } from 'otplib';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

// ── Encryption helpers ────────────────────────────────────────────────────────

function getEncryptionKey(): Buffer {
  const raw = process.env.TOTP_ENCRYPTION_KEY;
  if (!raw) throw new Error('TOTP_ENCRYPTION_KEY env var is not set');
  // SHA-256 hash gives us a stable 32-byte key regardless of input length
  return createHash('sha256').update(raw).digest();
}

/**
 * Encrypt a TOTP secret for storage.
 * Format: `<iv_hex>:<authTag_hex>:<ciphertext_hex>`
 */
export function encryptTotpSecret(secret: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(12); // 96-bit IV for GCM
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv.toString('hex'), authTag.toString('hex'), ciphertext.toString('hex')].join(':');
}

/**
 * Decrypt a TOTP secret retrieved from storage.
 */
export function decryptTotpSecret(encrypted: string): string {
  const [ivHex, authTagHex, ciphertextHex] = encrypted.split(':');
  if (!ivHex || !authTagHex || !ciphertextHex) {
    throw new Error('Invalid encrypted TOTP secret format');
  }
  const key = getEncryptionKey();
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ciphertextHex, 'hex')),
    decipher.final(),
  ]);
  return plaintext.toString('utf8');
}

// ── TOTP helpers ──────────────────────────────────────────────────────────────

authenticator.options = {
  window: 1, // accept one step before/after for clock skew
};

/**
 * Generate a new TOTP secret (base-32 encoded, 20 bytes).
 */
export function generateTotpSecret(): string {
  return authenticator.generateSecret(20);
}

/**
 * Build the `otpauth://` URI for QR code generation.
 */
export function getTotpQrUri(secret: string, accountName: string, issuer = 'Gadnuc'): string {
  return authenticator.keyuri(accountName, issuer, secret);
}

/**
 * Verify a 6-digit TOTP token against a *plaintext* secret.
 * Decrypt before calling this function.
 */
export function verifyTotpToken(token: string, secret: string): boolean {
  try {
    return authenticator.verify({ token, secret });
  } catch {
    return false;
  }
}
