import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../test/helpers.tsx';
import CreatePoll from './CreatePoll.tsx';

vi.mock('../lib/api.ts', () => ({
  createPoll: vi.fn(),
  getCampaigns: vi.fn().mockResolvedValue([]),
  login: vi.fn(),
  tryRefresh: vi.fn().mockResolvedValue(false),
  logout: vi.fn(),
  setAccessToken: vi.fn(),
  setOnAuthFailure: vi.fn(),
}));

import * as api from '../lib/api.ts';

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.setItem('grimoire-user', JSON.stringify({
    userId: 'u1', email: 'test@example.com', name: 'Test',
  }));
});

describe('CreatePoll', () => {
  it('renders the form with title and mode selection', () => {
    renderWithProviders(<CreatePoll />);

    expect(screen.getByText('New Poll')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('e.g. Session 13')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Candidate Dates/ })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Open Availability/ })).toBeInTheDocument();
  });

  it('starts with 2 date inputs in candidates mode', () => {
    renderWithProviders(<CreatePoll />);

    const dates = document.querySelectorAll('input[type="date"]');
    expect(dates.length).toBe(2);
  });

  it('can add and remove date inputs', async () => {
    const user = userEvent.setup();
    renderWithProviders(<CreatePoll />);

    // Add a date
    await user.click(screen.getByText('+ Add date'));
    let dates = document.querySelectorAll('input[type="date"]');
    expect(dates.length).toBe(3);

    // Remove buttons should appear (only when > 2 dates)
    const removeButtons = screen.getAllByText('Remove');
    expect(removeButtons.length).toBe(3);

    // Remove one
    await user.click(removeButtons[0]);
    dates = document.querySelectorAll('input[type="date"]');
    expect(dates.length).toBe(2);
  });

  it('shows error when submitting candidates mode with fewer than 2 dates', async () => {
    const user = userEvent.setup();
    renderWithProviders(<CreatePoll />);

    await user.type(screen.getByPlaceholderText('e.g. Session 13'), 'Test Poll');
    // Don't fill in any dates, just submit
    await user.click(screen.getByRole('button', { name: 'Create Poll' }));

    expect(screen.getByText('Add at least 2 candidate dates')).toBeInTheDocument();
    expect(api.createPoll).not.toHaveBeenCalled();
  });

  it('hides date inputs when switching to open mode', async () => {
    const user = userEvent.setup();
    renderWithProviders(<CreatePoll />);

    await user.click(screen.getByText('Open Availability'));

    const dates = document.querySelectorAll('input[type="date"]');
    expect(dates.length).toBe(0);
  });

  it('submits an open poll without candidate dates', async () => {
    const user = userEvent.setup();
    vi.mocked(api.createPoll).mockResolvedValue({
      pollId: 'new-poll-id',
      title: 'Open Poll',
      mode: 'open',
      status: 'active',
      creatorId: 'u1',
      createdAt: '2026-01-01T00:00:00Z',
    });

    renderWithProviders(<CreatePoll />);

    await user.type(screen.getByPlaceholderText('e.g. Session 13'), 'Open Poll');
    await user.click(screen.getByText('Open Availability'));
    await user.click(screen.getByRole('button', { name: 'Create Poll' }));

    expect(api.createPoll).toHaveBeenCalledWith('open', 'Open Poll', undefined, undefined);
  });
});
