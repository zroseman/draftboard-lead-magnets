import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

export async function POST(request: NextRequest) {
  try {
    const { companyName, companyDomain } = await request.json();

    if (!companyName) {
      return NextResponse.json(
        { error: 'Company name is required' },
        { status: 400 }
      );
    }

    const openaiKey = process.env.OPENAI_API_KEY;
    if (!openaiKey) {
      return NextResponse.json(
        { error: 'OpenAI API key not configured' },
        { status: 500 }
      );
    }

    const openai = new OpenAI({ apiKey: openaiKey });

    console.log('[find-competitors] Finding competitors for:', companyName);

    const prompt = `You are a sales intelligence expert helping identify competitor companies to prospect into.

Company: ${companyName}${companyDomain ? ` (${companyDomain})` : ''}

Identify the top 5 direct competitors that a sales team would want to sell to.

IMPORTANT RULES:
- Only include INDEPENDENT companies with their own domain (not products or divisions within larger companies)
- Each competitor must be a standalone business that can be sold to independently
- Do NOT include products like "Google Workspace" or "Microsoft Teams" - instead include the parent company if relevant
- Focus on companies of similar size/stage that compete for the same customers
- Prioritize well-funded startups and established mid-market companies over massive enterprises

Return a JSON object with an array of competitors. For each competitor, provide:
- name: The company name (must be an independent company, not a product)
- domain: Their primary website domain (e.g., "stripe.com")
- reason: A brief explanation of why they compete (1 sentence)

Response format:
{
  "competitors": [
    { "name": "Company Name", "domain": "company.com", "reason": "Brief explanation" }
  ]
}`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You are a business analyst. Always respond with valid JSON only.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3,
    });

    const result = JSON.parse(completion.choices[0].message.content || '{}');
    console.log('[find-competitors] Found:', result.competitors?.length || 0, 'competitors');

    return NextResponse.json({
      competitors: result.competitors || [],
      sourceCompany: { name: companyName, domain: companyDomain },
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[find-competitors] Error:', errorMessage);
    return NextResponse.json(
      { error: `Failed to find competitors: ${errorMessage}` },
      { status: 500 }
    );
  }
}
