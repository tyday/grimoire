import { useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate, Link } from 'react-router';
import { useOnline } from '../lib/useOnline.ts';
import { useCampaign } from '../lib/campaign.tsx';
import { createCampaign } from '../lib/api.ts';

export default function Campaigns() {
  const navigate = useNavigate();
  const online = useOnline();
  const { campaigns, setActiveCampaign, refreshCampaigns } = useCampaign();
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSubmitting(true);
    setError('');
    try {
      const campaign = await createCampaign(name.trim(), description.trim());
      await refreshCampaigns();
      setActiveCampaign({ ...campaign, role: 'gm' });
      navigate('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create campaign');
    } finally {
      setSubmitting(false);
    }
  }

  function handleSelect(campaign: typeof campaigns[0]) {
    setActiveCampaign(campaign);
    navigate('/');
  }

  return (
    <div className="campaigns-page">
      <div className="page-header">
        <h2>My Campaigns</h2>
        <div className="page-header-actions">
          <Link to="/campaigns/browse" className="btn btn-outline btn-sm">Browse All</Link>
          {!showCreate && (
            online
              ? <button className="btn btn-primary btn-sm" onClick={() => setShowCreate(true)}>New Campaign</button>
              : <button className="btn btn-primary btn-sm" disabled>Offline</button>
          )}
        </div>
      </div>

      {showCreate && (
        <form onSubmit={handleCreate} className="form campaign-create-form">
          {error && <div className="form-error">{error}</div>}
          <label className="field">
            <span className="field-label">Campaign Name</span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Rise of the Runelords"
              required
              className="field-input"
              autoFocus
            />
          </label>
          <label className="field">
            <span className="field-label">Description (optional)</span>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="A brief description"
              className="field-input"
            />
          </label>
          <div className="form-actions">
            <button type="button" className="btn btn-outline" onClick={() => setShowCreate(false)}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={submitting || !online}>
              {submitting ? 'Creating...' : 'Create'}
            </button>
          </div>
        </form>
      )}

      {campaigns.length === 0 && !showCreate && (
        <div className="empty-state-large">
          <p>No campaigns yet</p>
          <p className="empty-state-sub">Create a campaign to get started</p>
          {online
            ? <button className="btn btn-primary" onClick={() => setShowCreate(true)}>Create Campaign</button>
            : <button className="btn btn-primary" disabled>Offline</button>
          }
        </div>
      )}

      {campaigns.length > 0 && (
        <div className="card-list">
          {campaigns.map((campaign) => (
            <button
              key={campaign.campaignId}
              className="card campaign-card"
              onClick={() => handleSelect(campaign)}
            >
              <div className="card-header">
                <h4 className="card-title">{campaign.name}</h4>
                <span className={`badge ${campaign.role === 'gm' ? 'badge-gold' : 'badge-dim'}`}>
                  {campaign.role === 'gm' ? 'GM' : 'Player'}
                </span>
              </div>
              {campaign.description && (
                <p className="card-meta">{campaign.description}</p>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
