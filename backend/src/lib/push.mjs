// =============================================================================
// push.mjs — Web Push notification helpers
// =============================================================================
// Web Push lets us send notifications to users' browsers/phones even when
// the app isn't open. It uses the VAPID (Voluntary Application Server
// Identification) protocol.
//
// How it works:
//   1. The frontend asks the browser for a push subscription (a URL + keys)
//   2. The frontend sends that subscription to our backend, we store it
//   3. When something happens (new poll, confirmed session), the backend
//      uses the `web-push` library to send a message to each subscription
//   4. The browser's service worker receives it and shows a notification
//
// VAPID keys: a public/private key pair that identifies our server to
// push services (Google, Mozilla, Apple). Generated once, used forever.
//   - Public key: shared with the frontend (used when subscribing)
//   - Private key: kept secret on the backend (used when sending)
// =============================================================================

import webpush from 'web-push';
import { db } from './db.mjs';
import { ScanCommand } from '@aws-sdk/lib-dynamodb';
import { docClient } from './db.mjs';

const TABLE_PUSH_SUBS = process.env.TABLE_PUSH_SUBS;
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:admin@grimoire.habernashing.com';

// Configure web-push with our VAPID credentials
if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

// ---------------------------------------------------------------------------
// Send a push notification to all subscribed users
// ---------------------------------------------------------------------------
// We fetch all subscriptions from DynamoDB and send to each one.
// If a subscription fails with a 410 (Gone) status, the browser has
// unsubscribed — we delete it from the database.
//
// For ~6 users with maybe 2 devices each, this is ~12 pushes max.
// No need for batching or queuing at this scale.
// ---------------------------------------------------------------------------
export async function notifyAll(title, body, options = {}) {
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    console.warn('VAPID keys not configured, skipping push notifications');
    return;
  }

  // Scan all push subscriptions (fine for a small table)
  const result = await docClient.send(new ScanCommand({
    TableName: TABLE_PUSH_SUBS,
  }));

  const subscriptions = result.Items || [];
  if (subscriptions.length === 0) return;

  const payload = JSON.stringify({
    title,
    body,
    ...options,
  });

  const results = await Promise.allSettled(
    subscriptions.map(async (sub) => {
      try {
        // The subscription object needs the exact shape web-push expects
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: sub.keys,
          },
          payload,
        );
      } catch (err) {
        // 410 Gone = browser unsubscribed, 404 = subscription expired
        if (err.statusCode === 410 || err.statusCode === 404) {
          console.log(`Removing stale subscription for user ${sub.userId}`);
          await db.delete({
            TableName: TABLE_PUSH_SUBS,
            Key: { userId: sub.userId, endpoint: sub.endpoint },
          }).catch(() => {});
        } else {
          console.error(`Push failed for user ${sub.userId}:`, err.message);
        }
      }
    }),
  );

  const sent = results.filter((r) => r.status === 'fulfilled').length;
  console.log(`Push notifications: ${sent}/${subscriptions.length} sent`);
}

// ---------------------------------------------------------------------------
// Send a notification to a specific user (all their devices)
// ---------------------------------------------------------------------------
export async function notifyUser(userId, title, body, options = {}) {
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    console.warn('VAPID keys not configured, skipping push notifications');
    return;
  }

  // Query subscriptions for this specific user
  const result = await db.query({
    TableName: TABLE_PUSH_SUBS,
    KeyConditionExpression: 'userId = :userId',
    ExpressionAttributeValues: { ':userId': userId },
  });

  const subscriptions = result.Items || [];
  if (subscriptions.length === 0) return;

  const payload = JSON.stringify({ title, body, ...options });

  await Promise.allSettled(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: sub.keys },
          payload,
        );
      } catch (err) {
        if (err.statusCode === 410 || err.statusCode === 404) {
          await db.delete({
            TableName: TABLE_PUSH_SUBS,
            Key: { userId: sub.userId, endpoint: sub.endpoint },
          }).catch(() => {});
        }
      }
    }),
  );
}

// ---------------------------------------------------------------------------
// Send a notification to all users EXCEPT a specific one
// ---------------------------------------------------------------------------
// Used when a user creates a poll — they don't need to be notified about
// their own action.
// ---------------------------------------------------------------------------
export async function notifyAllExcept(excludeUserId, title, body, options = {}) {
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    console.warn('VAPID keys not configured, skipping push notifications');
    return;
  }

  const result = await docClient.send(new ScanCommand({
    TableName: TABLE_PUSH_SUBS,
  }));

  const subscriptions = (result.Items || []).filter((s) => s.userId !== excludeUserId);
  if (subscriptions.length === 0) return;

  const payload = JSON.stringify({ title, body, ...options });

  await Promise.allSettled(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: sub.keys },
          payload,
        );
      } catch (err) {
        if (err.statusCode === 410 || err.statusCode === 404) {
          await db.delete({
            TableName: TABLE_PUSH_SUBS,
            Key: { userId: sub.userId, endpoint: sub.endpoint },
          }).catch(() => {});
        }
      }
    }),
  );
}
