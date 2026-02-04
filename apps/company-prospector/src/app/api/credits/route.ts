import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getDailyCredits } from '@/lib/db';

function getIpAddress(request: NextRequest): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0] ||
    request.headers.get('x-real-ip') ||
    'unknown'
  );
}

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id ? parseInt(session.user.id) : null;
  const ipAddress = getIpAddress(request);

  const credits = await getDailyCredits(userId, ipAddress);

  return NextResponse.json(credits);
}
