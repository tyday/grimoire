import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';

// Set JWT_SECRET before importing auth module (it reads env at import time)
process.env.JWT_SECRET = 'test-secret-that-is-at-least-32-bytes-long';

const { createAccessToken, verifyAccessToken, authenticate, generateRefreshToken, hashToken, refreshTokenExpiresAt } = await import('./auth.mjs');

describe('createAccessToken + verifyAccessToken', () => {
  it('creates a valid token that can be verified', async () => {
    const token = await createAccessToken('user-123', 'test@example.com');
    assert.equal(typeof token, 'string');
    assert.ok(token.split('.').length === 3, 'should be a JWT with 3 parts');

    const payload = await verifyAccessToken(token);
    assert.ok(payload);
    assert.equal(payload.sub, 'user-123');
    assert.equal(payload.email, 'test@example.com');
    assert.equal(payload.iss, 'grimoire');
    assert.ok(payload.exp > payload.iat, 'exp should be after iat');
  });

  it('returns null for a tampered token', async () => {
    const token = await createAccessToken('user-123', 'test@example.com');
    const tampered = token.slice(0, -5) + 'XXXXX';
    const payload = await verifyAccessToken(tampered);
    assert.equal(payload, null);
  });

  it('returns null for garbage input', async () => {
    assert.equal(await verifyAccessToken('not-a-jwt'), null);
    assert.equal(await verifyAccessToken(''), null);
  });
});

describe('authenticate', () => {
  it('extracts and verifies a Bearer token from event headers', async () => {
    const token = await createAccessToken('user-456', 'admin@example.com');
    const event = { headers: { authorization: `Bearer ${token}` } };
    const payload = await authenticate(event);
    assert.ok(payload);
    assert.equal(payload.sub, 'user-456');
  });

  it('returns null when no authorization header', async () => {
    assert.equal(await authenticate({ headers: {} }), null);
    assert.equal(await authenticate({ headers: { authorization: '' } }), null);
  });

  it('returns null for non-Bearer scheme', async () => {
    const payload = await authenticate({ headers: { authorization: 'Basic abc123' } });
    assert.equal(payload, null);
  });

  it('returns null when headers is undefined', async () => {
    assert.equal(await authenticate({}), null);
  });
});

describe('generateRefreshToken', () => {
  it('returns a 64-char hex string', () => {
    const token = generateRefreshToken();
    assert.equal(typeof token, 'string');
    assert.equal(token.length, 64);
    assert.match(token, /^[0-9a-f]{64}$/);
  });

  it('generates unique tokens', () => {
    const a = generateRefreshToken();
    const b = generateRefreshToken();
    assert.notEqual(a, b);
  });
});

describe('hashToken', () => {
  it('returns a deterministic SHA-256 hex hash', () => {
    const hash = hashToken('my-token');
    assert.equal(typeof hash, 'string');
    assert.equal(hash.length, 64);
    // Same input should produce same hash
    assert.equal(hashToken('my-token'), hash);
  });

  it('different inputs produce different hashes', () => {
    assert.notEqual(hashToken('token-a'), hashToken('token-b'));
  });
});

describe('refreshTokenExpiresAt', () => {
  it('returns a Unix timestamp ~30 days from now', () => {
    const exp = refreshTokenExpiresAt();
    const now = Math.floor(Date.now() / 1000);
    const thirtyDays = 30 * 24 * 60 * 60;
    // Allow 5 seconds of drift
    assert.ok(Math.abs(exp - (now + thirtyDays)) < 5);
  });
});
