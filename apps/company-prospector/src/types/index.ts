export interface Prospect {
  id: string;
  name: string;
  title: string;
  company: string;
  linkedinUrl: string;
  email?: string;
}

export interface Company {
  id: string;
  name: string;
  domain: string;
  linkedinUrl?: string;
}

export interface DailyCreditStatus {
  isLoggedIn: boolean;
  creditsUsed: number;
  creditsRemaining: number;
  dailyLimit: number;
}

export interface SearchStep {
  step: string;
  status: 'pending' | 'processing' | 'completed' | 'error';
  data?: unknown;
  error?: string;
}
