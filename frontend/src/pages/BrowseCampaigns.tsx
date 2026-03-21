import { useState, useEffect } from 'react';
import { Link } from 'react-router';
import { useOnline } from '../lib/useOnline.ts';
import { useCampaign } from '../lib/campaign.tsx';
import { browseCampaigns, joinCampaign } from '../lib/api.ts';
import type { BrowseCampaign } from '../lib/types.ts';

export default function BrowseCampaigns() {
  const online = useOnline();
  const { refreshCampaigns } = useCampaign();
  const [campaigns, setCampaigns] = useState<BrowseCampaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    browseCampaigns()
      .then(setCampaigns)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  async function handleJoin(campaignId: string) {
    setJoining(campaignId);
    setError('');
    try {
      await joinCampaign(campaignId);
      await refreshCampaigns();
      // Update the local list to reflect the join
      setCampaigns((prev) =>
        prev.map((c) => (c.campaignId === campaignId ? { ...c, isMember: true, role: 'player' as const, memberCount: c.memberCount + 1 } : c)),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to join');
    } finally {
      setJoining(null);
    }
  }

  if (loading) return <div className="loading">Loading...</div>;

  return (
    <div className="browse-campaigns-page">
      <div className="page-header">
        <h2>Browse Campaigns</h2>
        <Link to="/campaigns" className="btn btn-outline btn-sm">My Campaigns</Link>
      </div>

      {error && <div className="form-error">{error}</div>}

      {campaigns.length === 0 && (
        <div className="empty-state-large">
          <p>No public campaigns</p>
          <p className="empty-state-sub">Create one from the Campaigns page</p>
        </div>
      )}

      {campaigns.length > 0 && (
        <div className="card-list">
          {campaigns.map((campaign) => (
            <div key={campaign.campaignId} className="card campaign-card">
              <div className="card-header">
                <div>
                  <h4 className="card-title">{campaign.name}</h4>
                  <p className="card-meta">
                    {campaign.memberCount} {campaign.memberCount === 1 ? 'member' : 'members'}
                  </p>
                </div>
                <div className="member-actions">
                  {campaign.isMember ? (
                    <>
                      <span className={`badge ${campaign.role === 'gm' ? 'badge-gold' : 'badge-dim'}`}>
                        {campaign.role === 'gm' ? 'GM' : 'Joined'}
                      </span>
                      <Link to={`/campaigns/${campaign.campaignId}`} className="btn btn-outline btn-sm">View</Link>
                    </>
                  ) : (
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={() => handleJoin(campaign.campaignId)}
                      disabled={!online || joining === campaign.campaignId}
                    >
                      {joining === campaign.campaignId ? 'Joining...' : 'Join'}
                    </button>
                  )}
                </div>
              </div>
              {campaign.description && <p className="card-meta">{campaign.description}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
