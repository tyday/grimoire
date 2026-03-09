import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '../test/helpers.tsx';
import Sessions from './Sessions.tsx';

vi.mock('../lib/api.ts', () => ({
  getSessions: vi.fn(),
  downloadSessionICS: vi.fn(),
  getCampaigns: vi.fn().mockResolvedValue([]),
  login: vi.fn(),
  tryRefresh: vi.fn().mockResolvedValue(false),
  logout: vi.fn(),
  setAccessToken: vi.fn(),
}));

import * as api from '../lib/api.ts';

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.setItem('grimoire-user', JSON.stringify({
    userId: 'u1', email: 'test@example.com', name: 'Test',
  }));
});

describe('Sessions', () => {
  it('shows loading state', () => {
    vi.mocked(api.getSessions).mockReturnValue(new Promise(() => {}));
    renderWithProviders(<Sessions />);
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('shows empty state when no sessions', async () => {
    vi.mocked(api.getSessions).mockResolvedValue([]);
    renderWithProviders(<Sessions />);

    await waitFor(() => {
      expect(screen.getByText('No sessions yet')).toBeInTheDocument();
      expect(screen.getByText('Confirm a poll to schedule your first session')).toBeInTheDocument();
    });
  });

  it('displays upcoming sessions with calendar button', async () => {
    vi.mocked(api.getSessions).mockResolvedValue([
      {
        sessionId: 's1',
        pollId: 'p1',
        confirmedDate: '2030-06-15',
        type: 'SESSION',
        title: 'The Final Battle',
        createdAt: '2026-01-01T00:00:00Z',
      },
    ]);

    renderWithProviders(<Sessions />);

    await waitFor(() => {
      expect(screen.getByText('The Final Battle')).toBeInTheDocument();
      expect(screen.getByText('Add to calendar')).toBeInTheDocument();
      expect(screen.getByText('Upcoming')).toBeInTheDocument();
    });
  });

  it('displays past sessions without calendar button', async () => {
    vi.mocked(api.getSessions).mockResolvedValue([
      {
        sessionId: 's2',
        pollId: 'p2',
        confirmedDate: '2020-01-01',
        type: 'SESSION',
        title: 'Session Zero',
        createdAt: '2019-12-01T00:00:00Z',
      },
    ]);

    renderWithProviders(<Sessions />);

    await waitFor(() => {
      expect(screen.getByText('Session Zero')).toBeInTheDocument();
      expect(screen.getByText('Past')).toBeInTheDocument();
      expect(screen.queryByText('Add to calendar')).not.toBeInTheDocument();
    });
  });

  it('separates upcoming and past sessions', async () => {
    vi.mocked(api.getSessions).mockResolvedValue([
      {
        sessionId: 's1',
        pollId: 'p1',
        confirmedDate: '2030-06-15',
        type: 'SESSION',
        title: 'Future Session',
        createdAt: '2026-01-01T00:00:00Z',
      },
      {
        sessionId: 's2',
        pollId: 'p2',
        confirmedDate: '2020-01-01',
        type: 'SESSION',
        title: 'Past Session',
        createdAt: '2019-12-01T00:00:00Z',
      },
    ]);

    renderWithProviders(<Sessions />);

    await waitFor(() => {
      expect(screen.getByText('Future Session')).toBeInTheDocument();
      expect(screen.getByText('Past Session')).toBeInTheDocument();
      expect(screen.getByText('Upcoming')).toBeInTheDocument();
      expect(screen.getByText('Past')).toBeInTheDocument();
    });
  });
});
