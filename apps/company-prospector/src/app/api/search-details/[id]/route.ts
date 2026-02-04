import { NextRequest, NextResponse } from 'next/server';
import { getSearchDetails } from '@/lib/db';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const searchId = parseInt(id, 10);

    if (isNaN(searchId)) {
      return NextResponse.json(
        { error: 'Invalid search ID' },
        { status: 400 }
      );
    }

    const result = await getSearchDetails(searchId);

    if (!result) {
      return NextResponse.json(
        { error: 'Search not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error in /api/search-details/[id]:', error);
    return NextResponse.json(
      { error: 'Failed to fetch search details' },
      { status: 500 }
    );
  }
}
