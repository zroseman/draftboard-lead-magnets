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

export interface Competitor {
  name: string;
  domain: string;
  reason: string;
  selected: boolean;
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

// Saved searches types
export interface SavedSearch {
  id: number;
  sourceCompany: string;
  sourceDomain: string;
  competitorCount: number;
  titlesUsed: string[];
  prospectsCount: number;
  searchTimestamp: string;
}

export interface SavedProspect {
  id: number;
  searchId: number;
  name: string;
  title: string;
  company: string;
  linkedinUrl: string | null;
  enrichmentStatus: string;
}

export interface SaveSearchRequest {
  sourceCompany: string;
  sourceDomain: string;
  competitors: { name: string; domain: string }[];
  titlesUsed: string[];
  prospects: {
    name: string;
    title: string;
    company: string;
    linkedinUrl: string | null;
    enrichmentStatus: string;
  }[];
}

export interface GetRecentSearchesResponse {
  searches: SavedSearch[];
  total: number;
  hasMore: boolean;
}
