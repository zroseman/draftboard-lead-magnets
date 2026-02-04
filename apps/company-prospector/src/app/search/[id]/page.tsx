'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import type { SavedSearch, SavedProspect } from '@/types';
import { formatRelativeTime } from '@/lib/utils';

export default function SearchDetailsPage() {
  const params = useParams();
  const searchId = params.id as string;

  const [search, setSearch] = useState<SavedSearch | null>(null);
  const [prospects, setProspects] = useState<SavedProspect[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchSearchDetails() {
      try {
        const response = await fetch(`/api/search-details/${searchId}`);

        if (!response.ok) {
          if (response.status === 404) {
            setError('Search not found');
          } else {
            throw new Error('Failed to fetch search details');
          }
          return;
        }

        const data = await response.json();
        setSearch(data.search);
        setProspects(data.prospects);
      } catch (err) {
        console.error('Error fetching search details:', err);
        setError('Failed to load search details');
      } finally {
        setLoading(false);
      }
    }

    if (searchId) {
      fetchSearchDetails();
    }
  }, [searchId]);

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-12">
        <div className="flex items-center justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
        </div>
      </div>
    );
  }

  if (error || !search) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-12">
        <div className="rounded-lg border border-gray-200 bg-white p-8 text-center">
          <p className="text-gray-600">{error || 'Search not found'}</p>
          <Link href="/" className="mt-4 inline-block text-blue-600 hover:underline">
            Back to home
          </Link>
        </div>
      </div>
    );
  }

  const prospectsWithLinkedIn = prospects.filter(p => p.linkedinUrl);

  return (
    <div className="mx-auto max-w-4xl px-4 py-12">
      {/* Header */}
      <div className="mb-6">
        <Link href="/" className="text-sm text-gray-500 hover:text-gray-700 mb-4 inline-block">
          &larr; Back to search
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">
          {search.sourceCompany} + {search.competitorCount} competitors
        </h1>
        <p className="text-gray-600">
          {search.prospectsCount} prospects found &middot; {formatRelativeTime(search.searchTimestamp)}
        </p>
      </div>

      {/* Titles used */}
      <div className="mb-6">
        <h2 className="text-sm font-medium text-gray-700 mb-2">Titles searched:</h2>
        <div className="flex flex-wrap gap-2">
          {search.titlesUsed.map((title, i) => (
            <span
              key={i}
              className="inline-block px-3 py-1 bg-blue-100 text-blue-800 text-sm rounded-full"
            >
              {title}
            </span>
          ))}
        </div>
      </div>

      {/* Prospects list */}
      <div className="rounded-lg border border-gray-200 bg-white">
        <div className="border-b border-gray-200 px-4 py-3">
          <span className="text-sm text-gray-600">
            {prospects.length} prospects ({prospectsWithLinkedIn.length} with LinkedIn)
          </span>
        </div>
        <div className="divide-y divide-gray-100 max-h-[600px] overflow-y-auto">
          {prospects.map((prospect) => (
            <div key={prospect.id} className="flex items-center gap-4 px-4 py-3 hover:bg-gray-50">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-gray-900">{prospect.name}</span>
                  {prospect.enrichmentStatus === 'verified' && (
                    <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
                      Verified
                    </span>
                  )}
                </div>
                <div className="text-sm text-gray-600 truncate">
                  {prospect.title} at <span className="font-medium">{prospect.company}</span>
                </div>
              </div>
              {prospect.linkedinUrl && (
                <a
                  href={prospect.linkedinUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-blue-600 hover:underline"
                >
                  LinkedIn
                </a>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
