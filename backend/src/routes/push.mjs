// =============================================================================
// push.mjs — Push subscription management routes
// =============================================================================
// Endpoints:
//   GET    /push/vapid-key   - Get the VAPID public key (frontend needs this)
//   POST   /push/subscribe   - Register a push subscription
//   DELETE /push/subscribe   - Remove a push subscription
// =============================================================================

import { db } from '../lib/db.mjs';
import { authenticate } from '../lib/auth.mjs';
import { notifyUser } from '../lib/push.mjs';

const TABLE_PUSH_SUBS = process.env.TABLE_PUSH_SUBS;
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;

function parseBody(event) {
  if (!event.body) return {};
  try {
    const raw = event.isBase64Encoded
      ? Buffer.from(event.body, 'base64').toString()
      : event.body;
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

// ============================================================================
// GET /push/vapid-key
// ============================================================================
// The frontend needs the VAPID public key to subscribe to push notifications.
// This is NOT a secret — it's meant to be shared with clients.
// ============================================================================
async function getVapidKey() {
  return {
    body: { publicKey: VAPID_PUBLIC_KEY || null },
  };
}

// ============================================================================
// POST /push/subscribe
// ============================================================================
// Body: the PushSubscription object from the browser's Push API:
//   {
//     "endpoint": "https://fcm.googleapis.com/fcm/send/...",
//     "keys": {
//       "p256dh": "...",
//       "auth": "..."
//     }
//   }
//
// Each user can have multiple subscriptions (one per device/browser).
// The endpoint URL uniquely identifies a subscription.
// ============================================================================
async function subscribe(event) {
  const user = await authenticate(event);
  if (!user) {
    return { statusCode: 401, body: { error: 'Authentication required' } };
  }

  const { endpoint, keys } = parseBody(event);

  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return { statusCode: 400, body: { error: 'Invalid push subscription' } };
  }

  await db.put({
    TableName: TABLE_PUSH_SUBS,
    Item: {
      userId: user.sub,
      endpoint,
      keys,
      createdAt: new Date().toISOString(),
    },
  });

  return { statusCode: 201, body: { message: 'Subscribed' } };
}

// ============================================================================
// DELETE /push/subscribe
// ============================================================================
// Body: { "endpoint": "https://..." }
// Removes a specific subscription (e.g., when user disables notifications).
// ============================================================================
async function unsubscribe(event) {
  const user = await authenticate(event);
  if (!user) {
    return { statusCode: 401, body: { error: 'Authentication required' } };
  }

  const { endpoint } = parseBody(event);
  if (!endpoint) {
    return { statusCode: 400, body: { error: 'Endpoint is required' } };
  }

  await db.delete({
    TableName: TABLE_PUSH_SUBS,
    Key: { userId: user.sub, endpoint },
  });

  return { body: { message: 'Unsubscribed' } };
}

// ============================================================================
// POST /admin/test-notification — Send a test push to yourself
// ============================================================================
async function testNotification(event) {
  const user = await authenticate(event);
  if (!user) {
    return { statusCode: 401, body: { error: 'Authentication required' } };
  }

  await notifyUser(user.sub, 'Test Notification', 'If you see this, push notifications are working!');
  return { body: { message: 'Test notification sent' } };
}

export const pushRoutes = [
  ['GET', '/push/vapid-key', getVapidKey],
  ['POST', '/push/subscribe', subscribe],
  ['DELETE', '/push/subscribe', unsubscribe],
  ['POST', '/admin/test-notification', testNotification],
];
