import { useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { useOnline } from '../lib/useOnline.ts';
import { createPoll } from '../lib/api.ts';

export default function CreatePoll() {
  const navigate = useNavigate();
  const online = useOnline();
  const [title, setTitle] = useState('');
  const [mode, setMode] = useState<'candidates' | 'open'>('candidates');
  const [dates, setDates] = useState<string[]>(['', '']);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  function addDate() {
    if (dates.length < 5) setDates([...dates, '']);
  }

  function removeDate(index: number) {
    if (dates.length > 2) setDates(dates.filter((_, i) => i !== index));
  }

  function updateDate(index: number, value: string) {
    const updated = [...dates];
    updated[index] = value;
    setDates(updated);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');

    const filledDates = dates.filter(Boolean);
    if (mode === 'candidates' && filledDates.length < 2) {
      setError('Add at least 2 candidate dates');
      return;
    }

    setSubmitting(true);
    try {
      const poll = await createPoll(
        mode,
        title,
        mode === 'candidates' ? filledDates : undefined,
      );
      navigate(`/polls/${poll.pollId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create poll');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="create-poll-page">
      <div className="page-header">
        <h2>New Poll</h2>
      </div>

      <form onSubmit={handleSubmit} className="form">
        {error && <div className="form-error">{error}</div>}

        <label className="field">
          <span className="field-label">Title</span>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Session 13"
            required
            className="field-input"
          />
        </label>

        <fieldset className="field">
          <legend className="field-label">Mode</legend>
          <div className="radio-group">
            <label className={`radio-card ${mode === 'candidates' ? 'selected' : ''}`}>
              <input
                type="radio"
                name="mode"
                value="candidates"
                checked={mode === 'candidates'}
                onChange={() => setMode('candidates')}
              />
              <div>
                <strong>Candidate Dates</strong>
                <span className="radio-desc">Pick specific dates, members vote yes/no</span>
              </div>
            </label>
            <label className={`radio-card ${mode === 'open' ? 'selected' : ''}`}>
              <input
                type="radio"
                name="mode"
                value="open"
                checked={mode === 'open'}
                onChange={() => setMode('open')}
              />
              <div>
                <strong>Open Availability</strong>
                <span className="radio-desc">Members submit their available dates</span>
              </div>
            </label>
          </div>
        </fieldset>

        {mode === 'candidates' && (
          <div className="field">
            <span className="field-label">Candidate Dates</span>
            <div className="date-list">
              {dates.map((date, i) => (
                <div key={i} className="date-row">
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => updateDate(i, e.target.value)}
                    className="field-input"
                  />
                  {dates.length > 2 && (
                    <button type="button" className="btn-ghost btn-sm" onClick={() => removeDate(i)}>
                      Remove
                    </button>
                  )}
                </div>
              ))}
              {dates.length < 5 && (
                <button type="button" className="btn btn-outline btn-sm" onClick={addDate}>
                  + Add date
                </button>
              )}
            </div>
          </div>
        )}

        <button type="submit" className="btn btn-primary btn-full" disabled={submitting || !online}>
          {!online ? 'Offline' : submitting ? 'Creating...' : 'Create Poll'}
        </button>
      </form>
    </div>
  );
}
