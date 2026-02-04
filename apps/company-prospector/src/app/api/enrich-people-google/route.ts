import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

export async function POST(request: NextRequest) {
  try {
    const { people } = await request.json();

    if (!people || !Array.isArray(people) || people.length === 0) {
      return NextResponse.json(
        { error: 'People array is required' },
        { status: 400 }
      );
    }

    const apiKey = process.env.GOOGLE_CSE_API_KEY;
    const cx = process.env.GOOGLE_CSE_CX;
    const openaiKey = process.env.OPENAI_API_KEY;

    if (!apiKey || !cx) {
      return NextResponse.json(
        { error: 'Google Custom Search API not configured' },
        { status: 500 }
      );
    }

    if (!openaiKey) {
      return NextResponse.json(
        { error: 'OpenAI API key not configured' },
        { status: 500 }
      );
    }

    const openai = new OpenAI({ apiKey: openaiKey });

    console.log('[enrich-people-google] Enriching', people.length, 'people via Google (parallel)');

    // Process all people in parallel for speed
    const enrichedPeople = await Promise.all(
      people.map(async (person: Record<string, unknown>) => {
        try {
          let searchResults = null;
          let usedQuery = '';

          // Simplified query: [first name] [company] [title] linkedin
          const queryParts = [
            person.first_name,
            person.company,
            person.title,
            'linkedin'
          ].filter(Boolean);
          const query = queryParts.join(' ');

          const searchUrl = `https://www.googleapis.com/customsearch/v1?key=${apiKey}&cx=${cx}&q=${encodeURIComponent(query)}&num=5`;
          const searchResponse = await fetch(searchUrl);
          const searchData = await searchResponse.json();

          if (searchResponse.ok && searchData.items && searchData.items.length > 0) {
            // Filter to only LinkedIn profile URLs
            const linkedInResults = searchData.items.filter((item: Record<string, unknown>) =>
              item.link && /linkedin\.com\/in\//i.test(item.link as string)
            );

            if (linkedInResults.length > 0) {
              searchResults = { ...searchData, items: linkedInResults };
              usedQuery = query;
            }
          }

          // If no results found
          if (!searchResults || !searchResults.items || searchResults.items.length === 0) {
            console.log('[enrich-people-google] No LinkedIn profiles found for:', person.first_name);
            return {
              ...person,
              google_enriched: false,
              google_error: 'No LinkedIn profiles found',
              google_query: usedQuery || query,
            };
          }

          // Use OpenAI to extract full name and validate match
          const resultsForPrompt = searchResults.items.slice(0, 3).map((item: Record<string, unknown>, idx: number) => ({
            index: idx,
            title: item.title,
            snippet: item.snippet,
            link: item.link,
          }));

          const prompt = `You are an expert at extracting information from LinkedIn search results.

Given this search for a person:
- First name: ${person.first_name}
- Last name (obfuscated): ${person.last_name_obfuscated || 'unknown'}
- Company: ${person.company}
- Title: ${person.title}

Here are the Google search results:
${JSON.stringify(resultsForPrompt, null, 2)}

Your task:
1. Identify which result (if any) is the correct person
2. Extract their FULL NAME from the result title
3. Extract their LinkedIn URL from the link

Respond with a JSON object:
{
  "bestMatchIndex": <number or null if no good match>,
  "fullName": "First Last" (extracted from title, not constructed),
  "linkedinUrl": "the link from the result",
  "confidence": "high" | "medium" | "low" | "none",
  "reasoning": "Brief explanation"
}

Important: Extract the full name as it appears in the title (e.g., "Guy Benjamin" from "LinkedIn · Guy Benjamin"). Do not construct it from parts.`;

          const completion = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
              {
                role: 'system',
                content: 'You are an expert at analyzing LinkedIn search results. Always respond with valid JSON only.',
              },
              {
                role: 'user',
                content: prompt,
              },
            ],
            response_format: { type: 'json_object' },
            temperature: 0.2,
          });

          const analysis = JSON.parse(completion.choices[0].message.content || '{}');

          if (analysis.bestMatchIndex !== null && analysis.bestMatchIndex >= 0 && analysis.fullName && analysis.linkedinUrl) {
            const nameParts = analysis.fullName.split(' ');
            const firstName = nameParts[0];
            const lastName = nameParts.slice(1).join(' ');

            console.log('[enrich-people-google] ✓ Enriched:', analysis.fullName);
            return {
              ...person,
              name: analysis.fullName,
              first_name: firstName || person.first_name,
              last_name: lastName || person.last_name_obfuscated,
              linkedinUrl: analysis.linkedinUrl,
              linkedin_url: analysis.linkedinUrl,
              google_enriched: true,
              google_confidence: analysis.confidence,
              google_reasoning: analysis.reasoning,
              google_query: usedQuery,
            };
          } else {
            console.log('[enrich-people-google] ✗ No match for:', person.first_name);
            return {
              ...person,
              google_enriched: false,
              google_error: analysis.reasoning || 'No good match found',
              google_query: usedQuery,
            };
          }
        } catch (error: unknown) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          console.error('[enrich-people-google] Error enriching person:', errorMessage);
          return {
            ...person,
            google_enriched: false,
            google_error: errorMessage,
            google_query: 'Error occurred',
          };
        }
      })
    );

    const successCount = enrichedPeople.filter((p) => p.google_enriched).length;
    console.log('[enrich-people-google] Successfully enriched', successCount, 'out of', people.length);

    return NextResponse.json({
      enrichedPeople,
      enrichedCount: successCount,
      totalCount: people.length,
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorStack = error instanceof Error ? error.stack : undefined;
    console.error('[enrich-people-google] Error:', error);
    return NextResponse.json(
      { error: `Failed to enrich people via Google: ${errorMessage}`, stack: errorStack },
      { status: 500 }
    );
  }
}
