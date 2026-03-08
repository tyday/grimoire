// =============================================================================
// api.ts — API client with auth token management
// =============================================================================
// Wraps fetch() to handle:
//   - Adding the Authorization header automatically
//   - Retrying on 401 by refreshing the access token
//   - Sending credentials (cookies) for refresh token flow
// =============================================================================

import type { Poll, PollResponse, Session, User } from './types.ts';

const API_URL = import.meta.env.VITE_API_URL || '';

// Access token lives in memory only (not localStorage) for security.
// If the tab is closed, the user re-authenticates via the refresh cookie.
let accessToken: string | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
}

// ---------------------------------------------------------------------------
// Core fetch wrapper
// ---------------------------------------------------------------------------
async function apiFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const headers = new Headers(options.headers);
  if (!headers.has('Content-Type') && options.body) {
    headers.set('Content-Type', 'application/json');
  }
  if (accessToken) {
    headers.set('Authorization', `Bearer ${accessToken}`);
  }

  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
    credentials: 'include',
  });

  // On 401, try refreshing the token once
  if (response.status === 401 && path !== '/auth/refresh' && path !== '/auth/login') {
    const refreshed = await tryRefresh();
    if (refreshed) {
      headers.set('Authorization', `Bearer ${accessToken}`);
      return fetch(`${API_URL}${path}`, {
        ...options,
        headers,
        credentials: 'include',
      });
    }
  }

  return response;
}

// ---------------------------------------------------------------------------
// Auth endpoints
// ---------------------------------------------------------------------------
export async function login(email: string, password: string): Promise<{ accessToken: string; user: User }> {
  const res = await apiFetch('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Login failed');
  }
  const data = await res.json();
  accessToken = data.accessToken;
  return data;
}

export async function tryRefresh(): Promise<boolean> {
  try {
    const res = await fetch(`${API_URL}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
    });
    if (!res.ok) return false;
    const data = await res.json();
    accessToken = data.accessToken;
    return true;
  } catch {
    return false;
  }
}

export async function logout(): Promise<void> {
  await apiFetch('/auth/logout', { method: 'POST' });
  accessToken = null;
}

// ---------------------------------------------------------------------------
// Poll endpoints
// ---------------------------------------------------------------------------
export async function getPolls(): Promise<Poll[]> {
  const res = await apiFetch('/polls');
  if (!res.ok) throw new Error('Failed to fetch polls');
  const data = await res.json();
  return data.polls;
}

export async function getPoll(pollId: string): Promise<{ poll: Poll; responses: PollResponse[] }> {
  const res = await apiFetch(`/polls/${pollId}`);
  if (!res.ok) throw new Error('Failed to fetch poll');
  return res.json();
}

export async function createPoll(
  mode: 'candidates' | 'open',
  title: string,
  candidateDates?: string[],
): Promise<Poll> {
  const res = await apiFetch('/polls', {
    method: 'POST',
    body: JSON.stringify({ mode, title, candidateDates }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Failed to create poll');
  }
  return res.json();
}

export async function respondToPoll(
  pollId: string,
  data: { dates?: Record<string, string>; availableDates?: string[] },
): Promise<void> {
  const res = await apiFetch(`/polls/${pollId}/respond`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to submit response');
}

export async function cancelPoll(pollId: string): Promise<void> {
  const res = await apiFetch(`/polls/${pollId}/cancel`, { method: 'POST' });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Failed to cancel poll');
  }
}

export async function confirmPoll(pollId: string, confirmedDate: string): Promise<void> {
  const res = await apiFetch(`/polls/${pollId}/confirm`, {
    method: 'POST',
    body: JSON.stringify({ confirmedDate }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Failed to confirm');
  }
}

// ---------------------------------------------------------------------------
// Session endpoints
// ---------------------------------------------------------------------------
export async function getSessions(): Promise<Session[]> {
  const res = await apiFetch('/sessions');
  if (!res.ok) throw new Error('Failed to fetch sessions');
  const data = await res.json();
  return data.sessions;
}

export async function downloadSessionICS(sessionId: string, confirmedDate: string): Promise<void> {
  const res = await apiFetch(`/sessions/${sessionId}/ics`);
  if (!res.ok) throw new Error('Failed to download ICS');
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `grimoire-${confirmedDate}.ics`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
