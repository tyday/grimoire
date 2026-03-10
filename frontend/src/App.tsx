import { BrowserRouter, Routes, Route, Navigate } from 'react-router';
import { AuthProvider, useAuth } from './lib/auth.tsx';
import { CampaignProvider } from './lib/campaign.tsx';
import Layout from './components/Layout.tsx';
import Login from './pages/Login.tsx';
import Register from './pages/Register.tsx';
import Dashboard from './pages/Dashboard.tsx';
import Polls from './pages/Polls.tsx';
import CreatePoll from './pages/CreatePoll.tsx';
import PollDetail from './pages/PollDetail.tsx';
import Sessions from './pages/Sessions.tsx';
import SessionDetail from './pages/SessionDetail.tsx';
import Campaigns from './pages/Campaigns.tsx';
import CampaignDetail from './pages/CampaignDetail.tsx';
import Info from './pages/Info.tsx';

function AppRoutes() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="loading-screen">
        <h1 className="loading-brand">Grimoire</h1>
      </div>
    );
  }

  // The /join/:token route is accessible without auth — it's the registration page
  // for invited users. All other routes require authentication.
  return (
    <Routes>
      <Route path="join/:token" element={user ? <Navigate to="/" replace /> : <Register />} />
      {!user ? (
        <Route path="*" element={<Login />} />
      ) : (
        <Route element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="polls" element={<Polls />} />
          <Route path="polls/new" element={<CreatePoll />} />
          <Route path="polls/:pollId" element={<PollDetail />} />
          <Route path="sessions" element={<Sessions />} />
          <Route path="sessions/:sessionId" element={<SessionDetail />} />
          <Route path="campaigns" element={<Campaigns />} />
          <Route path="campaigns/:campaignId" element={<CampaignDetail />} />
          <Route path="info" element={<Info />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      )}
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <CampaignProvider>
          <AppRoutes />
        </CampaignProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
