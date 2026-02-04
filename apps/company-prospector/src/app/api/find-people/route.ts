import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { useCredit, logSearch } from '@/lib/db';

function getIpAddress(request: NextRequest): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0] ||
    request.headers.get('x-real-ip') ||
    'unknown'
  );
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id ? parseInt(session.user.id) : null;
  const ipAddress = getIpAddress(request);

  const { companyDomain, companyName, titles } = await request.json();

  if (!companyDomain || !titles || titles.length === 0) {
    return NextResponse.json({ error: 'Company domain and titles required' }, { status: 400 });
  }

  // Use a credit
  const creditResult = await useCredit(userId, ipAddress);
  if (!creditResult.success) {
    return NextResponse.json(
      { error: 'No credits remaining', creditsRemaining: 0 },
      { status: 403 }
    );
  }

  // Search Apollo for people
  const response = await fetch('https://api.apollo.io/api/v1/mixed_people/api_search', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.APOLLO_API_KEY!,
    },
    body: JSON.stringify({
      q_organization_domains: companyDomain,
      person_titles: titles,
      per_page: 25,
      include_similar_titles: true,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[find-people] Apollo error:', response.status, errorText);
    return NextResponse.json({ error: 'Apollo API error' }, { status: 500 });
  }

  const data = await response.json();
  const people = data.people || [];

  const prospects = people.map((person: Record<string, unknown>) => ({
    id: person.id || `${person.first_name}-${person.last_name_obfuscated}`,
    name: `${person.first_name || ''} ${person.last_name || person.last_name_obfuscated || ''}`.trim(),
    title: person.title,
    company: (person.organization as Record<string, unknown>)?.name || companyName,
    linkedinUrl: person.linkedin_url,
    email: person.email,
  }));

  // Log the search
  await logSearch(userId, ipAddress, companyName, titles, prospects.length);

  return NextResponse.json({
    prospects,
    creditsRemaining: creditResult.creditsRemaining,
  });
}
