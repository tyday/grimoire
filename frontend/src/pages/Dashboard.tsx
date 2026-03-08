import { useState, useEffect } from 'react';
import { Link } from 'react-router';
import { useAuth } from '../lib/auth.tsx';
import { getPolls, getSessions, createInvite } from '../lib/api.ts';
import { subscribeToPush } from '../lib/push.ts';
import type { Poll, Session } from '../lib/types.ts';

function formatDate(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00');
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function daysUntil(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr + 'T00:00:00');
  return Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

export default function Dashboard() {
  const { user } = useAuth();
  const [polls, setPolls] = useState<Poll[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [pushStatus, setPushStatus] = useState<'unknown' | 'show' | 'subscribed' | 'denied'>('unknown');

  useEffect(() => {
    async function load() {
      try {
        const [p, s] = await Promise.all([getPolls(), getSessions()]);
        setPolls(p);
        setSessions(s);
      } catch (err) {
        console.error('Failed to load dashboard:', err);
      } finally {
        setLoading(false);
      }
    }
    load();

    // Check if push notifications are already set up
    async function checkPush() {
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        setPushStatus('denied');
        return;
      }
      if ('Notification' in window && Notification.permission === 'denied') {
        setPushStatus('denied');
        return;
      }
      // If permission is granted, check for an active subscription
      if ('Notification' in window && Notification.permission === 'granted') {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        setPushStatus(sub ? 'subscribed' : 'show');
      } else {
        // Permission not yet asked — show the prompt
        setPushStatus('show');
      }
    }
    checkPush();
  }, []);

  const [inviteLink, setInviteLink] = useState('');

  const activePolls = polls.filter((p) => p.status === 'active');
  const upcomingSessions = sessions.filter((s) => daysUntil(s.confirmedDate) >= 0);

  async function handleEnableNotifications() {
    const success = await subscribeToPush();
    setPushStatus(success ? 'subscribed' : 'denied');
  }

  async function handleInvite() {
    try {
      const { token } = await createInvite();
      setInviteLink(`${window.location.origin}/join/${token}`);
    } catch (err) {
      console.error('Failed to create invite:', err);
    }
  }

  function handleCopyInvite() {
    // This runs directly from a click handler (no preceding await),
    // so clipboard access works on iOS Safari.
    navigator.clipboard.writeText(inviteLink).catch(() => {});
  }

  if (loading) {
    return <div className="loading">Loading...</div>;
  }

  return (
    <div className="dashboard">
      <div className="page-header">
        <h2>Welcome, {user?.name}</h2>
      </div>

      {/* Notification prompt — shown if no active push subscription */}
      {pushStatus === 'show' && (
        <button className="btn btn-outline btn-full notification-prompt" onClick={handleEnableNotifications}>
          Enable push notifications
        </button>
      )}

      {/* Invite */}
      {!inviteLink ? (
        <button className="btn btn-outline btn-full" onClick={handleInvite}>
          Invite a player
        </button>
      ) : (
        <div className="invite-link-box" onClick={handleCopyInvite}>
          <span className="invite-link-label">Tap to copy invite link</span>
          <span className="invite-link-url">{inviteLink}</span>
        </div>
      )}

      {/* Upcoming Sessions */}
      <section className="section">
        <h3 className="section-title">Upcoming Sessions</h3>
        {upcomingSessions.length === 0 ? (
          <p className="empty-state">No upcoming sessions</p>
        ) : (
          <div className="card-list">
            {upcomingSessions.map((session) => {
              const days = daysUntil(session.confirmedDate);
              return (
                <div key={session.sessionId} className="card session-card">
                  <div className="card-header">
                    <h4 className="card-title">{session.title}</h4>
                    <span className={`badge ${days === 0 ? 'badge-gold' : 'badge-dim'}`}>
                      {days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : `${days} days`}
                    </span>
                  </div>
                  <p className="card-date">{formatDate(session.confirmedDate)}</p>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Active Polls */}
      <section className="section">
        <div className="section-header">
          <h3 className="section-title">Active Polls</h3>
          <Link to="/polls/new" className="btn btn-sm btn-primary">New Poll</Link>
        </div>
        {activePolls.length === 0 ? (
          <p className="empty-state">No active polls</p>
        ) : (
          <div className="card-list">
            {activePolls.map((poll) => (
              <Link key={poll.pollId} to={`/polls/${poll.pollId}`} className="card poll-card">
                <div className="card-header">
                  <h4 className="card-title">{poll.title}</h4>
                  <span className="badge badge-active">Active</span>
                </div>
                <p className="card-meta">
                  {poll.mode === 'candidates' ? `${poll.candidateDates?.length} dates` : 'Open availability'}
                </p>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
