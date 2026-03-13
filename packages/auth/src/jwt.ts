import { SignJWT, jwtVerify, type JWTPayload } from 'jose';

export interface JwtPayload extends JWTPayload {
  sub: string;         // user ID
  tenantId: string;    // tenant UUID
  tenantSlug: string;  // tenant slug (for schema routing)
  role: string;        // user role within this tenant
  email: string;
  isWholesale?: boolean; // customer wholesale flag
}

export interface AuthUser {
  userId: string;
  tenantId: string;
  tenantSlug: string;
  role: string;
  email: string;
  isWholesale?: boolean;
}

function getSecret(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('JWT_SECRET env var must be set and at least 32 characters long');
  }
  return new TextEncoder().encode(secret);
}

const ACCESS_TOKEN_TTL  = '15m';
const REFRESH_TOKEN_TTL = '30d';

export async function signAccessToken(
  payload: Omit<JwtPayload, 'iat' | 'exp'>,
  ttl: string = ACCESS_TOKEN_TTL,
): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(ttl)
    .setIssuer('gadnuc')
    .setAudience('gadnuc-api')
    .sign(getSecret());
}

export async function signRefreshToken(
  userId: string,
  tenantId: string
): Promise<string> {
  return new SignJWT({ sub: userId, tenantId, type: 'refresh' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(REFRESH_TOKEN_TTL)
    .setIssuer('gadnuc')
    .sign(getSecret());
}

export async function verifyAccessToken(token: string): Promise<JwtPayload> {
  const { payload } = await jwtVerify(token, getSecret(), {
    issuer: 'gadnuc',
    audience: 'gadnuc-api',
  });
  return payload as JwtPayload;
}
