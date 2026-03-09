import { useState, useEffect } from 'react';
import { Link } from 'react-router';
import { useOnline } from '../lib/useOnline.ts';
import { getPolls } from '../lib/api.ts';
import type { Poll } from '../lib/types.ts';

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function Polls() {
  const online = useOnline();
  const [polls, setPolls] = useState<Poll[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getPolls()
      .then(setPolls)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const active = polls.filter((p) => p.status === 'active');
  const confirmed = polls.filter((p) => p.status === 'confirmed');

  if (loading) return <div className="loading">Loading...</div>;

  return (
    <div className="polls-page">
      <div className="page-header">
        <h2>Polls</h2>
        {online
          ? <Link to="/polls/new" className="btn btn-primary">New Poll</Link>
          : <button className="btn btn-primary" disabled>Offline</button>
        }
      </div>

      {active.length > 0 && (
        <section className="section">
          <h3 className="section-title">Active</h3>
          <div className="card-list">
            {active.map((poll) => (
              <Link key={poll.pollId} to={`/polls/${poll.pollId}`} className="card poll-card">
                <div className="card-header">
                  <h4 className="card-title">{poll.title}</h4>
                  <span className="badge badge-active">Vote</span>
                </div>
                <p className="card-meta">
                  {poll.mode === 'candidates'
                    ? poll.candidateDates?.map(formatDate).join(' · ')
                    : 'Open availability'}
                </p>
              </Link>
            ))}
          </div>
        </section>
      )}

      {confirmed.length > 0 && (
        <section className="section">
          <h3 className="section-title">Confirmed</h3>
          <div className="card-list">
            {confirmed.map((poll) => (
              <Link key={poll.pollId} to={`/polls/${poll.pollId}`} className="card poll-card">
                <div className="card-header">
                  <h4 className="card-title">{poll.title}</h4>
                  <span className="badge badge-confirmed">Confirmed</span>
                </div>
                <p className="card-meta">{poll.confirmedDate && formatDate(poll.confirmedDate)}</p>
              </Link>
            ))}
          </div>
        </section>
      )}

      {polls.length === 0 && (
        <div className="empty-state-large">
          <p>No polls yet</p>
          {online
            ? <Link to="/polls/new" className="btn btn-primary">Create the first poll</Link>
            : <button className="btn btn-primary" disabled>Offline</button>
          }
        </div>
      )}
    </div>
  );
}
