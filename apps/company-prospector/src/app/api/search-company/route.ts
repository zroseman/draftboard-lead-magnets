import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  const { companyName } = await request.json();

  if (!companyName) {
    return NextResponse.json({ error: 'Company name required' }, { status: 400 });
  }

  const response = await fetch('https://api.apollo.io/v1/organizations/search', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.APOLLO_API_KEY!,
    },
    body: JSON.stringify({
      q_organization_name: companyName,
      per_page: 5,
    }),
  });

  if (!response.ok) {
    return NextResponse.json({ error: 'Apollo API error' }, { status: 500 });
  }

  const data = await response.json();
  const organizations = data.organizations || [];

  // Return top matches
  const companies = organizations.map((org: Record<string, unknown>) => ({
    id: org.id,
    name: org.name,
    domain: org.primary_domain || org.website_url,
    linkedinUrl: org.linkedin_url,
    logo: org.logo_url,
    employeeCount: org.estimated_num_employees,
  }));

  return NextResponse.json({ companies });
}
