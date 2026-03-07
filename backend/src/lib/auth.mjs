// =============================================================================
// auth.mjs — JWT token creation and validation
// =============================================================================
// We use the `jose` library for all JWT operations. It's a well-maintained,
// standards-compliant library that handles the crypto correctly — much safer
// than hand-rolling token creation.
//
// Token strategy:
//   - Access token: short-lived (15 min), sent in Authorization header
//     Stateless — we validate it using the secret key without hitting the DB
//   - Refresh token: long-lived (30 days), sent as httpOnly cookie
//     Stored hashed in DynamoDB so it can be revoked (e.g., "log out everywhere")
//
// Why two tokens?
//   If someone steals an access token, it expires in 15 minutes.
//   The refresh token is httpOnly (JavaScript can't read it) and only sent
//   to the /auth/refresh endpoint, minimizing exposure.
// =============================================================================

import { SignJWT, jwtVerify } from 'jose';
import { createHash, randomBytes } from 'node:crypto';

// The JWT secret key. In production, this should come from AWS Secrets Manager
// or Parameter Store. For now, it's an environment variable set in Lambda config.
// IMPORTANT: This must be at least 256 bits (32 bytes) for HS256.
const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET || 'grimoire-dev-secret-change-me-in-prod');

const ACCESS_TOKEN_EXPIRY = '15m';
const REFRESH_TOKEN_EXPIRY = '30d';

// ---------------------------------------------------------------------------
// Access tokens
// ---------------------------------------------------------------------------

export async function createAccessToken(userId, email) {
  return new SignJWT({ email })
    .setProtectedHeader({ alg: 'HS256' })  // HMAC-SHA256 signing algorithm
    .setSubject(userId)                      // `sub` claim = who this token is for
    .setIssuedAt()                           // `iat` claim = when it was created
    .setExpirationTime(ACCESS_TOKEN_EXPIRY)  // `exp` claim = when it expires
    .setIssuer('grimoire')                   // `iss` claim = who created it
    .sign(JWT_SECRET);
}

export async function verifyAccessToken(token) {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET, {
      issuer: 'grimoire',  // Reject tokens from other issuers
    });
    return payload; // { sub: userId, email, iat, exp, iss }
  } catch {
    return null; // Token is invalid, expired, or tampered with
  }
}

// ---------------------------------------------------------------------------
// Refresh tokens
// ---------------------------------------------------------------------------
// Refresh tokens are random strings, not JWTs. We store a hash of the token
// in DynamoDB (never the raw token). When a client presents a refresh token,
// we hash it and look up the hash in the DB.
//
// Why hash? If the database is compromised, the attacker gets hashes — they
// can't use those to generate valid refresh tokens.
// ---------------------------------------------------------------------------

export function generateRefreshToken() {
  return randomBytes(32).toString('hex'); // 64-char hex string
}

export function hashToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

// Calculate expiry timestamp (Unix seconds) for DynamoDB TTL
export function refreshTokenExpiresAt() {
  return Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60; // 30 days from now
}

// ---------------------------------------------------------------------------
// Middleware helper: extract and verify the access token from a request
// ---------------------------------------------------------------------------
export async function authenticate(event) {
  const authHeader = event.headers?.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.slice(7); // Remove "Bearer " prefix
  return verifyAccessToken(token);
}
