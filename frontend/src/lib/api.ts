// =============================================================================
// api.ts — API client with auth token management
// =============================================================================
// Wraps fetch() to handle:
//   - Adding the Authorization header automatically
//   - Retrying on 401 by refreshing the access token
//   - Sending credentials (cookies) for refresh token flow
// =============================================================================

import type { BrowseCampaign, Campaign, CampaignMember, Poll, PollResponse, Session, SessionNote, User } from './types.ts';

const API_URL = import.meta.env.VITE_API_URL || '';

// Access token lives in memory only (not localStorage) for security.
// If the tab is closed, the user re-authenticates via the refresh cookie.
let accessToken: string | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
}

// Called when a refresh token fails — lets the auth context force a logout.
let onAuthFailure: (() => void) | null = null;

export function setOnAuthFailure(callback: (() => void) | null) {
  onAuthFailure = callback;
}

// ---------------------------------------------------------------------------
// Core fetch wrapper
// ---------------------------------------------------------------------------
export async function apiFetch(path: string, options: RequestInit = {}): Promise<Response> {
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
    // Refresh failed — session is dead, force logout
    onAuthFailure?.();
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

export async function register(
  token: string,
  email: string,
  password: string,
  name: string,
): Promise<{ accessToken: string; user: User }> {
  const res = await apiFetch('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ token, email, password, name }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Registration failed');
  }
  const data = await res.json();
  accessToken = data.accessToken;
  return data;
}

export async function logout(): Promise<void> {
  await apiFetch('/auth/logout', { method: 'POST' });
  accessToken = null;
}

export async function createInvite(): Promise<{ token: string; expiresAt: number }> {
  const res = await apiFetch('/admin/invite', { method: 'POST' });
  if (!res.ok) throw new Error('Failed to create invite');
  return res.json();
}

// ---------------------------------------------------------------------------
// Campaign endpoints
// ---------------------------------------------------------------------------
export async function getCampaigns(): Promise<Campaign[]> {
  const res = await apiFetch('/campaigns');
  if (!res.ok) throw new Error('Failed to fetch campaigns');
  const data = await res.json();
  return data.campaigns;
}

export async function getCampaign(
  campaignId: string,
): Promise<{ campaign: Campaign; members: CampaignMember[]; sessions: Session[]; currentUser: { isMember: boolean; role: string | null } }> {
  const res = await apiFetch(`/campaigns/${campaignId}`);
  if (!res.ok) throw new Error('Failed to fetch campaign');
  return res.json();
}

export async function browseCampaigns(): Promise<BrowseCampaign[]> {
  const res = await apiFetch('/campaigns/browse');
  if (!res.ok) throw new Error('Failed to browse campaigns');
  const data = await res.json();
  return data.campaigns;
}

export async function joinCampaign(campaignId: string): Promise<void> {
  const res = await apiFetch(`/campaigns/${campaignId}/join`, { method: 'POST' });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Failed to join campaign');
  }
}

export async function leaveCampaign(campaignId: string): Promise<void> {
  const res = await apiFetch(`/campaigns/${campaignId}/leave`, { method: 'POST' });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Failed to leave campaign');
  }
}

export async function getUsers(): Promise<User[]> {
  const res = await apiFetch('/users');
  if (!res.ok) throw new Error('Failed to fetch users');
  const data = await res.json();
  return data.users;
}

export async function createCampaign(name: string, description?: string): Promise<Campaign> {
  const res = await apiFetch('/campaigns', {
    method: 'POST',
    body: JSON.stringify({ name, description }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Failed to create campaign');
  }
  return res.json();
}

export async function addCampaignMember(campaignId: string, userId: string, role?: string): Promise<void> {
  const res = await apiFetch(`/campaigns/${campaignId}/members`, {
    method: 'POST',
    body: JSON.stringify({ userId, role }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Failed to add member');
  }
}

export async function updateMemberRole(campaignId: string, userId: string, role: 'gm' | 'player'): Promise<void> {
  const res = await apiFetch(`/campaigns/${campaignId}/members/${userId}`, {
    method: 'PATCH',
    body: JSON.stringify({ role }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Failed to update role');
  }
}

export async function removeCampaignMember(campaignId: string, userId: string): Promise<void> {
  const res = await apiFetch(`/campaigns/${campaignId}/members/${userId}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error('Failed to remove member');
}

// ---------------------------------------------------------------------------
// Poll endpoints
// ---------------------------------------------------------------------------
export async function getPolls(campaignId?: string): Promise<Poll[]> {
  const query = campaignId ? `?campaignId=${campaignId}` : '';
  const res = await apiFetch(`/polls${query}`);
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
  campaignId?: string,
): Promise<Poll> {
  const res = await apiFetch('/polls', {
    method: 'POST',
    body: JSON.stringify({ mode, title, candidateDates, campaignId }),
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
export async function getSessions(campaignId?: string): Promise<Session[]> {
  const query = campaignId ? `?campaignId=${campaignId}` : '';
  const res = await apiFetch(`/sessions${query}`);
  if (!res.ok) throw new Error('Failed to fetch sessions');
  const data = await res.json();
  return data.sessions;
}

export async function getSession(sessionId: string): Promise<Session> {
  const res = await apiFetch(`/sessions/${sessionId}`);
  if (!res.ok) throw new Error('Failed to fetch session');
  return res.json();
}

export async function getSessionNotes(sessionId: string): Promise<SessionNote[]> {
  const res = await apiFetch(`/sessions/${sessionId}/notes`);
  if (!res.ok) throw new Error('Failed to fetch notes');
  const data = await res.json();
  return data.notes;
}

export async function saveSessionNote(sessionId: string, content: string): Promise<SessionNote> {
  const res = await apiFetch(`/sessions/${sessionId}/notes`, {
    method: 'PUT',
    body: JSON.stringify({ content }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Failed to save note');
  }
  return res.json();
}

export async function deleteSessionNote(sessionId: string): Promise<void> {
  const res = await apiFetch(`/sessions/${sessionId}/notes`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete note');
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
