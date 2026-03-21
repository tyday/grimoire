import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router';
import { useAuth } from '../lib/auth.tsx';
import { useOnline } from '../lib/useOnline.ts';
import { getPoll, respondToPoll, confirmPoll, cancelPoll } from '../lib/api.ts';
import type { Poll, PollResponse } from '../lib/types.ts';

function formatDate(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00');
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

type VoteValue = 'yes' | 'no' | 'maybe';

export default function PollDetail() {
  const { pollId } = useParams();
  const { user } = useAuth();
  const online = useOnline();
  const navigate = useNavigate();
  const [poll, setPoll] = useState<Poll | null>(null);
  const [responses, setResponses] = useState<PollResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Candidates mode state
  const [votes, setVotes] = useState<Record<string, VoteValue>>({});

  // Open mode state
  const [availableDates, setAvailableDates] = useState<string[]>([]);
  const [newDate, setNewDate] = useState('');

  // Confirm state
  const [confirmDate, setConfirmDate] = useState('');

  // Share state
  const [copied, setCopied] = useState(false);

  const loadPoll = useCallback(async () => {
    if (!pollId) return;
    try {
      const data = await getPoll(pollId);
      setPoll(data.poll);
      setResponses(data.responses);

      // Load existing response
      const myResponse = data.responses.find((r) => r.userId === user?.userId);
      if (myResponse?.dates) {
        setVotes(myResponse.dates as Record<string, VoteValue>);
      }
      if (myResponse?.availableDates) {
        setAvailableDates(myResponse.availableDates);
      }
    } catch (err) {
      console.error('Failed to load poll:', err);
    } finally {
      setLoading(false);
    }
  }, [pollId, user?.userId]);

  useEffect(() => { loadPoll(); }, [loadPoll]);

  // --- Candidates mode ---

  function cycleVote(date: string) {
    const current = votes[date];
    const next: VoteValue = !current ? 'yes' : current === 'yes' ? 'maybe' : current === 'maybe' ? 'no' : 'yes';
    setVotes({ ...votes, [date]: next });
  }

  async function handleSubmitCandidateVotes() {
    if (!pollId) return;
    setSubmitting(true);
    setError('');
    try {
      await respondToPoll(pollId, { dates: votes });
      await loadPoll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit');
    } finally {
      setSubmitting(false);
    }
  }

  // --- Open mode ---

  function addAvailableDate() {
    if (newDate && !availableDates.includes(newDate)) {
      setAvailableDates([...availableDates, newDate].sort());
      setNewDate('');
    }
  }

  function removeAvailableDate(date: string) {
    setAvailableDates(availableDates.filter((d) => d !== date));
  }

  async function handleSubmitOpenDates() {
    if (!pollId) return;
    setSubmitting(true);
    setError('');
    try {
      await respondToPoll(pollId, { availableDates });
      await loadPoll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit');
    } finally {
      setSubmitting(false);
    }
  }

  // --- Cancel ---

  async function handleCancel() {
    if (!pollId || !confirm('Cancel this poll?')) return;
    setSubmitting(true);
    setError('');
    try {
      await cancelPoll(pollId);
      navigate('/polls');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to cancel');
    } finally {
      setSubmitting(false);
    }
  }

  // --- Confirm ---

  async function handleConfirm() {
    if (!pollId || !confirmDate) return;
    setSubmitting(true);
    setError('');
    try {
      await confirmPoll(pollId, confirmDate);
      navigate('/sessions');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to confirm');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <div className="loading">Loading...</div>;
  if (!poll) return <div className="loading">Poll not found</div>;

  const isCreator = poll.creatorId === user?.userId;
  const isActive = poll.status === 'active';

  async function handleShare() {
    const url = `${window.location.origin}/polls/${pollId}`;
    const shareData = { title: poll!.title, text: `Vote on: ${poll!.title}`, url };

    if (navigator.share) {
      try { await navigator.share(shareData); } catch { /* user cancelled */ }
    } else {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  // For open mode: collect all dates across responses and count availability
  const openDateCounts: Record<string, number> = {};
  if (poll.mode === 'open') {
    for (const r of responses) {
      for (const d of r.availableDates || []) {
        openDateCounts[d] = (openDateCounts[d] || 0) + 1;
      }
    }
  }
  const openDatesSorted = Object.entries(openDateCounts).sort((a, b) => b[1] - a[1]);

  return (
    <div className="poll-detail">
      <div className="page-header">
        <h2>{poll.title}</h2>
        <div className="page-header-actions">
          <button className="btn btn-outline btn-sm" onClick={handleShare}>
            {copied ? 'Copied!' : 'Share'}
          </button>
          <span className={`badge ${poll.status === 'active' ? 'badge-active' : 'badge-confirmed'}`}>
            {poll.status}
          </span>
        </div>
      </div>

      {error && <div className="form-error">{error}</div>}

      {/* ===== CANDIDATES MODE ===== */}
      {poll.mode === 'candidates' && poll.candidateDates && (
        <section className="section">
          <h3 className="section-title">Dates</h3>
          <div className="vote-list">
            {poll.candidateDates.map((date) => {
              const yesCount = responses.filter((r) => r.dates?.[date] === 'yes').length;
              const maybeCount = responses.filter((r) => r.dates?.[date] === 'maybe').length;
              const myVote = votes[date];

              return (
                <div key={date} className="vote-row">
                  <div className="vote-date">
                    <span className="vote-date-text">{formatDate(date)}</span>
                    <span className="vote-tally">
                      {yesCount > 0 && <span className="tally-yes">{yesCount} yes</span>}
                      {maybeCount > 0 && <span className="tally-maybe">{maybeCount} maybe</span>}
                    </span>
                  </div>
                  {isActive && (
                    <button
                      type="button"
                      className={`vote-btn vote-${myVote || 'none'}`}
                      onClick={() => cycleVote(date)}
                    >
                      {myVote || 'vote'}
                    </button>
                  )}
                  {poll.status === 'confirmed' && poll.confirmedDate === date && (
                    <span className="badge badge-gold">Confirmed</span>
                  )}
                </div>
              );
            })}
          </div>

          {isActive && (
            <button
              className="btn btn-primary btn-full"
              onClick={handleSubmitCandidateVotes}
              disabled={submitting || !online || Object.keys(votes).length === 0}
            >
              {!online ? 'Offline' : submitting ? 'Saving...' : 'Submit Votes'}
            </button>
          )}
        </section>
      )}

      {/* ===== OPEN MODE ===== */}
      {poll.mode === 'open' && (
        <>
          {/* Submit your available dates */}
          {isActive && (
            <section className="section">
              <h3 className="section-title">Your Available Dates</h3>

              <div className="date-list">
                {availableDates.map((date) => (
                  <div key={date} className="vote-row">
                    <span className="vote-date-text">{formatDate(date)}</span>
                    <button
                      type="button"
                      className="btn-ghost btn-sm"
                      onClick={() => removeAvailableDate(date)}
                    >
                      Remove
                    </button>
                  </div>
                ))}

                <div className="date-row">
                  <input
                    type="date"
                    value={newDate}
                    onChange={(e) => setNewDate(e.target.value)}
                    className="field-input"
                  />
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    onClick={addAvailableDate}
                    disabled={!newDate}
                  >
                    Add
                  </button>
                </div>
              </div>

              <button
                className="btn btn-primary btn-full"
                onClick={handleSubmitOpenDates}
                disabled={submitting || !online || availableDates.length === 0}
                style={{ marginTop: '12px' }}
              >
                {!online ? 'Offline' : submitting ? 'Saving...' : 'Submit Availability'}
              </button>
            </section>
          )}

          {/* Overlap view: show all dates ranked by availability count */}
          {openDatesSorted.length > 0 && (
            <section className="section">
              <h3 className="section-title">Best Dates</h3>
              <div className="vote-list">
                {openDatesSorted.map(([date, count]) => (
                  <div key={date} className="vote-row">
                    <div className="vote-date">
                      <span className="vote-date-text">{formatDate(date)}</span>
                      <span className="vote-tally">
                        <span className="tally-yes">{count} available</span>
                      </span>
                    </div>
                    {poll.status === 'confirmed' && poll.confirmedDate === date && (
                      <span className="badge badge-gold">Confirmed</span>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}

      {/* Responses summary */}
      {responses.length > 0 && (
        <section className="section">
          <h3 className="section-title">Responses ({responses.length})</h3>
          <div className="response-list">
            {responses.map((r) => (
              <div key={r.userId} className="response-row">
                <span className="response-user">{r.userId === user?.userId ? 'You' : r.userName || r.userId.slice(0, 8)}</span>
                <span className="response-time">
                  {new Date(r.respondedAt).toLocaleDateString()}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Confirm section — only for poll creator */}
      {isCreator && isActive && (
        <section className="section confirm-section">
          <h3 className="section-title">Confirm a Date</h3>
          <p className="section-desc">As the GM, pick the final date for this session.</p>
          <div className="confirm-controls">
            {poll.mode === 'candidates' ? (
              <select
                value={confirmDate}
                onChange={(e) => setConfirmDate(e.target.value)}
                className="field-input"
              >
                <option value="">Select a date...</option>
                {poll.candidateDates?.map((d) => (
                  <option key={d} value={d}>{formatDate(d)}</option>
                ))}
              </select>
            ) : (
              <input
                type="date"
                value={confirmDate}
                onChange={(e) => setConfirmDate(e.target.value)}
                className="field-input"
                list="suggested-dates"
              />
            )}
            <button
              className="btn btn-gold"
              onClick={handleConfirm}
              disabled={!confirmDate || submitting || !online}
            >
              {!online ? 'Offline' : submitting ? 'Confirming...' : 'Confirm Session'}
            </button>
          </div>
          {/* Suggest top dates from responses for open mode */}
          {poll.mode === 'open' && openDatesSorted.length > 0 && (
            <datalist id="suggested-dates">
              {openDatesSorted.map(([d]) => (
                <option key={d} value={d} />
              ))}
            </datalist>
          )}
        </section>
      )}

      {/* Cancel button — creator only, active polls */}
      {isCreator && isActive && (
        <button
          className="btn btn-ghost btn-full btn-danger"
          onClick={handleCancel}
          disabled={submitting || !online}
        >
          {!online ? 'Offline' : 'Cancel Poll'}
        </button>
      )}
    </div>
  );
}
