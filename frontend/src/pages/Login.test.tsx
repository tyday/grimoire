import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../test/helpers.tsx';
import Login from './Login.tsx';

// Mock the api module so we don't make real network requests
vi.mock('../lib/api.ts', () => ({
  login: vi.fn(),
  tryRefresh: vi.fn().mockResolvedValue(false),
  logout: vi.fn(),
  setAccessToken: vi.fn(),
}));

import * as api from '../lib/api.ts';

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

describe('Login', () => {
  it('renders the login form', () => {
    renderWithProviders(<Login />);
    expect(screen.getByText('Grimoire')).toBeInTheDocument();
    expect(screen.getByText('Campaign Companion')).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Enter the Grimoire' })).toBeInTheDocument();
  });

  it('submits email and password on form submit', async () => {
    const user = userEvent.setup();
    vi.mocked(api.login).mockResolvedValue({
      accessToken: 'test-token',
      user: { userId: 'u1', email: 'test@example.com', name: 'Test' },
    });

    renderWithProviders(<Login />);

    await user.type(screen.getByLabelText('Email'), 'test@example.com');
    await user.type(screen.getByLabelText('Password'), 'password123');
    await user.click(screen.getByRole('button', { name: 'Enter the Grimoire' }));

    expect(api.login).toHaveBeenCalledWith('test@example.com', 'password123');
  });

  it('displays error message on login failure', async () => {
    const user = userEvent.setup();
    vi.mocked(api.login).mockRejectedValue(new Error('Invalid credentials'));

    renderWithProviders(<Login />);

    await user.type(screen.getByLabelText('Email'), 'bad@example.com');
    await user.type(screen.getByLabelText('Password'), 'wrong');
    await user.click(screen.getByRole('button', { name: 'Enter the Grimoire' }));

    expect(await screen.findByText('Invalid credentials')).toBeInTheDocument();
  });

  it('shows loading state while submitting', async () => {
    const user = userEvent.setup();
    // Never-resolving promise to keep the loading state
    vi.mocked(api.login).mockReturnValue(new Promise(() => {}));

    renderWithProviders(<Login />);

    await user.type(screen.getByLabelText('Email'), 'test@example.com');
    await user.type(screen.getByLabelText('Password'), 'password123');
    await user.click(screen.getByRole('button', { name: 'Enter the Grimoire' }));

    expect(screen.getByRole('button', { name: 'Signing in...' })).toBeDisabled();
  });
});
