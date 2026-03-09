// =============================================================================
// campaign.tsx — Campaign context and provider
// =============================================================================
// Manages the active campaign selection across the app:
//   - Fetches the user's campaigns on mount
//   - Persists the selected campaign in localStorage
//   - Provides campaign list and switcher to all components
// =============================================================================

import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import type { ReactNode } from 'react';
import type { Campaign } from './types.ts';
import { useAuth } from './auth.tsx';
import * as api from './api.ts';

interface CampaignContextType {
  campaigns: Campaign[];
  activeCampaign: Campaign | null;
  loading: boolean;
  setActiveCampaign: (campaign: Campaign) => void;
  refreshCampaigns: () => Promise<void>;
}

const CampaignContext = createContext<CampaignContextType | null>(null);

const CAMPAIGN_STORAGE_KEY = 'grimoire-active-campaign';

function getStoredCampaign(): Campaign | null {
  const stored = localStorage.getItem(CAMPAIGN_STORAGE_KEY);
  return stored ? JSON.parse(stored) : null;
}

export function CampaignProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [activeCampaign, setActiveCampaignRaw] = useState<Campaign | null>(getStoredCampaign);
  const [loading, setLoading] = useState(true);
  const activeRef = useRef(activeCampaign);

  const setActiveCampaign = useCallback((campaign: Campaign) => {
    activeRef.current = campaign;
    setActiveCampaignRaw(campaign);
    localStorage.setItem(CAMPAIGN_STORAGE_KEY, JSON.stringify(campaign));
  }, []);

  const refreshCampaigns = useCallback(async () => {
    try {
      const list = await api.getCampaigns();
      setCampaigns(list);

      const current = activeRef.current;

      // If stored campaign is no longer in the list, or no campaign selected
      if (!current || !list.find((c) => c.campaignId === current.campaignId)) {
        if (list.length > 0) {
          setActiveCampaign(list[0]);
        } else {
          activeRef.current = null;
          setActiveCampaignRaw(null);
          localStorage.removeItem(CAMPAIGN_STORAGE_KEY);
        }
      }
    } catch (err) {
      console.error('Failed to fetch campaigns:', err);
    } finally {
      setLoading(false);
    }
  }, [setActiveCampaign]);

  // Only fetch campaigns when there's an authenticated user
  useEffect(() => {
    if (user) {
      refreshCampaigns();
    } else {
      setCampaigns([]);
      setActiveCampaignRaw(null);
      activeRef.current = null;
      setLoading(false);
    }
  }, [user, refreshCampaigns]);

  return (
    <CampaignContext.Provider value={{ campaigns, activeCampaign, loading, setActiveCampaign, refreshCampaigns }}>
      {children}
    </CampaignContext.Provider>
  );
}

export function useCampaign(): CampaignContextType {
  const ctx = useContext(CampaignContext);
  if (!ctx) throw new Error('useCampaign must be used within CampaignProvider');
  return ctx;
}
