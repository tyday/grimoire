import { render, type RenderOptions } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { AuthProvider } from '../lib/auth.tsx';
import { CampaignProvider } from '../lib/campaign.tsx';
import type { ReactElement } from 'react';

// Render a component wrapped in Router + AuthProvider + CampaignProvider,
// the same providers that App.tsx uses. MemoryRouter lets us control the
// initial route without needing a real browser history.
export function renderWithProviders(
  ui: ReactElement,
  { route = '/', ...options }: RenderOptions & { route?: string } = {},
) {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <AuthProvider>
        <CampaignProvider>
          {ui}
        </CampaignProvider>
      </AuthProvider>
    </MemoryRouter>,
    options,
  );
}
