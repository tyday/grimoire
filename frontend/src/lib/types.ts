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
  visibility?: 'public' | 'private';
  role?: 'gm' | 'player'; // Included when listing user's campaigns
}

export interface BrowseCampaign {
  campaignId: string;
  name: string;
  description: string;
  createdAt: string;
  visibility: 'public' | 'private';
  memberCount: number;
  isMember: boolean;
  role: 'gm' | 'player' | null;
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

export interface SessionNote {
  sessionId: string;
  noteId: string;
  userId: string;
  userName: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}
