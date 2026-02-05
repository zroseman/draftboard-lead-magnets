'use client';

import { useState, useEffect } from 'react';
import type { Prospect } from '@/types';

interface Props {
  prospects: Prospect[];
  companyName: string;
  onClose: () => void;
}

export function SendToDraftboardModal({ prospects, companyName, onClose }: Props) {
  const [tab, setTab] = useState<'manual' | 'api'>('api');
  const [apiKey, setApiKey] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    const stored = localStorage.getItem('draftboard_api_key');
    if (stored) setApiKey(stored);
  }, []);

  const linkedinUrls = prospects.map((p) => p.linkedinUrl).filter(Boolean);
  const tag = `lookalike-generator-${companyName.toLowerCase().replace(/\s+/g, '-')}`;

  const handleSendApi = async () => {
    if (!apiKey.trim()) return;

    localStorage.setItem('draftboard_api_key', apiKey);
    setStatus('loading');
    setErrorMessage('');

    try {
      const res = await fetch('https://intros.draftboard.com/api/v1/integration/targets/import', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          linkedinUrls,
          tags: ['lead-magnet', tag],
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to import');
      }

      setStatus('success');
    } catch (err) {
      setStatus('error');
      setErrorMessage(err instanceof Error ? err.message : 'Failed to send');
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(linkedinUrls.join('\n'));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-lg rounded-lg bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Send to Draftboard</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            &times;
          </button>
        </div>

        <div className="mb-4 border-b border-gray-200">
          <div className="flex gap-4">
            <button
              onClick={() => setTab('api')}
              className={`pb-2 text-sm font-medium ${
                tab === 'api'
                  ? 'border-b-2 border-blue-600 text-blue-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              API Import
            </button>
            <button
              onClick={() => setTab('manual')}
              className={`pb-2 text-sm font-medium ${
                tab === 'manual'
                  ? 'border-b-2 border-blue-600 text-blue-600'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              Manual Copy
            </button>
          </div>
        </div>

        {tab === 'api' && (
          <div className="space-y-4">
            {status === 'success' ? (
              <div className="rounded-md bg-green-50 p-4 text-center">
                <p className="font-medium text-green-800">
                  {prospects.length} prospects added to Draftboard
                </p>
                <p className="mt-1 text-sm text-green-600">Tagged with: {tag}</p>
              </div>
            ) : (
              <>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    Draftboard API Key
                  </label>
                  <input
                    type="password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="Enter your API key"
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    Get your API key from{' '}
                    <a
                      href="https://intros.draftboard.com/api"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline"
                    >
                      Draftboard API Documentation
                    </a>
                  </p>
                </div>

                {status === 'error' && (
                  <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">{errorMessage}</div>
                )}

                <button
                  onClick={handleSendApi}
                  disabled={!apiKey.trim() || status === 'loading'}
                  className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {status === 'loading' ? 'Sending...' : `Send ${prospects.length} Prospects`}
                </button>
              </>
            )}
          </div>
        )}

        {tab === 'manual' && (
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                LinkedIn URLs ({linkedinUrls.length})
              </label>
              <textarea
                readOnly
                value={linkedinUrls.join('\n')}
                className="h-32 w-full rounded-md border border-gray-300 bg-gray-50 px-3 py-2 font-mono text-xs"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleCopy}
                className="flex-1 rounded-md border border-gray-300 px-4 py-2 text-sm font-medium hover:bg-gray-50"
              >
                Copy URLs
              </button>
              <a
                href="https://intros.draftboard.com"
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 rounded-md bg-blue-600 px-4 py-2 text-center text-sm font-medium text-white hover:bg-blue-700"
              >
                Open Draftboard
              </a>
            </div>
          </div>
        )}

        {status === 'success' && (
          <button
            onClick={onClose}
            className="mt-4 w-full rounded-md border border-gray-300 px-4 py-2 text-sm font-medium hover:bg-gray-50"
          >
            Done
          </button>
        )}
      </div>
    </div>
  );
}
