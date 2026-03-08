// =============================================================================
// polls.mjs — Scheduling poll routes
// =============================================================================
// Endpoints:
//   POST   /polls                    - Create a new scheduling poll
//   GET    /polls                    - List all polls
//   GET    /polls/:pollId            - Get a poll with all responses
//   POST   /polls/:pollId/respond    - Submit or update your availability
//   POST   /polls/:pollId/confirm    - Confirm a date (poll creator only)
//
// Poll modes:
//   "candidates" — Creator picks 2-5 specific dates, members vote yes/no
//   "open"       — Members submit date ranges, app finds overlap
//
// Poll statuses: "active" -> "confirmed" or "cancelled"
// =============================================================================

import { db } from '../lib/db.mjs';
import { authenticate } from '../lib/auth.mjs';
import { notifyAllExcept, notifyAll } from '../lib/push.mjs';
import { randomUUID } from 'node:crypto';

const TABLE_POLLS = process.env.TABLE_POLLS;
const TABLE_RESPONSES = process.env.TABLE_RESPONSES;
const TABLE_SESSIONS = process.env.TABLE_SESSIONS;

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

// Middleware: require authentication and return the user payload
async function requireAuth(event) {
  const user = await authenticate(event);
  if (!user) {
    return { error: { statusCode: 401, body: { error: 'Authentication required' } } };
  }
  return { user };
}

// ============================================================================
// POST /polls — Create a new scheduling poll
// ============================================================================
// Body:
//   {
//     "mode": "candidates" | "open",
//     "title": "Session 12",
//     "candidateDates": ["2026-03-15", "2026-03-16"]  // required for candidates mode
//   }
//
// The poll creator is automatically the GM for this poll.
// ============================================================================
async function createPoll(event) {
  const { user, error } = await requireAuth(event);
  if (error) return error;

  const { mode, title, candidateDates } = parseBody(event);

  if (!mode || !title) {
    return { statusCode: 400, body: { error: 'Mode and title are required' } };
  }

  if (!['candidates', 'open'].includes(mode)) {
    return { statusCode: 400, body: { error: 'Mode must be "candidates" or "open"' } };
  }

  if (mode === 'candidates') {
    if (!Array.isArray(candidateDates) || candidateDates.length < 2 || candidateDates.length > 5) {
      return { statusCode: 400, body: { error: 'Candidates mode requires 2-5 dates' } };
    }
  }

  const pollId = randomUUID();
  const now = new Date().toISOString();

  const poll = {
    pollId,
    title,
    mode,
    status: 'active',
    creatorId: user.sub,
    createdAt: now,
    ...(mode === 'candidates' && { candidateDates }),
  };

  await db.put({
    TableName: TABLE_POLLS,
    Item: poll,
  });

  // Notify everyone except the creator that a new poll was created
  notifyAllExcept(user.sub, 'New Poll', `${title} — vote on your availability`).catch(console.error);

  return {
    statusCode: 201,
    body: poll,
  };
}

// ============================================================================
// GET /polls — List all polls
// ============================================================================
// Returns all polls, most recent first. Uses the status GSI to query
// active polls first, then confirmed. For ~6 users with few polls,
// a scan is also fine, but using the GSI is good practice.
// ============================================================================
async function listPolls(event) {
  const { user, error } = await requireAuth(event);
  if (error) return error;

  // Query active polls first, then confirmed
  const [activeResult, confirmedResult] = await Promise.all([
    db.query({
      TableName: TABLE_POLLS,
      IndexName: 'status-index',
      KeyConditionExpression: '#status = :status',
      ExpressionAttributeNames: { '#status': 'status' }, // 'status' is a DynamoDB reserved word
      ExpressionAttributeValues: { ':status': 'active' },
    }),
    db.query({
      TableName: TABLE_POLLS,
      IndexName: 'status-index',
      KeyConditionExpression: '#status = :status',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: { ':status': 'confirmed' },
    }),
  ]);

  // Combine and sort by creation date (newest first)
  const polls = [...(activeResult.Items || []), ...(confirmedResult.Items || [])]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return { body: { polls } };
}

// ============================================================================
// GET /polls/:pollId — Get a single poll with all responses
// ============================================================================
// Returns the poll details plus every member's response, and who hasn't
// responded yet. This gives the full picture for deciding on a date.
// ============================================================================
async function getPoll(event) {
  const { user, error } = await requireAuth(event);
  if (error) return error;

  const { pollId } = event.pathParams;

  // Fetch poll and responses in parallel
  const [pollResult, responsesResult] = await Promise.all([
    db.get({
      TableName: TABLE_POLLS,
      Key: { pollId },
    }),
    db.query({
      TableName: TABLE_RESPONSES,
      KeyConditionExpression: 'pollId = :pollId',
      ExpressionAttributeValues: { ':pollId': pollId },
    }),
  ]);

  if (!pollResult.Item) {
    return { statusCode: 404, body: { error: 'Poll not found' } };
  }

  return {
    body: {
      poll: pollResult.Item,
      responses: responsesResult.Items || [],
    },
  };
}

