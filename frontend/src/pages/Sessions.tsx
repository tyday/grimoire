import { useState, useEffect } from 'react';
import { getSessions, downloadSessionICS } from '../lib/api.ts';
import type { Session } from '../lib/types.ts';

function formatDate(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00');
  return date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

function daysUntil(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr + 'T00:00:00');
  return Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

export default function Sessions() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getSessions()
      .then(setSessions)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const upcoming = sessions.filter((s) => daysUntil(s.confirmedDate) >= 0);
  const past = sessions.filter((s) => daysUntil(s.confirmedDate) < 0);

  if (loading) return <div className="loading">Loading...</div>;

  return (
    <div className="sessions-page">
      <div className="page-header">
        <h2>Sessions</h2>
      </div>

      {upcoming.length > 0 && (
        <section className="section">
          <h3 className="section-title">Upcoming</h3>
          <div className="card-list">
            {upcoming.map((session) => {
              const days = daysUntil(session.confirmedDate);
              return (
                <div key={session.sessionId} className="card session-card">
                  <div className="card-header">
                    <h4 className="card-title">{session.title}</h4>
                    <span className={`badge ${days === 0 ? 'badge-gold' : 'badge-dim'}`}>
                      {days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : `In ${days} days`}
                    </span>
                  </div>
                  <p className="card-date">{formatDate(session.confirmedDate)}</p>
                  <button
                    className="btn btn-outline btn-sm"
                    onClick={() => downloadSessionICS(session.sessionId, session.confirmedDate)}
                  >
                    Add to calendar
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {past.length > 0 && (
        <section className="section">
          <h3 className="section-title">Past</h3>
          <div className="card-list">
            {past.map((session) => (
              <div key={session.sessionId} className="card session-card session-past">
                <div className="card-header">
                  <h4 className="card-title">{session.title}</h4>
                </div>
                <p className="card-date">{formatDate(session.confirmedDate)}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {sessions.length === 0 && (
        <div className="empty-state-large">
          <p>No sessions yet</p>
          <p className="empty-state-sub">Confirm a poll to schedule your first session</p>
        </div>
      )}
    </div>
  );
}
