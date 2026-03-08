import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '../test/helpers.tsx';
import Polls from './Polls.tsx';

vi.mock('../lib/api.ts', () => ({
  getPolls: vi.fn(),
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

describe('Polls', () => {
  it('shows loading state', () => {
    vi.mocked(api.getPolls).mockReturnValue(new Promise(() => {}));
    renderWithProviders(<Polls />);
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('shows empty state and create button when no polls', async () => {
    vi.mocked(api.getPolls).mockResolvedValue([]);
    renderWithProviders(<Polls />);

    await waitFor(() => {
      expect(screen.getByText('No polls yet')).toBeInTheDocument();
      expect(screen.getByText('Create the first poll')).toBeInTheDocument();
    });
  });

  it('groups polls into active and confirmed sections', async () => {
    vi.mocked(api.getPolls).mockResolvedValue([
      {
        pollId: 'p1',
        title: 'Active Poll',
        mode: 'candidates',
        status: 'active',
        creatorId: 'u1',
        createdAt: '2026-01-01T00:00:00Z',
        candidateDates: ['2026-03-15', '2026-03-22'],
      },
      {
        pollId: 'p2',
        title: 'Confirmed Poll',
        mode: 'open',
        status: 'confirmed',
        creatorId: 'u2',
        createdAt: '2026-01-01T00:00:00Z',
        confirmedDate: '2026-04-01',
      },
    ]);

    renderWithProviders(<Polls />);

    await waitFor(() => {
      expect(screen.getByText('Active Poll')).toBeInTheDocument();
      expect(screen.getByText('Vote')).toBeInTheDocument();
      expect(screen.getByText('Confirmed Poll')).toBeInTheDocument();
      // "Confirmed" appears as both section title and badge — check both exist
      expect(screen.getAllByText('Confirmed').length).toBeGreaterThanOrEqual(2);
    });
  });

  it('shows formatted dates for candidates mode', async () => {
    vi.mocked(api.getPolls).mockResolvedValue([
      {
        pollId: 'p1',
        title: 'Pick a Date',
        mode: 'candidates',
        status: 'active',
        creatorId: 'u1',
        createdAt: '2026-01-01T00:00:00Z',
        candidateDates: ['2026-03-15', '2026-03-22', '2026-03-29'],
      },
    ]);

    renderWithProviders(<Polls />);

    await waitFor(() => {
      // Dates are formatted and joined with " · " — just check the card meta exists
      expect(screen.getByText(/Mar/)).toBeInTheDocument();
    });
  });

  it('shows "Open availability" for open mode polls', async () => {
    vi.mocked(api.getPolls).mockResolvedValue([
      {
        pollId: 'p1',
        title: 'When Works',
        mode: 'open',
        status: 'active',
        creatorId: 'u1',
        createdAt: '2026-01-01T00:00:00Z',
      },
    ]);

    renderWithProviders(<Polls />);

    await waitFor(() => {
      expect(screen.getByText('Open availability')).toBeInTheDocument();
    });
  });

  it('has a New Poll button', async () => {
    vi.mocked(api.getPolls).mockResolvedValue([]);
    renderWithProviders(<Polls />);

    await waitFor(() => {
      expect(screen.getByText('New Poll')).toBeInTheDocument();
    });
  });
});
