// =============================================================================
// passwords.mjs — Password hashing with bcrypt
// =============================================================================
// bcrypt is a password hashing algorithm designed to be intentionally slow.
// This is a feature, not a bug — if an attacker gets your database, slow
// hashing means they can only try ~100 passwords per second instead of
// billions.
//
// We use bcryptjs (pure JavaScript implementation) instead of the native
// bcrypt package because:
//   - No native compilation needed (Lambda doesn't have build tools)
//   - Same security, just slightly slower (fine for ~6 users)
//
// Cost factor of 12 means 2^12 = 4096 iterations. Each hash takes ~250ms.
// =============================================================================

import bcrypt from 'bcryptjs';

const SALT_ROUNDS = 12;

export async function hashPassword(plaintext) {
  return bcrypt.hash(plaintext, SALT_ROUNDS);
}

export async function verifyPassword(plaintext, hash) {
  return bcrypt.compare(plaintext, hash);
}
