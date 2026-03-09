import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '../test/helpers.tsx';
import Dashboard from './Dashboard.tsx';

// Mock API module — tryRefresh must return true so AuthProvider keeps the user
vi.mock('../lib/api.ts', () => ({
  getPolls: vi.fn(),
  getSessions: vi.fn(),
  getCampaigns: vi.fn().mockResolvedValue([]),
  createInvite: vi.fn(),
  login: vi.fn(),
  tryRefresh: vi.fn().mockResolvedValue(true),
  logout: vi.fn(),
  setAccessToken: vi.fn(),
}));

// Mock push module
vi.mock('../lib/push.ts', () => ({
  subscribeToPush: vi.fn(),
}));

import * as api from '../lib/api.ts';

beforeEach(() => {
  vi.clearAllMocks();
  // Set up a logged-in user in localStorage so Dashboard renders
  localStorage.setItem('grimoire-user', JSON.stringify({
    userId: 'u1',
    email: 'test@example.com',
    name: 'Gandalf',
  }));
});

describe('Dashboard', () => {
  it('shows loading state initially', () => {
    vi.mocked(api.getPolls).mockReturnValue(new Promise(() => {}));
    vi.mocked(api.getSessions).mockReturnValue(new Promise(() => {}));

    renderWithProviders(<Dashboard />);
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('shows welcome message with user name', async () => {
    vi.mocked(api.getPolls).mockResolvedValue([]);
    vi.mocked(api.getSessions).mockResolvedValue([]);

    renderWithProviders(<Dashboard />);

    await waitFor(() => {
      expect(screen.getByText('Welcome, Gandalf')).toBeInTheDocument();
    });
  });

  it('shows empty state when no sessions or polls', async () => {
    vi.mocked(api.getPolls).mockResolvedValue([]);
    vi.mocked(api.getSessions).mockResolvedValue([]);

    renderWithProviders(<Dashboard />);

    await waitFor(() => {
      expect(screen.getByText('No upcoming sessions')).toBeInTheDocument();
      expect(screen.getByText('No active polls')).toBeInTheDocument();
    });
  });

  it('displays upcoming sessions', async () => {
    vi.mocked(api.getPolls).mockResolvedValue([]);

    // Use a date far in the future so it's always "upcoming"
    const futureDate = '2030-06-15';
    vi.mocked(api.getSessions).mockResolvedValue([
      {
        sessionId: 's1',
        pollId: 'p1',
        confirmedDate: futureDate,
        type: 'SESSION',
        title: 'Dragon Hunt',
        createdAt: '2026-01-01T00:00:00Z',
      },
    ]);

    renderWithProviders(<Dashboard />);

    await waitFor(() => {
      expect(screen.getByText('Dragon Hunt')).toBeInTheDocument();
    });
  });

  it('displays active polls', async () => {
    vi.mocked(api.getSessions).mockResolvedValue([]);
    vi.mocked(api.getPolls).mockResolvedValue([
      {
        pollId: 'p1',
        title: 'Session 13 Scheduling',
        mode: 'candidates',
        status: 'active',
        creatorId: 'u1',
        createdAt: '2026-01-01T00:00:00Z',
        candidateDates: ['2026-03-15', '2026-03-22'],
      },
    ]);

    renderWithProviders(<Dashboard />);

    await waitFor(() => {
      expect(screen.getByText('Session 13 Scheduling')).toBeInTheDocument();
      expect(screen.getByText('2 dates')).toBeInTheDocument();
    });
  });

  it('shows invite button', async () => {
    vi.mocked(api.getPolls).mockResolvedValue([]);
    vi.mocked(api.getSessions).mockResolvedValue([]);

    renderWithProviders(<Dashboard />);

    await waitFor(() => {
      expect(screen.getByText('Invite a player')).toBeInTheDocument();
    });
  });
});
