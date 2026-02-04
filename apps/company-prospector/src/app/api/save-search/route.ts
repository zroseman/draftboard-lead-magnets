import { NextRequest, NextResponse } from 'next/server';
import { saveSearch } from '@/lib/db';
import type { SaveSearchRequest } from '@/types';

export async function POST(request: NextRequest) {
  try {
    const body: SaveSearchRequest = await request.json();

    // Validate required fields
    if (!body.sourceCompany || !body.prospects || body.prospects.length === 0) {
      return NextResponse.json(
        { error: 'Missing required fields: sourceCompany and prospects are required' },
        { status: 400 }
      );
    }

    // Save to database
    const searchId = await saveSearch(body);

    return NextResponse.json(
      { searchId, message: 'Search saved successfully' },
      { status: 201 }
    );
  } catch (error) {
    console.error('Error in /api/save-search:', error);
    return NextResponse.json(
      { error: 'Failed to save search' },
      { status: 500 }
    );
  }
}
