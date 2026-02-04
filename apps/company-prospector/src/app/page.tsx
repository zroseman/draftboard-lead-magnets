'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { SendToDraftboardModal } from '@/components/SendToDraftboardModal';
import { SavedTitlesPanel } from '@/components/SavedTitlesPanel';
import RecentSearchesSection from '@/components/RecentSearchesSection';
import type { Company, Prospect, ClearoutResponse, Competitor } from '@/types';

function useDebouncedValue<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);
  return debouncedValue;
}

// localStorage key for saved titles
const SAVED_TITLES_KEY = 'company-prospector-saved-titles';

type Step = 'company' | 'competitors' | 'titles' | 'searching' | 'results';

export default function Home() {
  const [step, setStep] = useState<Step>('company');

  // Company selection
  const [companyInput, setCompanyInput] = useState('');
  const [companies, setCompanies] = useState<Company[]>([]);
  const [selectedCompany, setSelectedCompany] = useState<Company | null>(null);
  const [isLoadingCompanies, setIsLoadingCompanies] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Competitors
  const [competitors, setCompetitors] = useState<Competitor[]>([]);
  const [isLoadingCompetitors, setIsLoadingCompetitors] = useState(false);

  // Titles
  const [savedTitles, setSavedTitles] = useState<string[]>([]);
  const [selectedTitles, setSelectedTitles] = useState<string[]>([]);

  // Results
  const [prospects, setProspects] = useState<Prospect[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showModal, setShowModal] = useState(false);
  const [error, setError] = useState('');
  const [creditsRemaining, setCreditsRemaining] = useState<number | null>(null);
  const [isEnrichingMore, setIsEnrichingMore] = useState(false);
  const [searchProgress, setSearchProgress] = useState<{ current: number; total: number } | null>(null);

  const debouncedCompanyInput = useDebouncedValue(companyInput, 300);

  // Load saved titles from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem(SAVED_TITLES_KEY);
    if (saved) {
      try {
        const titles = JSON.parse(saved);
        setSavedTitles(titles);
      } catch {
        // Ignore invalid JSON
      }
    }
  }, []);

  // Save titles to localStorage when they change
  useEffect(() => {
    if (savedTitles.length > 0) {
      localStorage.setItem(SAVED_TITLES_KEY, JSON.stringify(savedTitles));
    }
  }, [savedTitles]);

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
    setProspects(prev => prev.map(p =>
      prospectsToEnrich.some(e => e.id === p.id)
        ? { ...p, enrichmentStatus: 'enriching' as const }
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

  const clearSelectedCompany = () => {
    setSelectedCompany(null);
    setCompanyInput('');
    setCompanies([]);
  };

  // Find competitors using AI
  const handleFindCompetitors = async () => {
    if (!selectedCompany) return;
    setError('');
    setIsLoadingCompetitors(true);

    try {
      const res = await fetch('/api/find-competitors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyName: selectedCompany.name,
          companyDomain: selectedCompany.domain,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      // Add the source company as selected, competitors as selected by default
      const competitorsWithSelection: Competitor[] = data.competitors.map((c: Competitor) => ({
        ...c,
        selected: true,
      }));

      setCompetitors(competitorsWithSelection);
      setStep('competitors');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to find competitors');
    } finally {
      setIsLoadingCompetitors(false);
    }
  };

  const toggleCompetitor = (domain: string) => {
    setCompetitors(prev => prev.map(c =>
      c.domain === domain ? { ...c, selected: !c.selected } : c
    ));
  };

  const handleProceedToTitles = () => {
    // Auto-select all saved titles if user has them
    if (savedTitles.length > 0 && selectedTitles.length === 0) {
      setSelectedTitles([...savedTitles]);
    }
    setStep('titles');
  };

  const handleAddSavedTitle = (title: string) => {
    if (!savedTitles.includes(title)) {
      setSavedTitles([...savedTitles, title]);
      // Also select it
      if (!selectedTitles.includes(title)) {
        setSelectedTitles([...selectedTitles, title]);
      }
    }
  };

  const handleRemoveSavedTitle = (title: string) => {
    setSavedTitles(savedTitles.filter(t => t !== title));
    setSelectedTitles(selectedTitles.filter(t => t !== title));
  };

  // Find people across all selected companies
  const handleFindPeople = async () => {
    if (selectedTitles.length === 0) return;

    const selectedCompetitors = competitors.filter(c => c.selected);
    // Include the source company
    const allCompanies = [
      { name: selectedCompany!.name, domain: selectedCompany!.domain },
      ...selectedCompetitors.map(c => ({ name: c.name, domain: c.domain })),
    ];

    setError('');
    setStep('searching');
    setSearchProgress({ current: 0, total: allCompanies.length });

    const allProspects: Prospect[] = [];
    let credits = creditsRemaining;

    for (let i = 0; i < allCompanies.length; i++) {
      const company = allCompanies[i];
      setSearchProgress({ current: i + 1, total: allCompanies.length });

      try {
        const res = await fetch('/api/find-people', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            companyDomain: company.domain,
            companyName: company.name,
            titles: selectedTitles,
          }),
        });

        const data = await res.json();

        if (res.ok) {
          allProspects.push(...data.prospects);
          credits = data.creditsRemaining;
        } else if (res.status === 403) {
          setError('No credits remaining. Sign in for more searches.');
          break;
        }
      } catch (err) {
        console.error('Error searching company:', company.name, err);
      }
    }

    setProspects(allProspects);
    setCreditsRemaining(credits);
    setSelectedIds(new Set(allProspects.map(p => p.id)));
    setSearchProgress(null);
    setStep('results');
    window.dispatchEvent(new CustomEvent('creditsUpdated'));

    // Save the search
    try {
      await fetch('/api/save-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceCompany: selectedCompany!.name,
          sourceDomain: selectedCompany!.domain,
          competitors: selectedCompetitors.map(c => ({ name: c.name, domain: c.domain })),
          titlesUsed: selectedTitles,
          prospects: allProspects.map(p => ({
            name: p.name,
            title: p.title,
            company: p.company,
            linkedinUrl: p.linkedinUrl,
            enrichmentStatus: p.enrichmentStatus,
          })),
        }),
      });
    } catch (err) {
      console.error('Error saving search:', err);
    }

    // Start enriching first 5
    const first5 = allProspects.slice(0, 5);
    if (first5.length > 0) {
      enrichProspects(first5);
    }
  };

  const handleEnrichMore = async (count: number = 5) => {
    const pendingProspects = prospects.filter(p => p.enrichmentStatus === 'pending');
    const toEnrich = count === -1 ? pendingProspects : pendingProspects.slice(0, count);
    if (toEnrich.length === 0) return;

    setIsEnrichingMore(true);
    await enrichProspects(toEnrich);
    setIsEnrichingMore(false);
  };

  const toggleSelect = (id: string) => {
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

  const selectedProspects = prospects.filter(p => selectedIds.has(p.id));
  const pendingCount = prospects.filter(p => p.enrichmentStatus === 'pending').length;
  const enrichingCount = prospects.filter(p => p.enrichmentStatus === 'enriching').length;

  const reset = () => {
    setStep('company');
    setCompanyInput('');
    setCompanies([]);
    setSelectedCompany(null);
    setCompetitors([]);
    setProspects([]);
    setSelectedIds(new Set());
    setError('');
    setShowDropdown(false);
    setSearchProgress(null);
    // Keep selectedTitles for next search
  };

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
          <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
            <svg className="mr-1 h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
            Verified
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

  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <div className="flex gap-8">
        {/* Main content */}
        <div className="flex-1 max-w-3xl">
          {/* Hero */}
          <div className="mb-8 text-center">
            <h1 className="text-3xl font-bold text-gray-900">Competitor Prospector</h1>
            <p className="mt-2 text-gray-600">
              Find decision makers at a company and all its competitors.
            </p>
          </div>

          {error && (
            <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</div>
          )}

          {/* Step 1: Company Input */}
          {step === 'company' && (
            <div className="rounded-lg border border-gray-200 bg-white p-6">
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Enter a company to find its competitors
              </label>
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
                                  (e.target as HTMLImageElement).style.display = 'none';
                                }}
                              />
                            ) : (
                              <div className="flex h-8 w-8 items-center justify-center rounded bg-gray-200 text-xs font-medium text-gray-600">
                                {company.name.charAt(0).toUpperCase()}
                              </div>
                            )}
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

              {selectedCompany && (
                <button
                  onClick={handleFindCompetitors}
                  disabled={isLoadingCompetitors}
                  className="mt-4 w-full rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {isLoadingCompetitors ? (
                    <span className="flex items-center justify-center gap-2">
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                      Finding competitors...
                    </span>
                  ) : (
                    `Find Competitors of ${selectedCompany.name}`
                  )}
                </button>
              )}
            </div>
          )}

          {/* Step 2: Competitors Selection */}
          {step === 'competitors' && (
            <div className="space-y-4">
              <div className="rounded-lg border border-gray-200 bg-white p-6">
                <h2 className="mb-4 text-lg font-medium text-gray-900">
                  Top Competitors of {selectedCompany?.name}
                </h2>
                <p className="mb-4 text-sm text-gray-600">
                  Select which competitors to include in your search:
                </p>

                {/* Source company (always included) */}
                <div className="mb-4 rounded-md border border-blue-200 bg-blue-50 p-3">
                  <div className="flex items-center gap-2">
                    <div className="flex h-6 w-6 items-center justify-center rounded bg-blue-600 text-xs font-bold text-white">
                      1
                    </div>
                    <span className="font-medium text-gray-900">{selectedCompany?.name}</span>
                    <span className="text-sm text-gray-500">({selectedCompany?.domain})</span>
                    <span className="ml-auto text-xs text-blue-600">Source company</span>
                  </div>
                </div>

                <div className="space-y-2">
                  {competitors.map((competitor, index) => (
                    <div
                      key={competitor.domain}
                      className={`rounded-md border p-3 transition-colors ${
                        competitor.selected
                          ? 'border-green-200 bg-green-50'
                          : 'border-gray-200 bg-gray-50'
                      }`}
                    >
                      <label className="flex cursor-pointer items-start gap-3">
                        <input
                          type="checkbox"
                          checked={competitor.selected}
                          onChange={() => toggleCompetitor(competitor.domain)}
                          className="mt-1 rounded border-gray-300"
                        />
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <div className="flex h-6 w-6 items-center justify-center rounded bg-gray-400 text-xs font-bold text-white">
                              {index + 2}
                            </div>
                            <span className="font-medium text-gray-900">{competitor.name}</span>
                            <span className="text-sm text-gray-500">({competitor.domain})</span>
                          </div>
                          <p className="mt-1 text-sm text-gray-600">{competitor.reason}</p>
                        </div>
                      </label>
                    </div>
                  ))}
                </div>

                <div className="mt-4 flex gap-3">
                  <button
                    onClick={() => setStep('company')}
                    className="rounded-md border border-gray-300 px-4 py-2 text-gray-700 hover:bg-gray-50"
                  >
                    Back
                  </button>
                  <button
                    onClick={handleProceedToTitles}
                    className="flex-1 rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
                  >
                    Continue with {competitors.filter(c => c.selected).length + 1} Companies
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Title Selection */}
          {step === 'titles' && (
            <div className="space-y-4">
              <div className="rounded-lg border border-gray-200 bg-white p-6">
                <h2 className="mb-2 text-lg font-medium text-gray-900">Select Job Titles</h2>
                <p className="mb-4 text-sm text-gray-600">
                  Choose the job titles to search for across {competitors.filter(c => c.selected).length + 1} companies:
                </p>

                {selectedTitles.length > 0 && (
                  <div className="mb-4">
                    <div className="flex flex-wrap gap-2">
                      {selectedTitles.map((title) => (
                        <span
                          key={title}
                          className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-3 py-1 text-sm text-blue-800"
                        >
                          {title}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {selectedTitles.length === 0 && (
                  <div className="mb-4 rounded-md bg-yellow-50 p-3 text-sm text-yellow-700">
                    Select titles from the panel on the right, or add new ones there.
                  </div>
                )}

                <div className="flex gap-3">
                  <button
                    onClick={() => setStep('competitors')}
                    className="rounded-md border border-gray-300 px-4 py-2 text-gray-700 hover:bg-gray-50"
                  >
                    Back
                  </button>
                  <button
                    onClick={handleFindPeople}
                    disabled={selectedTitles.length === 0}
                    className="flex-1 rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    Find People
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Step 4: Searching */}
          {step === 'searching' && (
            <div className="rounded-lg border border-gray-200 bg-white p-12 text-center">
              <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
              {searchProgress && (
                <>
                  <p className="text-gray-600">
                    Searching company {searchProgress.current} of {searchProgress.total}...
                  </p>
                  <div className="mx-auto mt-4 h-2 w-64 overflow-hidden rounded-full bg-gray-200">
                    <div
                      className="h-full bg-blue-600 transition-all"
                      style={{ width: `${(searchProgress.current / searchProgress.total) * 100}%` }}
                    />
                  </div>
                </>
              )}
            </div>
          )}

          {/* Step 5: Results */}
          {step === 'results' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-medium text-gray-900">
                    {prospects.length} people found across {competitors.filter(c => c.selected).length + 1} companies
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
                    <div className="divide-y divide-gray-100 max-h-[500px] overflow-y-auto">
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

                  {pendingCount > 0 && (
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleEnrichMore(5)}
                        disabled={isEnrichingMore || enrichingCount > 0}
                        className="flex-1 rounded-md border border-gray-300 bg-white px-4 py-2 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                      >
                        {isEnrichingMore || enrichingCount > 0 ? (
                          <span className="flex items-center justify-center gap-2">
                            <span className="h-4 w-4 animate-spin rounded-full border-2 border-gray-600 border-t-transparent" />
                            Enriching...
                          </span>
                        ) : (
                          `Enrich next ${Math.min(5, pendingCount)}`
                        )}
                      </button>
                      <button
                        onClick={() => handleEnrichMore(-1)}
                        disabled={isEnrichingMore || enrichingCount > 0}
                        className="flex-1 rounded-md border border-gray-300 bg-white px-4 py-2 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                      >
                        Enrich all ({pendingCount})
                      </button>
                    </div>
                  )}

                  {(() => {
                    const selectedWithLinkedIn = selectedProspects.filter(p => p.linkedinUrl);
                    const canSend = selectedWithLinkedIn.length > 0;
                    return (
                      <div className="relative">
                        <button
                          onClick={() => setShowModal(true)}
                          disabled={!canSend}
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
                    );
                  })()}
                </>
              )}

              {prospects.length === 0 && (
                <div className="rounded-lg border border-gray-200 bg-white p-8 text-center">
                  <p className="text-gray-600">No people found with those titles.</p>
                  <button
                    onClick={() => setStep('titles')}
                    className="mt-4 text-sm text-blue-600 hover:underline"
                  >
                    Try different titles
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right sidebar - Saved Titles Panel */}
        <div className="w-72 shrink-0">
          <div className="sticky top-4">
            <SavedTitlesPanel
              savedTitles={savedTitles}
              selectedTitles={selectedTitles}
              onAddTitle={handleAddSavedTitle}
              onRemoveTitle={handleRemoveSavedTitle}
              onSelectTitles={setSelectedTitles}
            />
          </div>
        </div>
      </div>

      {/* Show recent searches on the company input step */}
      {step === 'company' && (
        <RecentSearchesSection limit={6} />
      )}

      {showModal && selectedCompany && (
        <SendToDraftboardModal
          prospects={selectedProspects.filter(p => p.linkedinUrl)}
          companyName={selectedCompany.name}
          onClose={() => setShowModal(false)}
        />
      )}
    </div>
  );
}
