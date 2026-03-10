import { useState, useEffect } from 'react';
import { useParams } from 'react-router';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useAuth } from '../lib/auth.tsx';
import { useOnline } from '../lib/useOnline.ts';
import { getSession, getSessionNotes, saveSessionNote, deleteSessionNote, downloadSessionICS } from '../lib/api.ts';
import type { Session, SessionNote } from '../lib/types.ts';

function formatDate(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00');
  return date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export default function SessionDetail() {
  const { sessionId } = useParams();
  const { user } = useAuth();
  const online = useOnline();
  const [session, setSession] = useState<Session | null>(null);
  const [notes, setNotes] = useState<SessionNote[]>([]);
  const [loading, setLoading] = useState(true);

  // Editor state
  const [editing, setEditing] = useState(false);
  const [preview, setPreview] = useState(false);
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!sessionId) return;
    Promise.all([getSession(sessionId), getSessionNotes(sessionId)])
      .then(([s, n]) => {
        setSession(s);
        setNotes(n);
        // If the user already has a note, pre-fill the editor
        const myNote = n.find((note) => note.userId === user?.userId);
        if (myNote) setContent(myNote.content);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [sessionId, user?.userId]);

  const myNote = notes.find((n) => n.userId === user?.userId);
  const otherNotes = notes.filter((n) => n.userId !== user?.userId);

  async function handleSave() {
    if (!sessionId || !content.trim()) return;
    setSaving(true);
    setError('');
    try {
      const saved = await saveSessionNote(sessionId, content);
      setNotes((prev) => {
        const without = prev.filter((n) => n.userId !== user?.userId);
        return [...without, saved];
      });
      setEditing(false);
      setPreview(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!sessionId) return;
    try {
      await deleteSessionNote(sessionId);
      setNotes((prev) => prev.filter((n) => n.userId !== user?.userId));
      setContent('');
      setEditing(false);
    } catch (err) {
      console.error('Failed to delete note:', err);
    }
  }

  if (loading) return <div className="loading">Loading...</div>;
  if (!session) return <div className="loading">Session not found</div>;

  return (
    <div className="session-detail-page">
      {/* Session header */}
      <div className="page-header">
        <h2>{session.title}</h2>
      </div>
      <p className="card-date">{formatDate(session.confirmedDate)}</p>
      <button
        className="btn btn-outline btn-sm"
        style={{ marginTop: '8px', marginBottom: '24px' }}
        onClick={() => downloadSessionICS(session.sessionId, session.confirmedDate)}
      >
        Add to calendar
      </button>

      {/* Your note */}
      <section className="section">
        <div className="section-header">
          <h3 className="section-title">Your Notes</h3>
          {!editing && (
            <button
              className="btn btn-sm btn-primary"
              onClick={() => setEditing(true)}
              disabled={!online}
            >
              {myNote ? 'Edit' : 'Write Notes'}
            </button>
          )}
        </div>

        {editing ? (
          <div className="note-editor">
            {error && <div className="form-error">{error}</div>}

            <div className="note-editor-tabs">
              <button
                className={`note-tab ${!preview ? 'active' : ''}`}
                onClick={() => setPreview(false)}
              >
                Write
              </button>
              <button
                className={`note-tab ${preview ? 'active' : ''}`}
                onClick={() => setPreview(true)}
              >
                Preview
              </button>
            </div>

            {preview ? (
              <div className="note-preview markdown-body">
                {content.trim() ? (
                  <Markdown remarkPlugins={[remarkGfm]}>{content}</Markdown>
                ) : (
                  <p className="empty-state">Nothing to preview</p>
                )}
              </div>
            ) : (
              <textarea
                className="note-textarea"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Write your session notes in Markdown..."
                rows={12}
                autoFocus
              />
            )}

            <div className="note-editor-actions">
              <button className="btn btn-outline btn-sm" onClick={() => { setEditing(false); setPreview(false); }}>
                Cancel
              </button>
              {myNote && (
                <button className="btn-ghost btn-sm btn-danger" onClick={handleDelete} disabled={!online}>
                  Delete
                </button>
              )}
              <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={saving || !content.trim() || !online}>
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        ) : myNote ? (
          <div className="note-card">
            <div className="markdown-body">
              <Markdown remarkPlugins={[remarkGfm]}>{myNote.content}</Markdown>
            </div>
            <p className="note-meta">Last edited {formatTimestamp(myNote.updatedAt)}</p>
          </div>
        ) : (
          <p className="empty-state">No notes yet — write a recap of the session</p>
        )}
      </section>

      {/* Other members' notes */}
      {otherNotes.length > 0 && (
        <section className="section">
          <h3 className="section-title">Party Notes</h3>
          <div className="card-list">
            {otherNotes.map((note) => (
              <div key={note.noteId} className="note-card">
                <div className="note-card-header">
                  <span className="note-author">{note.userName}</span>
                  <span className="note-meta">{formatTimestamp(note.updatedAt)}</span>
                </div>
                <div className="markdown-body">
                  <Markdown remarkPlugins={[remarkGfm]}>{note.content}</Markdown>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
