import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router';
import { useAuth } from '../lib/auth.tsx';
import { useOnline } from '../lib/useOnline.ts';
import { useCampaign } from '../lib/campaign.tsx';
import { getCampaign, removeCampaignMember, joinCampaign, leaveCampaign, addCampaignMember, getUsers } from '../lib/api.ts';
import type { Campaign, CampaignMember, Session, User } from '../lib/types.ts';

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

export default function CampaignDetail() {
  const { campaignId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const online = useOnline();
  const { refreshCampaigns } = useCampaign();

  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [members, setMembers] = useState<CampaignMember[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [currentUser, setCurrentUser] = useState<{ isMember: boolean; role: string | null }>({ isMember: false, role: null });
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState('');

  // GM add-member state
  const [showAddMember, setShowAddMember] = useState(false);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);

  function loadCampaign() {
    if (!campaignId) return;
    getCampaign(campaignId)
      .then(({ campaign, members, sessions, currentUser }) => {
        setCampaign(campaign);
        setMembers(members);
        setSessions(sessions || []);
        setCurrentUser(currentUser);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }

  useEffect(() => { loadCampaign(); }, [campaignId]);

  async function handleJoin() {
    if (!campaignId) return;
    setActionLoading(true);
    setError('');
    try {
      await joinCampaign(campaignId);
      await refreshCampaigns();
      loadCampaign();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to join');
    } finally {
      setActionLoading(false);
    }
  }

  async function handleLeave() {
    if (!campaignId) return;
    setActionLoading(true);
    setError('');
    try {
      await leaveCampaign(campaignId);
      await refreshCampaigns();
      navigate('/campaigns');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to leave');
    } finally {
      setActionLoading(false);
    }
  }

  async function handleRemoveMember(userId: string) {
    if (!campaignId) return;
    try {
      await removeCampaignMember(campaignId, userId);
      setMembers(members.filter((m) => m.userId !== userId));
      if (userId === user?.userId) {
        await refreshCampaigns();
        navigate('/');
      }
    } catch (err) {
      console.error('Failed to remove member:', err);
    }
  }

  async function handleShowAddMember() {
    setShowAddMember(true);
    setLoadingUsers(true);
    try {
      const users = await getUsers();
      setAllUsers(users);
    } catch (err) {
      console.error('Failed to fetch users:', err);
    } finally {
      setLoadingUsers(false);
    }
  }

  async function handleAddMember(userId: string) {
    if (!campaignId) return;
    setError('');
    try {
      await addCampaignMember(campaignId, userId);
      setShowAddMember(false);
      loadCampaign();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add member');
    }
  }

  if (loading) return <div className="loading">Loading...</div>;
  if (!campaign) return <div className="loading">Campaign not found</div>;

  const isGM = currentUser.role === 'gm';
  const isPlayer = currentUser.isMember && currentUser.role === 'player';
  const upcoming = sessions.filter((s) => daysUntil(s.confirmedDate) >= 0);
  const past = sessions.filter((s) => daysUntil(s.confirmedDate) < 0);

  // Users not yet in the campaign (for the add-member picker)
  const memberIds = new Set(members.map((m) => m.userId));
  const availableUsers = allUsers.filter((u) => !memberIds.has(u.userId));

  return (
    <div className="campaign-detail-page">
      <div className="page-header">
        <h2>{campaign.name}</h2>
        <div className="page-header-actions">
          {!currentUser.isMember && (
            <button className="btn btn-primary btn-sm" onClick={handleJoin} disabled={!online || actionLoading}>
              {actionLoading ? 'Joining...' : 'Join Campaign'}
            </button>
          )}
          {isPlayer && (
            <button className="btn btn-outline btn-sm btn-danger" onClick={handleLeave} disabled={!online || actionLoading}>
              {actionLoading ? 'Leaving...' : 'Leave Campaign'}
            </button>
          )}
        </div>
      </div>

      {error && <div className="form-error">{error}</div>}

      {campaign.description && (
        <p className="section-desc">{campaign.description}</p>
      )}

      {/* Members section */}
      <section className="section">
        <div className="section-header">
          <h3 className="section-title">Members</h3>
          {isGM && !showAddMember && (
            <button className="btn btn-outline btn-sm" onClick={handleShowAddMember} disabled={!online}>
              Add Member
            </button>
          )}
        </div>

        {showAddMember && (
          <div className="add-member-picker">
            {loadingUsers ? (
              <p className="card-meta">Loading users...</p>
            ) : availableUsers.length === 0 ? (
              <div className="add-member-empty">
                <p className="card-meta">All registered users are already members</p>
                <button className="btn btn-outline btn-sm" onClick={() => setShowAddMember(false)}>Close</button>
              </div>
            ) : (
              <>
                <div className="card-list">
                  {availableUsers.map((u) => (
                    <div key={u.userId} className="card member-card">
                      <div className="card-header">
                        <div>
                          <h4 className="card-title">{u.name}</h4>
                          <p className="card-meta">{u.email}</p>
                        </div>
                        <button className="btn btn-primary btn-sm" onClick={() => handleAddMember(u.userId)}>Add</button>
                      </div>
                    </div>
                  ))}
                </div>
                <button className="btn btn-outline btn-sm" onClick={() => setShowAddMember(false)} style={{ marginTop: '0.5rem' }}>Cancel</button>
              </>
            )}
          </div>
        )}

        <div className="card-list">
          {members.map((member) => (
            <div key={member.userId} className="card member-card">
              <div className="card-header">
                <div>
                  <h4 className="card-title">{member.name}</h4>
                </div>
                <div className="member-actions">
                  <span className={`badge ${member.role === 'gm' ? 'badge-gold' : 'badge-dim'}`}>
                    {member.role === 'gm' ? 'GM' : 'Player'}
                  </span>
                  {isGM && member.userId !== user?.userId && (
                    <button
                      className="btn-ghost btn-sm btn-danger"
                      onClick={() => handleRemoveMember(member.userId)}
                      disabled={!online}
                    >
                      Remove
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Upcoming sessions */}
      {upcoming.length > 0 && (
        <section className="section">
          <h3 className="section-title">Upcoming Sessions</h3>
          <div className="card-list">
            {upcoming.map((session) => {
              const days = daysUntil(session.confirmedDate);
              return (
                <Link key={session.sessionId} to={`/sessions/${session.sessionId}`} className="card session-card">
                  <div className="card-header">
                    <h4 className="card-title">{session.title}</h4>
                    <span className={`badge ${days === 0 ? 'badge-gold' : 'badge-dim'}`}>
                      {days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : `In ${days} days`}
                    </span>
                  </div>
                  <p className="card-date">{formatDate(session.confirmedDate)}</p>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {/* Past sessions */}
      {past.length > 0 && (
        <section className="section">
          <h3 className="section-title">Past Sessions</h3>
          <div className="card-list">
            {past.map((session) => (
              <Link key={session.sessionId} to={`/sessions/${session.sessionId}`} className="card session-card session-past">
                <div className="card-header">
                  <h4 className="card-title">{session.title}</h4>
                </div>
                <p className="card-date">{formatDate(session.confirmedDate)}</p>
              </Link>
            ))}
          </div>
        </section>
      )}

      {sessions.length === 0 && (
        <p className="card-meta" style={{ marginTop: '1rem' }}>No sessions yet</p>
      )}
    </div>
  );
}
