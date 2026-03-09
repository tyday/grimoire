export interface User {
  userId: string;
  email: string;
  name: string;
}

export interface Campaign {
  campaignId: string;
  name: string;
  description: string;
  createdBy: string;
  createdAt: string;
  role?: 'gm' | 'player'; // Included when listing user's campaigns
}

export interface CampaignMember {
  userId: string;
  name: string;
  role: 'gm' | 'player';
  joinedAt: string;
}

export interface Poll {
  pollId: string;
  title: string;
  mode: 'candidates' | 'open';
  status: 'active' | 'confirmed' | 'cancelled';
  creatorId: string;
  createdAt: string;
  candidateDates?: string[];
  confirmedDate?: string;
  campaignId?: string;
}

export interface PollResponse {
  pollId: string;
  userId: string;
  userName?: string;
  respondedAt: string;
  dates?: Record<string, string>;
  availableDates?: string[];
}

export interface Session {
  sessionId: string;
  pollId: string;
  confirmedDate: string;
  type: string;
  title: string;
  createdAt: string;
  campaignId?: string;
}
