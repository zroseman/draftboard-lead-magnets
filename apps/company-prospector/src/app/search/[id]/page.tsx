'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import type { SavedSearch, SavedProspect } from '@/types';
import { formatRelativeTime } from '@/lib/utils';
import { SendToDraftboardModal } from '@/components/SendToDraftboardModal';

type EnrichmentStatus = 'pending' | 'enriching' | 'verified' | 'unverified' | 'failed';

interface EnrichableProspect extends SavedProspect {
  localEnrichmentStatus: EnrichmentStatus;
  enrichedName?: string;
  enrichedLinkedinUrl?: string;
}

// LinkedIn icon component
const LinkedInIcon = ({ url }: { url: string }) => (
  <a
    href={url}
    target="_blank"
    rel="noopener noreferrer"
    className="text-[#0A66C2] hover:text-[#004182] transition-colors"
    title="View LinkedIn Profile"
  >
    <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
    </svg>
  </a>
);

export default function SearchDetailsPage() {
  const params = useParams();
  const searchId = params.id as string;

  const [search, setSearch] = useState<SavedSearch | null>(null);
  const [prospects, setProspects] = useState<EnrichableProspect[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [isEnrichingMore, setIsEnrichingMore] = useState(false);
  const [showModal, setShowModal] = useState(false);

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

        // Map prospects with local enrichment status - NO auto-enrichment
        const mappedProspects: EnrichableProspect[] = data.prospects.map((p: SavedProspect) => ({
          ...p,
          localEnrichmentStatus: (p.enrichmentStatus as EnrichmentStatus) || 'unverified',
        }));
        setProspects(mappedProspects);
        setSelectedIds(new Set(mappedProspects.map((p: EnrichableProspect) => p.id)));
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

  // Parse first name from full name
  const getFirstName = (fullName: string): string => {
    return fullName.split(' ')[0] || fullName;
  };

  // Enrich a single prospect
  const enrichProspect = useCallback(async (prospect: EnrichableProspect): Promise<EnrichableProspect> => {
    try {
      const firstName = getFirstName(prospect.name);

      const res = await fetch('/api/enrich-people-google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          people: [{
            id: prospect.id.toString(),
            first_name: firstName,
            last_name_obfuscated: prospect.name.replace(firstName, '').trim() || '***',
            title: prospect.title,
            company: prospect.company,
            linkedin_url: prospect.linkedinUrl,
          }]
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const enriched = data.enrichedPeople[0];
        // If google_enriched is true, we found a match
        if (enriched.google_enriched) {
          return {
            ...prospect,
            enrichedName: enriched.name || prospect.name,
            enrichedLinkedinUrl: enriched.linkedinUrl || enriched.linkedin_url || prospect.linkedinUrl,
            localEnrichmentStatus: 'verified',
          };
        }
        // If not enriched, mark as failed (don't allow retry)
        return { ...prospect, localEnrichmentStatus: 'failed' };
      }
    } catch (err) {
      console.error('Error enriching prospect:', err);
    }
    // On error, mark as failed
    return { ...prospect, localEnrichmentStatus: 'failed' };
  }, []);

  // Enrich multiple prospects in parallel
  const enrichProspects = useCallback(async (prospectsToEnrich: EnrichableProspect[]) => {
    setProspects(prev => prev.map(p =>
      prospectsToEnrich.some(e => e.id === p.id)
        ? { ...p, localEnrichmentStatus: 'enriching' as const }
        : p
    ));

    const enrichedResults = await Promise.all(
      prospectsToEnrich.map(p => enrichProspect(p))
    );

    setProspects(prev => prev.map(p => {
      const enriched = enrichedResults.find(e => e.id === p.id);
      return enriched || p;
    }));
  }, [enrichProspect]);

  const handleEnrichMore = async (count: number = 5) => {
    const unenrichedProspects = prospects.filter(p =>
      p.localEnrichmentStatus === 'pending' || p.localEnrichmentStatus === 'unverified'
    );
    const toEnrich = count === -1 ? unenrichedProspects : unenrichedProspects.slice(0, count);
    if (toEnrich.length === 0) return;

    setIsEnrichingMore(true);
    await enrichProspects(toEnrich);
    setIsEnrichingMore(false);
  };

  const handleEnrichSingle = async (prospectId: number) => {
    const prospect = prospects.find(p => p.id === prospectId);
    if (!prospect || prospect.localEnrichmentStatus === 'enriching' || prospect.localEnrichmentStatus === 'verified' || prospect.localEnrichmentStatus === 'failed') return;

    setProspects(prev => prev.map(p =>
      p.id === prospectId ? { ...p, localEnrichmentStatus: 'enriching' as const } : p
    ));

    const enriched = await enrichProspect(prospect);
    setProspects(prev => prev.map(p =>
      p.id === prospectId ? enriched : p
    ));
  };

  const toggleSelect = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedIds.size === prospects.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(prospects.map(p => p.id)));
    }
  };

  const renderStatusBadge = (status: EnrichmentStatus) => {
    switch (status) {
      case 'enriching':
        return (
          <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800">
            <span className="mr-1 h-2 w-2 animate-spin rounded-full border border-blue-800 border-t-transparent" />
            Enriching...
          </span>
        );
      case 'verified':
        return (
          <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
            <svg className="mr-1 h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
            Verified
          </span>
        );
      case 'failed':
        return (
          <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">
            Not found
          </span>
        );
      case 'unverified':
        return (
          <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
            Unverified
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-800">
            Pending
          </span>
        );
    }
  };

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

  const selectedProspects = prospects.filter(p => selectedIds.has(p.id));
  const selectedWithLinkedIn = selectedProspects.filter(p => p.linkedinUrl || p.enrichedLinkedinUrl);
  const unenrichedCount = prospects.filter(p =>
    p.localEnrichmentStatus === 'pending' || p.localEnrichmentStatus === 'unverified'
  ).length;
  const enrichingCount = prospects.filter(p => p.localEnrichmentStatus === 'enriching').length;

  // Convert to Prospect type for modal
  const prospectsForModal = selectedWithLinkedIn.map(p => ({
    id: p.id.toString(),
    name: p.enrichedName || p.name,
    title: p.title,
    company: p.company,
    linkedinUrl: p.enrichedLinkedinUrl || p.linkedinUrl || '',
    enrichmentStatus: p.localEnrichmentStatus,
  }));

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
          {enrichingCount > 0 && ` · Enriching ${enrichingCount}...`}
          {unenrichedCount > 0 && enrichingCount === 0 && ` · ${unenrichedCount} can be enriched`}
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

      {/* Enrichment buttons */}
      {unenrichedCount > 0 && (
        <div className="mb-4 flex gap-2">
          <button
            onClick={() => handleEnrichMore(5)}
            disabled={isEnrichingMore || enrichingCount > 0}
            className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {isEnrichingMore || enrichingCount > 0 ? (
              <span className="flex items-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-gray-600 border-t-transparent" />
                Enriching...
              </span>
            ) : (
              `Enrich next ${Math.min(5, unenrichedCount)}`
            )}
          </button>
          <button
            onClick={() => handleEnrichMore(-1)}
            disabled={isEnrichingMore || enrichingCount > 0}
            className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Enrich all ({unenrichedCount})
          </button>
        </div>
      )}

      {/* Prospects list */}
      <div className="rounded-lg border border-gray-200 bg-white">
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={selectedIds.size === prospects.length}
              onChange={toggleAll}
              className="rounded border-gray-300"
            />
            <span className="text-sm text-gray-600">
              {selectedIds.size} of {prospects.length} selected ({selectedWithLinkedIn.length} with LinkedIn)
            </span>
          </label>
        </div>
        <div className="divide-y divide-gray-100 max-h-[600px] overflow-y-auto">
          {prospects.map((prospect) => {
            const linkedinUrl = prospect.enrichedLinkedinUrl || prospect.linkedinUrl;
            return (
              <div key={prospect.id} className="flex items-center gap-4 px-4 py-3 hover:bg-gray-50">
                <input
                  type="checkbox"
                  checked={selectedIds.has(prospect.id)}
                  onChange={() => toggleSelect(prospect.id)}
                  className="rounded border-gray-300"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-900">
                      {prospect.enrichedName || prospect.name}
                    </span>
                    {linkedinUrl && <LinkedInIcon url={linkedinUrl} />}
                    {renderStatusBadge(prospect.localEnrichmentStatus)}
                  </div>
                  <div className="text-sm text-gray-600 truncate">
                    {prospect.title} at <span className="font-medium">{prospect.company}</span>
                  </div>
                </div>
                {(prospect.localEnrichmentStatus === 'unverified' || prospect.localEnrichmentStatus === 'pending') && (
                  <button
                    onClick={() => handleEnrichSingle(prospect.id)}
                    className="text-xs text-blue-600 hover:text-blue-800 hover:underline"
                  >
                    Enrich
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Send to Draftboard */}
      <div className="mt-6">
        <button
          onClick={() => setShowModal(true)}
          disabled={selectedWithLinkedIn.length === 0}
          className="w-full rounded-md bg-blue-600 px-4 py-3 text-white hover:bg-blue-700 disabled:opacity-50"
        >
          Send {selectedWithLinkedIn.length} Prospects to Draftboard
        </button>
        <div className="mt-2 flex items-center justify-center gap-1 text-xs text-gray-500">
          <span>Only prospects with LinkedIn profiles can be sent</span>
          <div className="group relative">
            <svg className="h-4 w-4 cursor-help text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div className="absolute bottom-full left-1/2 mb-2 hidden -translate-x-1/2 rounded-md bg-gray-900 px-3 py-2 text-xs text-white group-hover:block w-64 text-center">
              Draftboard uses LinkedIn profiles to map and score relationships between your team and prospects.
            </div>
          </div>
        </div>
      </div>

      {showModal && (
        <SendToDraftboardModal
          prospects={prospectsForModal}
          companyName={search.sourceCompany}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  );
}