// ============================================================================
// POST /polls/:pollId/respond — Submit or update your availability
// ============================================================================
// Body for "candidates" mode:
//   { "dates": { "2026-03-15": true, "2026-03-16": false } }
//
// Body for "open" mode:
//   { "availableDates": ["2026-03-15", "2026-03-16", "2026-03-17"] }
//
// Members can update their response at any time while the poll is active.
// ============================================================================
async function respondToPoll(event) {
  const { user, error } = await requireAuth(event);
  if (error) return error;

  const { pollId } = event.pathParams;
  const body = parseBody(event);

  // Verify the poll exists and is still active
  const pollResult = await db.get({
    TableName: TABLE_POLLS,
    Key: { pollId },
  });

  if (!pollResult.Item) {
    return { statusCode: 404, body: { error: 'Poll not found' } };
  }

  if (pollResult.Item.status !== 'active') {
    return { statusCode: 400, body: { error: 'Poll is no longer active' } };
  }

  const poll = pollResult.Item;

  // Validate response data based on poll mode
  if (poll.mode === 'candidates') {
    if (!body.dates || typeof body.dates !== 'object') {
      return { statusCode: 400, body: { error: 'Candidates mode requires a "dates" object' } };
    }
  } else if (poll.mode === 'open') {
    if (!Array.isArray(body.availableDates)) {
      return { statusCode: 400, body: { error: 'Open mode requires an "availableDates" array' } };
    }
  }

  // Upsert the response (PutItem replaces if the key already exists)
  const response = {
    pollId,
    userId: user.sub,
    respondedAt: new Date().toISOString(),
    ...(poll.mode === 'candidates' && { dates: body.dates }),
    ...(poll.mode === 'open' && { availableDates: body.availableDates }),
  };

  await db.put({
    TableName: TABLE_RESPONSES,
    Item: response,
  });

  return { body: response };
}

// ============================================================================
// POST /polls/:pollId/confirm — Confirm a date and create a session
// ============================================================================
// Only the poll creator (GM) can confirm. This:
//   1. Sets the poll status to "confirmed"
//   2. Creates a session record with the confirmed date
//
// Body: { "confirmedDate": "2026-03-15" }
// ============================================================================
async function confirmPoll(event) {
  const { user, error } = await requireAuth(event);
  if (error) return error;

  const { pollId } = event.pathParams;
  const { confirmedDate } = parseBody(event);

  if (!confirmedDate) {
    return { statusCode: 400, body: { error: 'confirmedDate is required' } };
  }

  // Fetch the poll
  const pollResult = await db.get({
    TableName: TABLE_POLLS,
    Key: { pollId },
  });

  if (!pollResult.Item) {
    return { statusCode: 404, body: { error: 'Poll not found' } };
  }

  const poll = pollResult.Item;

  // Only the poll creator can confirm
  if (poll.creatorId !== user.sub) {
    return { statusCode: 403, body: { error: 'Only the poll creator can confirm a date' } };
  }

  if (poll.status !== 'active') {
    return { statusCode: 400, body: { error: 'Poll is no longer active' } };
  }

  // Update poll status to confirmed
  await db.update({
    TableName: TABLE_POLLS,
    Key: { pollId },
    UpdateExpression: 'SET #status = :status, confirmedDate = :date, confirmedAt = :now',
    ExpressionAttributeNames: { '#status': 'status' },
    ExpressionAttributeValues: {
      ':status': 'confirmed',
      ':date': confirmedDate,
      ':now': new Date().toISOString(),
    },
  });

  // Create a session record
  const sessionId = randomUUID();
  const session = {
    sessionId,
    pollId,
    confirmedDate,
    type: 'SESSION', // Fixed value for the GSI partition key (see dynamodb.tf)
    title: poll.title,
    createdAt: new Date().toISOString(),
  };

  await db.put({
    TableName: TABLE_SESSIONS,
    Item: session,
  });

  // Notify everyone that a session date has been confirmed
  notifyAll('Session Confirmed', `${poll.title} — ${confirmedDate}`).catch(console.error);

  return {
    statusCode: 200,
    body: { poll: { ...poll, status: 'confirmed', confirmedDate }, session },
  };
}

// ============================================================================
// POST /polls/:pollId/cancel — Cancel an active poll (creator only)
// ============================================================================
// Sets the poll status to "cancelled". The poll stops appearing in the
// active/confirmed list queries but the data is preserved.
// ============================================================================
async function cancelPoll(event) {
  const { user, error } = await requireAuth(event);
  if (error) return error;

  const { pollId } = event.pathParams;

  const pollResult = await db.get({
    TableName: TABLE_POLLS,
    Key: { pollId },
  });

  if (!pollResult.Item) {
    return { statusCode: 404, body: { error: 'Poll not found' } };
  }

  const poll = pollResult.Item;

  if (poll.creatorId !== user.sub) {
    return { statusCode: 403, body: { error: 'Only the poll creator can cancel it' } };
  }

  if (poll.status !== 'active') {
    return { statusCode: 400, body: { error: 'Only active polls can be cancelled' } };
  }

  await db.update({
    TableName: TABLE_POLLS,
    Key: { pollId },
    UpdateExpression: 'SET #status = :status, cancelledAt = :now',
    ExpressionAttributeNames: { '#status': 'status' },
    ExpressionAttributeValues: {
      ':status': 'cancelled',
      ':now': new Date().toISOString(),
    },
  });

  return { body: { message: 'Poll cancelled' } };
}

// Export route definitions as [method, path, handler] tuples
export const pollRoutes = [
  ['POST', '/polls', createPoll],
  ['GET', '/polls', listPolls],
  ['GET', '/polls/:pollId', getPoll],
  ['POST', '/polls/:pollId/respond', respondToPoll],
  ['POST', '/polls/:pollId/confirm', confirmPoll],
  ['POST', '/polls/:pollId/cancel', cancelPoll],
];
