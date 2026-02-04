export interface Prospect {
  id: string;
  name: string;
  title: string;
  company: string;
  linkedinUrl: string;
  email?: string;
  enrichmentStatus: 'pending' | 'enriching' | 'verified' | 'unverified';
  // Original Apollo data for re-enrichment
  first_name?: string;
  last_name_obfuscated?: string;
}

export interface Company {
  id: string;
  name: string;
  domain: string;
  linkedinUrl?: string;
  logo?: string;
}

export interface ClearoutCompany {
  name: string;
  domain: string;
  logo_url: string | null;
  confidence_score: number;
}

export interface ClearoutResponse {
  data: ClearoutCompany[];
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
