// =============================================================================
// sessions.mjs — Session and session notes routes
// =============================================================================
// Endpoints:
//   GET    /sessions                    - List upcoming and recent sessions
//   GET    /sessions/:sessionId         - Get a single session
//   GET    /sessions/:sessionId/ics     - Download .ics calendar file
//   GET    /sessions/:sessionId/notes   - List all notes for a session
//   PUT    /sessions/:sessionId/notes   - Create or update current user's note
//   DELETE /sessions/:sessionId/notes   - Delete current user's note
//
// Sessions are created by the poll confirmation flow (see polls.mjs).
// Notes are markdown documents — one per user per session.
// =============================================================================

import { db } from '../lib/db.mjs';
import { authenticate } from '../lib/auth.mjs';
import { generateICS } from '../lib/ics.mjs';
import { notifyAllExcept } from '../lib/push.mjs';

const TABLE_SESSIONS = process.env.TABLE_SESSIONS;
const TABLE_SESSION_NOTES = process.env.TABLE_SESSION_NOTES;
const TABLE_USERS = process.env.TABLE_USERS;

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

// ============================================================================
// GET /sessions/:sessionId/notes — List all notes for a session
// ============================================================================
async function listNotes(event) {
  const { user, error } = await requireAuth(event);
  if (error) return error;

  const { sessionId } = event.pathParams;

  const result = await db.query({
    TableName: TABLE_SESSION_NOTES,
    KeyConditionExpression: 'sessionId = :sid',
    ExpressionAttributeValues: { ':sid': sessionId },
  });

  return { body: { notes: result.Items || [] } };
}

// ============================================================================
// PUT /sessions/:sessionId/notes — Create or update the current user's note
// ============================================================================
// Body: { "content": "## Session recap\n\nWe fought a dragon..." }
//
// Each user gets one note per session. The noteId is derived from the user's
// ID so PutItem upserts cleanly — no need for separate create/update logic.
// ============================================================================
async function upsertNote(event) {
  const { user, error } = await requireAuth(event);
  if (error) return error;

  const { sessionId } = event.pathParams;
  const { content } = parseBody(event);

  if (!content || typeof content !== 'string') {
    return { statusCode: 400, body: { error: 'content is required' } };
  }

  // Cap at 50KB to stay well within DynamoDB's 400KB item limit
  if (content.length > 50_000) {
    return { statusCode: 400, body: { error: 'Note is too long (max 50KB)' } };
  }

  // Verify the session exists
  const sessionResult = await db.get({
    TableName: TABLE_SESSIONS,
    Key: { sessionId },
  });
  if (!sessionResult.Item) {
    return { statusCode: 404, body: { error: 'Session not found' } };
  }

  // Look up the user's name for denormalized display
  const userResult = await db.get({
    TableName: TABLE_USERS,
    Key: { userId: user.sub },
  });
  const userName = userResult.Item?.name || user.email;

  const now = new Date().toISOString();
  const noteId = `note_${user.sub}`;

  // Check if this is a new note (for push notification)
  const existing = await db.get({
    TableName: TABLE_SESSION_NOTES,
    Key: { sessionId, noteId },
  });
  const isNew = !existing.Item;

  const note = {
    sessionId,
    noteId,
    userId: user.sub,
    userName,
    content,
    createdAt: existing.Item?.createdAt || now,
    updatedAt: now,
  };

  await db.put({
    TableName: TABLE_SESSION_NOTES,
    Item: note,
  });

  // Only send push notification for new notes (not edits) to avoid spam
  if (isNew) {
    const session = sessionResult.Item;
    notifyAllExcept(
      user.sub,
      'New Session Notes',
      `${userName} posted notes for ${session.title}`,
    ).catch(console.error);
  }

  return { body: note };
}

// ============================================================================
// DELETE /sessions/:sessionId/notes — Delete the current user's note
// ============================================================================
async function deleteNote(event) {
  const { user, error } = await requireAuth(event);
  if (error) return error;

  const { sessionId } = event.pathParams;
  const noteId = `note_${user.sub}`;

  await db.delete({
    TableName: TABLE_SESSION_NOTES,
    Key: { sessionId, noteId },
  });

  return { body: { message: 'Note deleted' } };
}

export const sessionRoutes = [
  ['GET', '/sessions', listSessions],
  ['GET', '/sessions/:sessionId', getSession],
  ['GET', '/sessions/:sessionId/ics', getSessionICS],
  ['GET', '/sessions/:sessionId/notes', listNotes],
  ['PUT', '/sessions/:sessionId/notes', upsertNote],
  ['DELETE', '/sessions/:sessionId/notes', deleteNote],
];
