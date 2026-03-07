// =============================================================================
// index.mjs — Lambda entry point and router
// =============================================================================
// Routes incoming HTTP requests to handler functions. Supports both exact
// path matches and path parameters (e.g., /polls/:pollId).
//
// API Gateway v2 "payload format 2.0" event shape:
//   event.requestContext.http.method  -> "GET", "POST", etc.
//   event.requestContext.http.path    -> "/polls/abc123"
//   event.headers                    -> { authorization: "Bearer ...", ... }
//   event.body                       -> request body (string)
// =============================================================================

import { authRoutes } from './routes/auth.mjs';
import { pollRoutes } from './routes/polls.mjs';

// Route definitions: each entry is [method, pattern, handler].
// Patterns can include :params which match any path segment.
const routeDefinitions = [
  // Health check
  ['GET', '/health', async () => ({ statusCode: 200, body: { status: 'ok' } })],

  // Auth routes
  ...authRoutes,

  // Poll routes
  ...pollRoutes,
];

// ---------------------------------------------------------------------------
// Path matching
// ---------------------------------------------------------------------------
// Compares a route pattern like "/polls/:pollId/respond" against an actual
// path like "/polls/abc123/respond". If it matches, returns an object of
// extracted params: { pollId: "abc123" }. If not, returns null.
// ---------------------------------------------------------------------------
function matchPath(pattern, path) {
  const patternParts = pattern.split('/');
  const pathParts = path.split('/');

  if (patternParts.length !== pathParts.length) return null;

  const params = {};
  for (let i = 0; i < patternParts.length; i++) {
    if (patternParts[i].startsWith(':')) {
      // This segment is a parameter — extract the value
      params[patternParts[i].slice(1)] = pathParts[i];
    } else if (patternParts[i] !== pathParts[i]) {
      return null; // Literal segment doesn't match
    }
  }
  return params;
}

export const handler = async (event) => {
  const method = event.requestContext.http.method;
  const path = event.requestContext.http.path;

  // Find the first matching route
  let matchedHandler = null;
  let params = {};

  for (const [routeMethod, pattern, routeHandler] of routeDefinitions) {
    if (routeMethod !== method) continue;
    const match = matchPath(pattern, path);
    if (match) {
      matchedHandler = routeHandler;
      params = match;
      break;
    }
  }

  if (!matchedHandler) {
    return {
      statusCode: 404,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Not found' }),
    };
  }

  try {
    // Attach extracted path params to the event so handlers can access them
    event.pathParams = params;
    const result = await matchedHandler(event);

    return {
      statusCode: result.statusCode || 200,
      headers: {
        'Content-Type': 'application/json',
        ...result.headers,
      },
      ...(result.cookies && { cookies: result.cookies }),
      body: typeof result.body === 'string' ? result.body : JSON.stringify(result.body),
    };
  } catch (err) {
    console.error('Unhandled error:', err);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Internal server error' }),
    };
  }
};
