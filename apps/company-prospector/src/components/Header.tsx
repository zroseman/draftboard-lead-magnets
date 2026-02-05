'use client';

import { signIn, signOut, useSession } from 'next-auth/react';
import { useEffect, useState } from 'react';
import type { DailyCreditStatus } from '@/types';

export function Header() {
  const { data: session } = useSession();
  const [credits, setCredits] = useState<DailyCreditStatus | null>(null);

  const fetchCredits = async () => {
    const res = await fetch('/api/credits');
    const data = await res.json();
    setCredits(data);
  };

  useEffect(() => {
    fetchCredits();
    window.addEventListener('creditsUpdated', fetchCredits);
    return () => window.removeEventListener('creditsUpdated', fetchCredits);
  }, [session]);

  return (
    <header className="border-b border-gray-200 bg-white">
      <div className="mx-auto max-w-5xl px-4 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-semibold text-gray-900">Lookalike Generator</h1>
          <span className="text-sm text-gray-500">by Draftboard</span>
        </div>
        <div className="flex items-center gap-4">
          {credits && (
            <div className="text-sm text-gray-600">
              <span className="font-medium">{credits.creditsUsed}</span>
              <span className="text-gray-400"> of {credits.dailyLimit} searches used today</span>
            </div>
          )}
          {session ? (
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-600">{session.user?.email}</span>
              <button
                onClick={() => signOut()}
                className="text-sm text-gray-500 hover:text-gray-700"
              >
                Sign out
              </button>
            </div>
          ) : (
            <button
              onClick={() => signIn('google')}
              className="rounded-md bg-gray-900 px-3 py-1.5 text-sm text-white hover:bg-gray-800"
            >
              Sign in
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
