// =============================================================================
// reminder.mjs — Scheduled reminder Lambda handler
// =============================================================================
// This runs on a daily schedule via EventBridge (like a cloud cron job).
// It queries upcoming sessions and sends push notifications:
//   - 2 days before: "Session in 2 days"
//   - Day of: "Session today!"
//
// EventBridge triggers this Lambda once daily (e.g., 9:00 AM UTC).
// It's a separate entry point from the API handler (index.mjs).
// =============================================================================

import { db } from './lib/db.mjs';
import { notifyAll } from './lib/push.mjs';

const TABLE_SESSIONS = process.env.TABLE_SESSIONS;

// Format a Date object as "YYYY-MM-DD"
function toDateString(date) {
  return date.toISOString().split('T')[0];
}

export const handler = async () => {
  const today = new Date();
  const todayStr = toDateString(today);

  // Calculate 2 days from now
  const twoDaysOut = new Date(today);
  twoDaysOut.setUTCDate(twoDaysOut.getUTCDate() + 2);
  const twoDaysStr = toDateString(twoDaysOut);

  // Query sessions using the date-index GSI.
  // We look for sessions on today's date and 2 days from now.
  const result = await db.query({
    TableName: TABLE_SESSIONS,
    IndexName: 'date-index',
    KeyConditionExpression: '#type = :type AND confirmedDate BETWEEN :start AND :end',
    ExpressionAttributeNames: { '#type': 'type' },
    ExpressionAttributeValues: {
      ':type': 'SESSION',
      ':start': todayStr,
      ':end': twoDaysStr,
    },
  });

  const sessions = result.Items || [];
  const notifications = [];

  for (const session of sessions) {
    if (session.confirmedDate === todayStr) {
      notifications.push(
        notifyAll(
          'Session Today!',
          `${session.title} is today!`,
          { tag: `reminder-${session.sessionId}`, url: `/sessions/${session.sessionId}` }
        )
      );
    } else if (session.confirmedDate === twoDaysStr) {
      notifications.push(
        notifyAll(
          'Session in 2 Days',
          `${session.title} is coming up on ${session.confirmedDate}`,
          { tag: `reminder-${session.sessionId}`, url: `/sessions/${session.sessionId}` }
        )
      );
    }
  }

  await Promise.allSettled(notifications);

  console.log(`Processed ${sessions.length} sessions, sent ${notifications.length} reminders`);

  return { statusCode: 200, body: { reminders: notifications.length } };
};
