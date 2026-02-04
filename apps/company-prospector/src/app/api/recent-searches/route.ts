import { NextRequest, NextResponse } from 'next/server';
import { getRecentSearches } from '@/lib/db';
import type { GetRecentSearchesResponse } from '@/types';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;

    // Parse query parameters
    const limit = parseInt(searchParams.get('limit') || '6', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);
    const company = searchParams.get('company') || undefined;

    // Validate pagination parameters
    if (limit < 1 || limit > 100) {
      return NextResponse.json(
        { error: 'Limit must be between 1 and 100' },
        { status: 400 }
      );
    }

    if (offset < 0) {
      return NextResponse.json(
        { error: 'Offset must be non-negative' },
        { status: 400 }
      );
    }

    // Fetch searches from database
    const result = await getRecentSearches({ limit, offset, company });

    const response: GetRecentSearchesResponse = {
      searches: result.searches,
      total: result.total,
      hasMore: result.hasMore,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error in /api/recent-searches:', error);
    return NextResponse.json(
      { error: 'Failed to fetch recent searches' },
      { status: 500 }
    );
  }
}
