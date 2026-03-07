// =============================================================================
// auth.mjs — Authentication routes
// =============================================================================
// Endpoints:
//   POST /auth/login          - Log in with email + password
//   POST /auth/refresh        - Exchange refresh token for new access token
//   POST /auth/logout         - Revoke the current refresh token
//   POST /admin/create-user   - Create a new user account (admin only)
//
// Password reset (via SES) will be added in a follow-up.
// =============================================================================

import { db } from '../lib/db.mjs';
import { createAccessToken, generateRefreshToken, hashToken, refreshTokenExpiresAt, authenticate } from '../lib/auth.mjs';
import { hashPassword, verifyPassword } from '../lib/passwords.mjs';
import { randomUUID } from 'node:crypto';
import { ScanCommand } from '@aws-sdk/lib-dynamodb';
import { docClient } from '../lib/db.mjs';

const TABLE_USERS = process.env.TABLE_USERS;
const TABLE_REFRESH_TOKENS = process.env.TABLE_REFRESH_TOKENS;

// Helper to parse JSON body from API Gateway event
function parseBody(event) {
  if (!event.body) return {};
  try {
    // API Gateway may base64-encode the body
    const raw = event.isBase64Encoded
      ? Buffer.from(event.body, 'base64').toString()
      : event.body;
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

// Helper to extract refresh token from cookies.
// Cookie format: "userId:refreshToken" — we embed the userId so we can
// look up the token by (userId, tokenHash) composite key in DynamoDB
// without needing a scan or GSI.
function getRefreshTokenFromCookies(event) {
  // API Gateway v2 puts cookies in an array
  const cookies = event.cookies || [];
  for (const cookie of cookies) {
    if (cookie.startsWith('refreshToken=')) {
      return cookie.split('=')[1].split(';')[0];
    }
  }
  return null;
}

// Build a Set-Cookie header for the refresh token
function refreshTokenCookie(token, maxAge) {
  return `refreshToken=${token}; HttpOnly; Secure; SameSite=Strict; Path=/auth/refresh; Max-Age=${maxAge}`;
}

// Parse the "userId:rawToken" cookie value into its parts
function parseCookieValue(cookieValue) {
  if (!cookieValue) return null;
  const separatorIndex = cookieValue.indexOf(':');
  if (separatorIndex === -1) return null;
  return {
    userId: cookieValue.slice(0, separatorIndex),
    rawToken: cookieValue.slice(separatorIndex + 1),
  };
}

// ============================================================================
// POST /auth/login
// ============================================================================
// 1. Look up user by email (using the GSI)
// 2. Verify password against stored bcrypt hash
// 3. Create access token + refresh token
// 4. Store hashed refresh token in DynamoDB
// 5. Return access token in body, refresh token in httpOnly cookie
// ============================================================================
async function login(event) {
  const { email, password } = parseBody(event);

  if (!email || !password) {
    return { statusCode: 400, body: { error: 'Email and password are required' } };
  }

  // Look up user by email using the GSI
  const result = await db.query({
    TableName: TABLE_USERS,
    IndexName: 'email-index',
    KeyConditionExpression: 'email = :email',
    ExpressionAttributeValues: { ':email': email },
  });

  const user = result.Items?.[0];
  if (!user) {
    // Don't reveal whether the email exists — same error for bad email or bad password
    return { statusCode: 401, body: { error: 'Invalid email or password' } };
  }

  const passwordValid = await verifyPassword(password, user.passwordHash);
  if (!passwordValid) {
    return { statusCode: 401, body: { error: 'Invalid email or password' } };
  }

  // Create tokens
  const accessToken = await createAccessToken(user.userId, user.email);
  const refreshToken = generateRefreshToken();
  const tokenHash = hashToken(refreshToken);

  // Store hashed refresh token in DynamoDB
  await db.put({
    TableName: TABLE_REFRESH_TOKENS,
    Item: {
      userId: user.userId,
      tokenHash,
      expiresAt: refreshTokenExpiresAt(),
      createdAt: new Date().toISOString(),
    },
  });

  return {
    statusCode: 200,
    body: {
      accessToken,
      user: { userId: user.userId, email: user.email, name: user.name },
    },
    // httpOnly cookie — JavaScript can't read this, only sent to /auth/refresh
    cookies: [refreshTokenCookie(`${user.userId}:${refreshToken}`, 30 * 24 * 60 * 60)],
  };
}

// ============================================================================
// POST /auth/refresh
// ============================================================================
// 1. Read refresh token from httpOnly cookie
// 2. Hash it and look it up in DynamoDB
// 3. If valid, issue a new access token
// 4. Rotate the refresh token (delete old, create new) for security
//
// Token rotation means if a refresh token is stolen and used, the legitimate
// user's next refresh will fail (the old token was deleted), alerting them.
// ============================================================================
async function refresh(event) {
  const parsed = parseCookieValue(getRefreshTokenFromCookies(event));
  if (!parsed) {
    return { statusCode: 401, body: { error: 'No refresh token' } };
  }

  const { userId, rawToken } = parsed;
  const tokenHash = hashToken(rawToken);

  // Look up the hashed token in DynamoDB
  const result = await db.get({
    TableName: TABLE_REFRESH_TOKENS,
    Key: { userId, tokenHash },
  });

  if (!result.Item) {
    return { statusCode: 401, body: { error: 'Invalid or expired refresh token' } };
  }

  // Look up the user to get their email for the new access token
  const userResult = await db.get({
    TableName: TABLE_USERS,
    Key: { userId },
  });

  if (!userResult.Item) {
    return { statusCode: 401, body: { error: 'User not found' } };
  }

  // Token rotation: delete old token, create new one
  const newRefreshToken = generateRefreshToken();
  const newTokenHash = hashToken(newRefreshToken);

  await db.delete({
    TableName: TABLE_REFRESH_TOKENS,
    Key: { userId, tokenHash },
  });

  await db.put({
    TableName: TABLE_REFRESH_TOKENS,
    Item: {
      userId,
      tokenHash: newTokenHash,
      expiresAt: refreshTokenExpiresAt(),
      createdAt: new Date().toISOString(),
    },
  });

  const accessToken = await createAccessToken(userId, userResult.Item.email);

  return {
    statusCode: 200,
    body: { accessToken },
    cookies: [refreshTokenCookie(`${userId}:${newRefreshToken}`, 30 * 24 * 60 * 60)],
  };
}

// ============================================================================
// POST /auth/logout
// ============================================================================
// Delete the refresh token from DynamoDB and clear the cookie.
// ============================================================================
async function logout(event) {
  const parsed = parseCookieValue(getRefreshTokenFromCookies(event));
  if (parsed) {
    const { userId, rawToken } = parsed;
    const tokenHash = hashToken(rawToken);

    await db.delete({
      TableName: TABLE_REFRESH_TOKENS,
      Key: { userId, tokenHash },
    }).catch(() => {}); // Ignore errors — logging out should always succeed
  }

  return {
    statusCode: 200,
    body: { message: 'Logged out' },
    // Clear the cookie by setting Max-Age=0
    cookies: [refreshTokenCookie('', 0)],
  };
}

// ============================================================================
// POST /admin/create-user
// ============================================================================
// Creates a new user account. Only callable by an authenticated user.
//
// Bootstrap mode: if NO users exist in the table yet, the first call is
// allowed without authentication. This solves the chicken-and-egg problem
// of creating the first admin account.
// ============================================================================
async function createUser(event) {
  const { email, password, name } = parseBody(event);

  if (!email || !password || !name) {
    return { statusCode: 400, body: { error: 'Email, password, and name are required' } };
  }

  const caller = await authenticate(event);

  if (!caller) {
    // No valid auth token — check if this is a bootstrap (no users exist)
    const scanResult = await docClient.send(new ScanCommand({
      TableName: TABLE_USERS,
      Limit: 1,
      Select: 'COUNT',
    }));

    if (scanResult.Count > 0) {
      return { statusCode: 401, body: { error: 'Authentication required' } };
    }
    // No users exist — allow bootstrap
  }

  // Check if email already exists
  const existing = await db.query({
    TableName: TABLE_USERS,
    IndexName: 'email-index',
    KeyConditionExpression: 'email = :email',
    ExpressionAttributeValues: { ':email': email },
  });

  if (existing.Items?.length > 0) {
    return { statusCode: 409, body: { error: 'Email already registered' } };
  }

  const userId = randomUUID();
  const passwordHash = await hashPassword(password);

  await db.put({
    TableName: TABLE_USERS,
    Item: {
      userId,
      email,
      name,
      passwordHash,
      createdAt: new Date().toISOString(),
    },
  });

  return {
    statusCode: 201,
    body: { userId, email, name },
  };
}

// Export route map
export const authRoutes = {
  'POST /auth/login': login,
  'POST /auth/refresh': refresh,
  'POST /auth/logout': logout,
  'POST /admin/create-user': createUser,
};
