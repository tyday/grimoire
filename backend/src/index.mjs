// =============================================================================
// index.mjs — Lambda entry point and router
// =============================================================================
// This is the file Lambda calls when a request comes in. It receives the
// full HTTP request from API Gateway (method, path, headers, body) and
// routes it to the correct handler function.
//
// API Gateway v2 "payload format 2.0" gives us a clean event shape:
//   event.requestContext.http.method  -> "GET", "POST", etc.
//   event.requestContext.http.path    -> "/auth/login"
//   event.headers                    -> { authorization: "Bearer ...", ... }
//   event.body                       -> request body (string)
// =============================================================================

import { authRoutes } from './routes/auth.mjs';

// Simple router: maps "METHOD /path" to handler functions
const routes = {
  ...authRoutes,

  // Health check — useful for verifying the API is running
  'GET /health': async () => ({
    statusCode: 200,
    body: JSON.stringify({ status: 'ok' }),
  }),
};

export const handler = async (event) => {
  const method = event.requestContext.http.method;
  const path = event.requestContext.http.path;

  // Build the route key: "POST /auth/login"
  const routeKey = `${method} ${path}`;
  const routeHandler = routes[routeKey];

  if (!routeHandler) {
    return {
      statusCode: 404,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Not found' }),
    };
  }

  try {
    const result = await routeHandler(event);
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
