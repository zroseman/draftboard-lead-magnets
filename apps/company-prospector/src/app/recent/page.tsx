'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import SearchCard from '@/components/SearchCard';
import type { SavedSearch } from '@/types';

export default function RecentSearchesPage() {
  const [searches, setSearches] = useState<SavedSearch[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const [companyFilter, setCompanyFilter] = useState('');

  const limit = 12;

  async function fetchSearches(reset = false) {
    const currentOffset = reset ? 0 : offset;
    if (reset) {
      setLoading(true);
    } else {
      setLoadingMore(true);
    }

    try {
      const params = new URLSearchParams({
        limit: limit.toString(),
        offset: currentOffset.toString(),
      });
      if (companyFilter) {
        params.set('company', companyFilter);
      }

      const response = await fetch(`/api/recent-searches?${params}`);

      if (!response.ok) {
        throw new Error('Failed to fetch searches');
      }

      const data = await response.json();

      if (reset) {
        setSearches(data.searches);
        setOffset(limit);
      } else {
        setSearches(prev => [...prev, ...data.searches]);
        setOffset(currentOffset + limit);
      }

      setTotal(data.total);
      setHasMore(data.hasMore);
    } catch (err) {
      console.error('Error fetching searches:', err);
      setError('Failed to load searches');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }

  useEffect(() => {
    fetchSearches(true);
  }, [companyFilter]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      {/* Header */}
      <div className="mb-8">
        <Link href="/" className="text-sm text-gray-500 hover:text-gray-700 mb-4 inline-block">
          &larr; Back to search
        </Link>
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          Recent Searches
        </h1>
        <p className="text-gray-600">
          Browse prospects found by our community
        </p>
      </div>

      {/* Filter */}
      <div className="mb-6">
        <input
          type="text"
          value={companyFilter}
          onChange={(e) => setCompanyFilter(e.target.value)}
          placeholder="Filter by company name..."
          className="w-full max-w-md rounded-md border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none"
        />
      </div>

      {/* Results count */}
      {!loading && (
        <div className="mb-4 text-sm text-gray-600">
          Showing {searches.length} of {total} searches
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
          {error}
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && searches.length === 0 && (
        <div className="rounded-lg border border-gray-200 bg-white p-8 text-center">
          <p className="text-gray-600">No searches found.</p>
        </div>
      )}

      {/* Search cards grid */}
      {!loading && searches.length > 0 && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {searches.map((search) => (
              <SearchCard
                key={search.id}
                searchId={search.id}
                sourceCompany={search.sourceCompany}
                competitorCount={search.competitorCount}
                titlesUsed={search.titlesUsed}
                prospectsCount={search.prospectsCount}
                timestamp={search.searchTimestamp}
              />
            ))}
          </div>

          {/* Load more button */}
          {hasMore && (
            <div className="mt-8 text-center">
              <button
                onClick={() => fetchSearches(false)}
                disabled={loadingMore}
                className="rounded-md border border-gray-300 bg-white px-6 py-2 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                {loadingMore ? (
                  <span className="flex items-center gap-2">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-gray-600 border-t-transparent" />
                    Loading...
                  </span>
                ) : (
                  'Load more'
                )}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
