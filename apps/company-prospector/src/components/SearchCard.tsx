'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { formatRelativeTime } from '@/lib/utils';

interface SearchCardProps {
  searchId: number;
  sourceCompany: string;
  competitorCount: number;
  titlesUsed: string[];
  prospectsCount: number;
  timestamp: string;
}

export default function SearchCard({
  searchId,
  sourceCompany,
  competitorCount,
  titlesUsed,
  prospectsCount,
  timestamp,
}: SearchCardProps) {
  const [relativeTime, setRelativeTime] = useState<string | null>(null);

  useEffect(() => {
    setRelativeTime(formatRelativeTime(timestamp));
  }, [timestamp]);

  return (
    <Link
      href={`/search/${searchId}`}
      className="block bg-white rounded-lg border border-gray-200 hover:border-blue-500 hover:shadow-lg transition-all duration-200 p-5 h-full"
    >
      <div className="flex flex-col h-full">
        {/* Source Company */}
        <h3 className="text-lg font-bold text-gray-900 mb-2">
          {sourceCompany}
        </h3>

        {/* Companies searched */}
        <p className="text-sm text-gray-600 mb-3">
          + {competitorCount} competitor{competitorCount !== 1 ? 's' : ''}
        </p>

        {/* Titles used */}
        <div className="flex flex-wrap gap-1 mb-3">
          {titlesUsed.slice(0, 3).map((title, i) => (
            <span
              key={i}
              className="inline-block px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded"
            >
              {title}
            </span>
          ))}
          {titlesUsed.length > 3 && (
            <span className="inline-block px-2 py-0.5 bg-gray-100 text-gray-500 text-xs rounded">
              +{titlesUsed.length - 3} more
            </span>
          )}
        </div>

        {/* Prospects Count */}
        <div className="flex items-center text-sm text-blue-600 font-medium mb-2">
          <svg
            className="w-4 h-4 mr-1.5 flex-shrink-0"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
            />
          </svg>
          {prospectsCount} prospect{prospectsCount !== 1 ? 's' : ''} found
        </div>

        {/* Timestamp */}
        <div className="flex items-center text-xs text-gray-400 mt-auto">
          <svg
            className="w-3.5 h-3.5 mr-1 flex-shrink-0"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          {relativeTime ?? <span className="bg-gray-200 rounded w-16 h-3 animate-pulse" />}
        </div>
      </div>
    </Link>
  );
}
