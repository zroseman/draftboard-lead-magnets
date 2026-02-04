'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import SearchCard from './SearchCard';
import type { SavedSearch } from '@/types';

interface RecentSearchesSectionProps {
  limit?: number;
}

export default function RecentSearchesSection({ limit = 6 }: RecentSearchesSectionProps) {
  const [searches, setSearches] = useState<SavedSearch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchRecentSearches() {
      try {
        const response = await fetch(`/api/recent-searches?limit=${limit}`);

        if (!response.ok) {
          throw new Error('Failed to fetch recent searches');
        }

        const data = await response.json();
        setSearches(data.searches || []);
      } catch (err) {
        console.error('Error fetching recent searches:', err);
        setError('Failed to load recent searches');
      } finally {
        setLoading(false);
      }
    }

    fetchRecentSearches();
  }, [limit]);

  // Don't render anything if loading
  if (loading) {
    return (
      <div className="py-8">
        <div className="flex items-center justify-center">
          <div className="text-gray-500">Loading recent searches...</div>
        </div>
      </div>
    );
  }

  // Don't render if there's an error or no searches
  if (error || searches.length === 0) {
    return null;
  }

  return (
    <div className="py-8 border-t border-gray-200">
      {/* Section Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-gray-900 mb-1">
            Recent Searches
          </h2>
          <p className="text-sm text-gray-600">
            Explore prospects found by our community
          </p>
        </div>
        <Link
          href="/recent"
          className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition font-medium"
        >
          View All
        </Link>
      </div>

      {/* Search Cards Grid */}
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
    </div>
  );
}
