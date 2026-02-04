import { neon } from '@neondatabase/serverless';
import type { DailyCreditStatus } from '@/types';

function getSql() {
  return neon(process.env.DATABASE_URL!);
}

// Users
export async function getOrCreateUser(email: string, name?: string, image?: string) {
  const sql = getSql();
  const existing = await sql`SELECT * FROM users WHERE email = ${email}`;
  if (existing.length > 0) return existing[0];

  const created = await sql`
    INSERT INTO users (email, name, image)
    VALUES (${email}, ${name || null}, ${image || null})
    RETURNING *
  `;
  return created[0];
}

// Credits - simple daily limit system
const DAILY_LIMIT_ANONYMOUS = 3;
const DAILY_LIMIT_LOGGED_IN = 5;

export async function getDailyCredits(
  userId: number | null,
  ipAddress: string
): Promise<DailyCreditStatus> {
  const sql = getSql();
  const today = new Date().toISOString().split('T')[0];
  const isLoggedIn = userId !== null;
  const dailyLimit = isLoggedIn ? DAILY_LIMIT_LOGGED_IN : DAILY_LIMIT_ANONYMOUS;

  let creditsUsed = 0;

  if (isLoggedIn) {
    const result = await sql`
      SELECT credits_used FROM daily_credits
      WHERE user_id = ${userId} AND date = ${today}
    `;
    creditsUsed = result[0]?.credits_used || 0;
  } else {
    const result = await sql`
      SELECT credits_used FROM daily_credits
      WHERE ip_address = ${ipAddress} AND user_id IS NULL AND date = ${today}
    `;
    creditsUsed = result[0]?.credits_used || 0;
  }

  return {
    isLoggedIn,
    creditsUsed,
    creditsRemaining: Math.max(0, dailyLimit - creditsUsed),
    dailyLimit,
  };
}

export async function useCredit(
  userId: number | null,
  ipAddress: string
): Promise<{ success: boolean; creditsRemaining: number }> {
  // Check credits first
  const beforeStatus = await getDailyCredits(userId, ipAddress);
  if (beforeStatus.creditsRemaining <= 0) {
    return { success: false, creditsRemaining: 0 };
  }

  const sql = getSql();
  const today = new Date().toISOString().split('T')[0];
  const isLoggedIn = userId !== null;
  const dailyLimit = isLoggedIn ? DAILY_LIMIT_LOGGED_IN : DAILY_LIMIT_ANONYMOUS;

  try {
    if (isLoggedIn) {
      await sql`
        INSERT INTO daily_credits (user_id, ip_address, date, credits_used)
        VALUES (${userId}, ${ipAddress}, ${today}, 1)
        ON CONFLICT (user_id, date)
        DO UPDATE SET credits_used = daily_credits.credits_used + 1
        WHERE daily_credits.credits_used < ${dailyLimit}
      `;
    } else {
      await sql`
        INSERT INTO daily_credits (user_id, ip_address, date, credits_used)
        VALUES (${null}, ${ipAddress}, ${today}, 1)
        ON CONFLICT (ip_address, date)
        DO UPDATE SET credits_used = daily_credits.credits_used + 1
        WHERE daily_credits.credits_used < ${dailyLimit}
      `;
    }
  } catch (err) {
    console.error('[useCredit] Error:', err);
  }

  const status = await getDailyCredits(userId, ipAddress);
  return {
    success: true,
    creditsRemaining: status.creditsRemaining,
  };
}

// Searches - log for analytics (noop for now, table doesn't exist yet)
export async function logSearch(
  _userId: number | null,
  _ipAddress: string,
  _company: string,
  _titles: string[],
  _resultCount: number
) {
  // TODO: Create searches table and implement logging
}

// Saved searches
import type { SaveSearchRequest, SavedSearch, SavedProspect } from '@/types';

