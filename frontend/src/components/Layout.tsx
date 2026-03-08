// =============================================================================
// Layout.tsx — App shell with bottom navigation
// =============================================================================
// Provides the persistent navigation bar and page wrapper.
// Bottom nav is thumb-friendly for mobile PWA use.
// =============================================================================

import { Outlet, NavLink, Link } from 'react-router';
import { useAuth } from '../lib/auth.tsx';

export default function Layout() {
  const { user, logout } = useAuth();

  return (
    <div className="layout">
      <header className="topbar">
        <Link to="/info" className="topbar-brand">Grimoire</Link>
        <div className="topbar-user">
          <span className="topbar-name">{user?.name}</span>
          <button className="btn-ghost btn-sm" onClick={logout}>
            Sign out
          </button>
        </div>
      </header>

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
      </nav>
    </div>
  );
}
