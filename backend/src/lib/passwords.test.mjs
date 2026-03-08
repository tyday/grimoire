import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, verifyPassword } from './passwords.mjs';

describe('hashPassword', () => {
  it('returns a bcrypt hash string', async () => {
    const hash = await hashPassword('my-password');
    assert.equal(typeof hash, 'string');
    assert.ok(hash.startsWith('$2a$') || hash.startsWith('$2b$'), 'should be a bcrypt hash');
    assert.ok(hash.length >= 59, 'bcrypt hashes are at least 59 chars');
  });

  it('produces different hashes for the same input (random salt)', async () => {
    const hash1 = await hashPassword('same-password');
    const hash2 = await hashPassword('same-password');
    assert.notEqual(hash1, hash2);
  });
});

describe('verifyPassword', () => {
  it('returns true for matching password', async () => {
    const hash = await hashPassword('correct-horse-battery-staple');
    const result = await verifyPassword('correct-horse-battery-staple', hash);
    assert.equal(result, true);
  });

  it('returns false for wrong password', async () => {
    const hash = await hashPassword('correct-password');
    const result = await verifyPassword('wrong-password', hash);
    assert.equal(result, false);
  });
});