export async function saveSearch(data: SaveSearchRequest): Promise<number> {
  const sql = getSql();

  // Insert the search
  const searchResult = await sql`
    INSERT INTO prospect_searches (
      source_company,
      source_domain,
      competitors,
      titles_used,
      prospects_count,
      search_timestamp
    ) VALUES (
      ${data.sourceCompany},
      ${data.sourceDomain},
      ${JSON.stringify(data.competitors)},
      ${JSON.stringify(data.titlesUsed)},
      ${data.prospects.length},
      NOW()
    )
    RETURNING id
  `;

  const searchId = searchResult[0].id;

  // Insert prospects
  for (const prospect of data.prospects) {
    await sql`
      INSERT INTO saved_prospects (
        search_id,
        name,
        title,
        company,
        linkedin_url,
        enrichment_status
      ) VALUES (
        ${searchId},
        ${prospect.name},
        ${prospect.title},
        ${prospect.company},
        ${prospect.linkedinUrl},
        ${prospect.enrichmentStatus}
      )
    `;
  }

  return searchId;
}

export async function getRecentSearches(options: {
  limit?: number;
  offset?: number;
  company?: string;
}): Promise<{ searches: SavedSearch[]; total: number; hasMore: boolean }> {
  const sql = getSql();
  const limit = options.limit || 6;
  const offset = options.offset || 0;

  // Build where clause
  let whereClause = '';
  const params: unknown[] = [];

  if (options.company) {
    whereClause = `WHERE source_company ILIKE $1`;
    params.push(`%${options.company}%`);
  }

  // Get total count
  const countResult = options.company
    ? await sql`SELECT COUNT(*) as count FROM prospect_searches WHERE source_company ILIKE ${`%${options.company}%`}`
    : await sql`SELECT COUNT(*) as count FROM prospect_searches`;
  const total = parseInt(countResult[0].count, 10);

  // Get searches
  const searches = options.company
    ? await sql`
        SELECT
          id,
          source_company,
          source_domain,
          competitors,
          titles_used,
          prospects_count,
          search_timestamp
        FROM prospect_searches
        WHERE source_company ILIKE ${`%${options.company}%`}
        ORDER BY search_timestamp DESC
        LIMIT ${limit} OFFSET ${offset}
      `
    : await sql`
        SELECT
          id,
          source_company,
          source_domain,
          competitors,
          titles_used,
          prospects_count,
          search_timestamp
        FROM prospect_searches
        ORDER BY search_timestamp DESC
        LIMIT ${limit} OFFSET ${offset}
      `;

  const mappedSearches: SavedSearch[] = searches.map((row) => ({
    id: row.id,
    sourceCompany: row.source_company,
    sourceDomain: row.source_domain,
    competitorCount: Array.isArray(row.competitors) ? row.competitors.length : 0,
    titlesUsed: row.titles_used || [],
    prospectsCount: row.prospects_count,
    searchTimestamp: row.search_timestamp,
  }));

  return {
    searches: mappedSearches,
    total,
    hasMore: offset + searches.length < total,
  };
}

export async function getSearchDetails(searchId: number): Promise<{
  search: SavedSearch;
  prospects: SavedProspect[];
} | null> {
  const sql = getSql();

  const searchResult = await sql`
    SELECT
      id,
      source_company,
      source_domain,
      competitors,
      titles_used,
      prospects_count,
      search_timestamp
    FROM prospect_searches
    WHERE id = ${searchId}
  `;

  if (searchResult.length === 0) return null;

  const row = searchResult[0];
  const search: SavedSearch = {
    id: row.id,
    sourceCompany: row.source_company,
    sourceDomain: row.source_domain,
    competitorCount: Array.isArray(row.competitors) ? row.competitors.length : 0,
    titlesUsed: row.titles_used || [],
    prospectsCount: row.prospects_count,
    searchTimestamp: row.search_timestamp,
  };

  const prospectsResult = await sql`
    SELECT
      id,
      search_id,
      name,
      title,
      company,
      linkedin_url,
      enrichment_status
    FROM saved_prospects
    WHERE search_id = ${searchId}
    ORDER BY id
  `;

  const prospects: SavedProspect[] = prospectsResult.map((row) => ({
    id: row.id,
    searchId: row.search_id,
    name: row.name,
    title: row.title,
    company: row.company,
    linkedinUrl: row.linkedin_url,
    enrichmentStatus: row.enrichment_status,
  }));

  return { search, prospects };
}
