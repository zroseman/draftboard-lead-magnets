'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { SendToDraftboardModal } from '@/components/SendToDraftboardModal';
import type { Company, Prospect, ClearoutResponse } from '@/types';

function useDebouncedValue<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);
  return debouncedValue;
}

type Step = 'input' | 'searching' | 'results';

export default function Home() {
  const [step, setStep] = useState<Step>('input');
  const [companyInput, setCompanyInput] = useState('');
  const [titles, setTitles] = useState<string[]>([]);
  const [titleInput, setTitleInput] = useState('');
  const [companies, setCompanies] = useState<Company[]>([]);
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showModal, setShowModal] = useState(false);
  const [error, setError] = useState('');
  const [creditsRemaining, setCreditsRemaining] = useState<number | null>(null);
  const [isLoadingCompanies, setIsLoadingCompanies] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [isEnrichingMore, setIsEnrichingMore] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const debouncedCompanyInput = useDebouncedValue(companyInput, 300);

  // Enrich a single prospect
  const enrichProspect = useCallback(async (prospect: Prospect): Promise<Prospect> => {
    try {
      const res = await fetch('/api/enrich-people-google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          people: [{
            id: prospect.id,
            first_name: prospect.first_name,
            last_name_obfuscated: prospect.last_name_obfuscated,
            title: prospect.title,
            company: prospect.company,
            linkedin_url: prospect.linkedinUrl,
          }]
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const enriched = data.enrichedPeople[0];
        return {
          ...prospect,
          name: enriched.name || prospect.name,
          linkedinUrl: enriched.linkedinUrl || enriched.linkedin_url || prospect.linkedinUrl,
          enrichmentStatus: enriched.google_enriched ? 'verified' : 'unverified',
        };
      }
    } catch (err) {
      console.error('Error enriching prospect:', err);
    }
    return { ...prospect, enrichmentStatus: 'unverified' };
  }, []);

  // Enrich multiple prospects in parallel
  const enrichProspects = useCallback(async (prospectsToEnrich: Prospect[]) => {
    // Mark them as enriching
    setProspects(prev => prev.map(p =>
      prospectsToEnrich.some(e => e.id === p.id)
        ? { ...p, enrichmentStatus: 'enriching' as const }
        : p
    ));

    // Enrich all in parallel
    const enrichedResults = await Promise.all(
      prospectsToEnrich.map(p => enrichProspect(p))
    );

    // Update with results
    setProspects(prev => prev.map(p => {
      const enriched = enrichedResults.find(e => e.id === p.id);
      return enriched || p;
    }));
  }, [enrichProspect]);

  // Fetch companies from Clearout as user types
  useEffect(() => {
    const fetchCompanies = async () => {
      if (debouncedCompanyInput.length < 2) {
        setCompanies([]);
        setShowDropdown(false);
        return;
      }

      setIsLoadingCompanies(true);
      try {
        const res = await fetch(
          `https://api.clearout.io/public/companies/autocomplete?query=${encodeURIComponent(debouncedCompanyInput)}`
        );
        const data: ClearoutResponse = await res.json();

        const mappedCompanies: Company[] = data.data.map((c, index) => ({
          id: `${c.domain}-${index}`,
          name: c.name,
          domain: c.domain,
          logo: c.logo_url || undefined,
        }));

        setCompanies(mappedCompanies);
        setShowDropdown(mappedCompanies.length > 0);
      } catch {
        setCompanies([]);
        setShowDropdown(false);
      } finally {
        setIsLoadingCompanies(false);
      }
    };

    if (!selectedCompany) {
      fetchCompanies();
    }
  }, [debouncedCompanyInput, selectedCompany]);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelectCompany = (company: Company) => {
    setSelectedCompany(company);
    setCompanyInput(company.name);
    setShowDropdown(false);
  };

  const handleAddTitle = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const trimmed = titleInput.trim();
      if (trimmed && titles.length < 5 && !titles.includes(trimmed)) {
        setTitles([...titles, trimmed]);
        setTitleInput('');
      }
    }
  };

  const removeTitle = (index: number) => {
    setTitles(titles.filter((_, i) => i !== index));
  };

  const handleFindPeople = async () => {
    if (!selectedCompany || titles.length === 0) return;
    setError('');
    setStep('searching');

    try {
      const res = await fetch('/api/find-people', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyDomain: selectedCompany.domain,
          companyName: selectedCompany.name,
          titles,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        if (res.status === 403) {
          setError('No credits remaining. Sign in for more searches.');
          setStep('results');
          return;
        }
        throw new Error(data.error);
      }

      // Show results immediately
      const allProspects: Prospect[] = data.prospects;
      setProspects(allProspects);
      setCreditsRemaining(data.creditsRemaining);
      setSelectedIds(new Set(allProspects.map((p: Prospect) => p.id)));
      setStep('results');
      window.dispatchEvent(new CustomEvent('creditsUpdated'));

      // Start enriching first 5 in background
      const first5 = allProspects.slice(0, 5);
      if (first5.length > 0) {
        enrichProspects(first5);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed');
      setStep('input');
    }
  };

  const handleEnrichMore = async () => {
    // Find pending prospects (not yet enriched)
    const pendingProspects = prospects.filter(p => p.enrichmentStatus === 'pending');
    const next5 = pendingProspects.slice(0, 5);

    if (next5.length === 0) return;

    setIsEnrichingMore(true);
    await enrichProspects(next5);
    setIsEnrichingMore(false);
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
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
      setSelectedIds(new Set(prospects.map((p) => p.id)));
    }
  };

  const selectedProspects = prospects.filter((p) => selectedIds.has(p.id));
  const pendingCount = prospects.filter(p => p.enrichmentStatus === 'pending').length;
  const enrichingCount = prospects.filter(p => p.enrichmentStatus === 'enriching').length;

  const reset = () => {
    setStep('input');
    setCompanyInput('');
    setTitles([]);
    setTitleInput('');
    setCompanies([]);
    setSelectedCompany(null);
    setProspects([]);
    setSelectedIds(new Set());
    setError('');
    setShowDropdown(false);
  };

  const clearSelectedCompany = () => {
    setSelectedCompany(null);
    setCompanyInput('');
    setCompanies([]);
  };

  // Render enrichment status badge
  const renderStatusBadge = (status: Prospect['enrichmentStatus']) => {
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
          <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800" title="Name verified via LinkedIn">
            <svg className="mr-1 h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
            Verified
          </span>
        );
      case 'unverified':
        return (
          <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600" title="Could not verify via LinkedIn">
            Unverified
          </span>
        );
      case 'pending':
      default:
        return (
          <span className="inline-flex items-center rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-800" title="Not yet enriched">
            Pending
          </span>
        );
    }
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      {/* Hero */}
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-bold text-gray-900">Find Decision Makers</h1>
        <p className="mt-2 text-gray-600">
          Enter a company and job titles to find the right people to reach out to.
        </p>
      </div>

      {error && (
        <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}

      {/* Step 1: Company Input + Titles */}
      {step === 'input' && (
        <div className="space-y-4">
          <div className="rounded-lg border border-gray-200 bg-white p-6">
            <label className="mb-1 block text-sm font-medium text-gray-700">Company Name</label>
            <div className="relative" ref={dropdownRef}>
              {selectedCompany ? (
                <div className="flex items-center gap-3 rounded-md border border-blue-500 bg-blue-50 px-3 py-2">
                  {selectedCompany.logo ? (
                    <img
                      src={selectedCompany.logo}
                      alt=""
                      className="h-8 w-8 rounded object-contain"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                      }}
                    />
                  ) : (
                    <div className="flex h-8 w-8 items-center justify-center rounded bg-gray-200 text-xs font-medium text-gray-600">
                      {selectedCompany.name.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="flex-1">
                    <div className="font-medium text-gray-900">{selectedCompany.name}</div>
                    <div className="text-sm text-gray-500">{selectedCompany.domain}</div>
                  </div>
                  <button
                    onClick={clearSelectedCompany}
                    className="text-gray-400 hover:text-gray-600"
                    aria-label="Clear selection"
                  >
                    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ) : (
                <>
                  <div className="relative">
                    <input
                      type="text"
                      value={companyInput}
                      onChange={(e) => {
                        setCompanyInput(e.target.value);
                        setSelectedCompany(null);
                      }}
                      onFocus={() => companies.length > 0 && setShowDropdown(true)}
                      placeholder="e.g. Stripe, Notion, Figma"
                      className="w-full rounded-md border border-gray-300 px-3 py-2 pr-10 focus:border-blue-500 focus:outline-none"
                    />
                    {isLoadingCompanies && (
                      <div className="absolute right-3 top-1/2 -translate-y-1/2">
                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
                      </div>
                    )}
                  </div>

                  {showDropdown && companies.length > 0 && (
                    <div className="absolute z-10 mt-1 w-full rounded-md border border-gray-200 bg-white shadow-lg">
                      {companies.map((company) => (
                        <button
                          key={company.id}
                          onClick={() => handleSelectCompany(company)}
                          className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-gray-50"
                        >
                          {company.logo ? (
                            <img
                              src={company.logo}
                              alt=""
                              className="h-8 w-8 rounded object-contain"
                              onError={(e) => {
                                const target = e.target as HTMLImageElement;
                                target.style.display = 'none';
                                target.nextElementSibling?.classList.remove('hidden');
                              }}
                            />
                          ) : null}
                          <div
                            className={`flex h-8 w-8 items-center justify-center rounded bg-gray-200 text-xs font-medium text-gray-600 ${company.logo ? 'hidden' : ''}`}
                          >
                            {company.name.charAt(0).toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-gray-900 truncate">{company.name}</div>
                            <div className="text-sm text-gray-500 truncate">{company.domain}</div>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {selectedCompany && (
            <div className="rounded-lg border border-gray-200 bg-white p-6">
              <div className="mb-1 flex items-center justify-between">
                <label className="block text-sm font-medium text-gray-700">
                  Job Titles to Find
                </label>
                <span className="text-xs text-gray-500">{titles.length}/5 titles</span>
              </div>
              {titles.length > 0 && (
                <div className="mb-2 flex flex-wrap gap-2">
                  {titles.map((title, index) => (
                    <span
                      key={index}
                      className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-3 py-1 text-sm text-blue-800"
                    >
                      {title}
                      <button
                        type="button"
                        onClick={() => removeTitle(index)}
                        className="ml-1 hover:text-blue-600"
                        aria-label={`Remove ${title}`}
                      >
                        <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <input
                type="text"
                value={titleInput}
                onChange={(e) => setTitleInput(e.target.value)}
                onKeyDown={handleAddTitle}
                placeholder={titles.length >= 5 ? 'Maximum titles reached' : 'Type a title and press Enter'}
                disabled={titles.length >= 5}
                className="w-full rounded-md border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none disabled:bg-gray-100 disabled:text-gray-500"
              />
              <button
                onClick={handleFindPeople}
                disabled={titles.length === 0}
                className="mt-4 w-full rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
              >
                Find People at {selectedCompany.name}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Step 2: Searching */}
      {step === 'searching' && (
        <div className="rounded-lg border border-gray-200 bg-white p-12 text-center">
          <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
          <p className="text-gray-600">Searching for people at {selectedCompany?.name}...</p>
        </div>
      )}

      {/* Step 3: Results */}
      {step === 'results' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-medium text-gray-900">
                {prospects.length} people found at {selectedCompany?.name}
              </h2>
              <p className="text-sm text-gray-500">
                {enrichingCount > 0 && `Enriching ${enrichingCount}... `}
                {pendingCount > 0 && `${pendingCount} pending enrichment`}
                {pendingCount === 0 && enrichingCount === 0 && 'All enriched'}
                {creditsRemaining !== null && ` · ${creditsRemaining} searches remaining`}
              </p>
            </div>
            <button onClick={reset} className="text-sm text-gray-500 hover:text-gray-700">
              New search
            </button>
          </div>

          {prospects.length > 0 && (
            <>
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
                      {selectedIds.size} of {prospects.length} selected
                    </span>
                  </label>
                </div>
                <div className="divide-y divide-gray-100">
                  {prospects.map((prospect) => (
                    <div
                      key={prospect.id}
                      className="flex items-center gap-4 px-4 py-3 hover:bg-gray-50"
                    >
                      <input
                        type="checkbox"
                        checked={selectedIds.has(prospect.id)}
                        onChange={() => toggleSelect(prospect.id)}
                        className="rounded border-gray-300"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-gray-900">{prospect.name}</span>
                          {renderStatusBadge(prospect.enrichmentStatus)}
                        </div>
                        <div className="text-sm text-gray-600 truncate">{prospect.title}</div>
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

              {pendingCount > 0 && (
                <button
                  onClick={handleEnrichMore}
                  disabled={isEnrichingMore || enrichingCount > 0}
                  className="w-full rounded-md border border-gray-300 bg-white px-4 py-2 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  {isEnrichingMore || enrichingCount > 0 ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-gray-600 border-t-transparent" />
                      Enriching...
                    </span>
                  ) : (
                    `Enrich next ${Math.min(5, pendingCount)} results`
                  )}
                </button>
              )}

              <button
                onClick={() => setShowModal(true)}
                disabled={selectedIds.size === 0}
                className="w-full rounded-md bg-blue-600 px-4 py-3 text-white hover:bg-blue-700 disabled:opacity-50"
              >
                Send {selectedIds.size} Prospects to Draftboard
              </button>
            </>
          )}

          {prospects.length === 0 && (
            <div className="rounded-lg border border-gray-200 bg-white p-8 text-center">
              <p className="text-gray-600">No people found with those titles at this company.</p>
              <button
                onClick={() => setStep('input')}
                className="mt-4 text-sm text-blue-600 hover:underline"
              >
                Try different titles
              </button>
            </div>
          )}
        </div>
      )}

      {showModal && selectedCompany && (
        <SendToDraftboardModal
          prospects={selectedProspects}
          companyName={selectedCompany.name}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  );
}
