export interface User {
  userId: string;
  email: string;
  name: string;
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
}
