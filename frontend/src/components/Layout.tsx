// =============================================================================
// Layout.tsx — App shell with bottom navigation
// =============================================================================
// Provides the persistent navigation bar and page wrapper.
// Bottom nav is thumb-friendly for mobile PWA use.
// =============================================================================

import { Outlet, NavLink, Link } from 'react-router';
import { useAuth } from '../lib/auth.tsx';
import { useOnline } from '../lib/useOnline.ts';
import { useCampaign } from '../lib/campaign.tsx';

export default function Layout() {
  const { user, logout } = useAuth();
  const online = useOnline();
  const { campaigns, activeCampaign, setActiveCampaign } = useCampaign();

  return (
    <div className="layout">
      {!online && (
        <div className="offline-banner" role="alert">
          You are offline — viewing cached data
        </div>
      )}
      <header className="topbar">
        <Link to="/info" className="topbar-brand">Grimoire</Link>
        <div className="topbar-user">
          <span className="topbar-name">{user?.name}</span>
          <button className="btn-ghost btn-sm" onClick={logout}>
            Sign out
          </button>
        </div>
      </header>

      {/* Campaign switcher — shown below topbar when user belongs to campaigns */}
      {campaigns.length > 0 && (
        <div className="campaign-bar">
          {campaigns.length === 1 ? (
            <Link to={`/campaigns/${activeCampaign?.campaignId}`} className="campaign-bar-name">
              {activeCampaign?.name}
            </Link>
          ) : (
            <select
              className="campaign-select"
              value={activeCampaign?.campaignId || ''}
              onChange={(e) => {
                const c = campaigns.find((c) => c.campaignId === e.target.value);
                if (c) setActiveCampaign(c);
              }}
            >
              {campaigns.map((c) => (
                <option key={c.campaignId} value={c.campaignId}>{c.name}</option>
              ))}
            </select>
          )}
          <Link to="/campaigns" className="btn-ghost btn-sm campaign-bar-manage">Manage</Link>
        </div>
      )}

      <main className="page">
        <Outlet />
      </main>

      <nav className="bottomnav">
        <NavLink to="/" end className={({ isActive }) => `nav-tab ${isActive ? 'active' : ''}`}>
          <svg viewBox="0 0 24 24" className="nav-icon">
            <path d="M3 13h1v7c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2v-7h1a1 1 0 0 0 .7-1.7l-9-9a1 1 0 0 0-1.4 0l-9 9A1 1 0 0 0 3 13z" />
          </svg>
          <span>Home</span>
        </NavLink>

        <NavLink to="/polls" className={({ isActive }) => `nav-tab ${isActive ? 'active' : ''}`}>
          <svg viewBox="0 0 24 24" className="nav-icon">
            <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 14H7v-2h5v2zm5-4H7v-2h10v2zm0-4H7V7h10v2z" />
          </svg>
          <span>Polls</span>
        </NavLink>

        <NavLink to="/sessions" className={({ isActive }) => `nav-tab ${isActive ? 'active' : ''}`}>
          <svg viewBox="0 0 24 24" className="nav-icon">
            <path d="M19 4h-1V2h-2v2H8V2H6v2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V10h14v10zm0-12H5V6h14v2z" />
          </svg>
          <span>Sessions</span>
        </NavLink>

        <NavLink to="/campaigns" className={({ isActive }) => `nav-tab ${isActive ? 'active' : ''}`}>
          <svg viewBox="0 0 24 24" className="nav-icon">
            <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5s-3 1.34-3 3 1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z" />
          </svg>
          <span>Campaigns</span>
        </NavLink>
      </nav>
    </div>
  );
}
