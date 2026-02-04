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
