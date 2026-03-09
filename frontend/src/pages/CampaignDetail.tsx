import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router';
import { useAuth } from '../lib/auth.tsx';
import { useOnline } from '../lib/useOnline.ts';
import { useCampaign } from '../lib/campaign.tsx';
import { getCampaign, removeCampaignMember } from '../lib/api.ts';
import type { Campaign, CampaignMember } from '../lib/types.ts';

export default function CampaignDetail() {
  const { campaignId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const online = useOnline();
  const { refreshCampaigns } = useCampaign();
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [members, setMembers] = useState<CampaignMember[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!campaignId) return;
    getCampaign(campaignId)
      .then(({ campaign, members }) => {
        setCampaign(campaign);
        setMembers(members);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [campaignId]);

  async function handleRemoveMember(userId: string) {
    if (!campaignId) return;
    try {
      await removeCampaignMember(campaignId, userId);
      setMembers(members.filter((m) => m.userId !== userId));
      // If removing ourselves, refresh campaigns and go home
      if (userId === user?.userId) {
        await refreshCampaigns();
        navigate('/');
      }
    } catch (err) {
      console.error('Failed to remove member:', err);
    }
  }

  if (loading) return <div className="loading">Loading...</div>;
  if (!campaign) return <div className="loading">Campaign not found</div>;

  return (
    <div className="campaign-detail-page">
      <div className="page-header">
        <h2>{campaign.name}</h2>
      </div>

      {campaign.description && (
        <p className="section-desc">{campaign.description}</p>
      )}

      <section className="section">
        <h3 className="section-title">Members</h3>
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
                  {member.userId !== user?.userId && (
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
    </div>
  );
}
