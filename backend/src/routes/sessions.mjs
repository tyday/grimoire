// =============================================================================
// sessions.mjs — Session routes
// =============================================================================
// Endpoints:
//   GET    /sessions              - List upcoming and recent sessions
//   GET    /sessions/:sessionId   - Get a single session
//   GET    /sessions/:sessionId/ics - Download .ics calendar file
//
// Sessions are created by the poll confirmation flow (see polls.mjs).
// These routes provide read access and calendar export.
// =============================================================================

import { db } from '../lib/db.mjs';
import { authenticate } from '../lib/auth.mjs';
import { generateICS } from '../lib/ics.mjs';

const TABLE_SESSIONS = process.env.TABLE_SESSIONS;

async function requireAuth(event) {
  const user = await authenticate(event);
  if (!user) {
    return { error: { statusCode: 401, body: { error: 'Authentication required' } } };
  }
  return { user };
}

// ============================================================================
// GET /sessions — List upcoming and recent sessions
// ============================================================================
// Uses the date-index GSI to query sessions sorted by confirmedDate.
// Returns all sessions with type "SESSION" (our fixed partition key),
// sorted chronologically.
// ============================================================================
async function listSessions(event) {
  const { user, error } = await requireAuth(event);
  if (error) return error;

  // Check for campaignId query parameter
  const campaignId = event.queryStringParameters?.campaignId;

  let result;

  if (campaignId) {
    // Use the campaign-date-index GSI to get sessions for a specific campaign,
    // sorted by confirmedDate ascending.
    result = await db.query({
      TableName: TABLE_SESSIONS,
      IndexName: 'campaign-date-index',
      KeyConditionExpression: 'campaignId = :cid',
      ExpressionAttributeValues: { ':cid': campaignId },
      ScanIndexForward: true,
    });
  } else {
    // No campaign filter — return all sessions (legacy behavior)
    result = await db.query({
      TableName: TABLE_SESSIONS,
      IndexName: 'date-index',
      KeyConditionExpression: '#type = :type',
      ExpressionAttributeNames: { '#type': 'type' },
      ExpressionAttributeValues: { ':type': 'SESSION' },
      ScanIndexForward: true,
    });
  }

  return { body: { sessions: result.Items || [] } };
}

// ============================================================================
// GET /sessions/:sessionId — Get a single session
// ============================================================================
async function getSession(event) {
  const { user, error } = await requireAuth(event);
  if (error) return error;

  const { sessionId } = event.pathParams;

  const result = await db.get({
    TableName: TABLE_SESSIONS,
    Key: { sessionId },
  });

  if (!result.Item) {
    return { statusCode: 404, body: { error: 'Session not found' } };
  }

  return { body: result.Item };
}

// ============================================================================
// GET /sessions/:sessionId/ics — Download .ics calendar file
// ============================================================================
// Generates an iCalendar (.ics) file for the confirmed session.
// This is the standard format supported by Apple Calendar, Google Calendar,
// Outlook, and basically every calendar app.
//
// The response uses Content-Disposition to trigger a file download.
// ============================================================================
async function getSessionICS(event) {
  const { user, error } = await requireAuth(event);
  if (error) return error;

  const { sessionId } = event.pathParams;

  const result = await db.get({
    TableName: TABLE_SESSIONS,
    Key: { sessionId },
  });

  if (!result.Item) {
    return { statusCode: 404, body: { error: 'Session not found' } };
  }

  const session = result.Item;
  const icsContent = generateICS(session);

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="grimoire-${session.confirmedDate}.ics"`,
    },
    body: icsContent,
  };
}

export const sessionRoutes = [
  ['GET', '/sessions', listSessions],
  ['GET', '/sessions/:sessionId', getSession],
  ['GET', '/sessions/:sessionId/ics', getSessionICS],
];
