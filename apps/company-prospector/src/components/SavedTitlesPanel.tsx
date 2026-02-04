'use client';

import { useState } from 'react';

interface SavedTitlesPanelProps {
  savedTitles: string[];
  onAddTitle: (title: string) => void;
  onRemoveTitle: (title: string) => void;
  onSelectTitles: (titles: string[]) => void;
  selectedTitles: string[];
}

export function SavedTitlesPanel({
  savedTitles,
  onAddTitle,
  onRemoveTitle,
  onSelectTitles,
  selectedTitles,
}: SavedTitlesPanelProps) {
  const [newTitle, setNewTitle] = useState('');
  const [isEditing, setIsEditing] = useState(false);

  const handleAddTitle = () => {
    const trimmed = newTitle.trim();
    if (trimmed && !savedTitles.includes(trimmed)) {
      onAddTitle(trimmed);
      setNewTitle('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddTitle();
    }
  };

  const toggleTitle = (title: string) => {
    if (selectedTitles.includes(title)) {
      onSelectTitles(selectedTitles.filter(t => t !== title));
    } else {
      onSelectTitles([...selectedTitles, title]);
    }
  };

  const selectAll = () => {
    onSelectTitles([...savedTitles]);
  };

  const deselectAll = () => {
    onSelectTitles([]);
  };

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-medium text-gray-900">Saved Titles</h3>
        <button
          onClick={() => setIsEditing(!isEditing)}
          className="text-xs text-blue-600 hover:underline"
        >
          {isEditing ? 'Done' : 'Edit'}
        </button>
      </div>

      {savedTitles.length === 0 ? (
        <p className="mb-3 text-sm text-gray-500">
          No saved titles yet. Add titles below to reuse them in future searches.
        </p>
      ) : (
        <>
          <div className="mb-3 flex gap-2 text-xs">
            <button onClick={selectAll} className="text-blue-600 hover:underline">
              Select all
            </button>
            <span className="text-gray-300">|</span>
            <button onClick={deselectAll} className="text-blue-600 hover:underline">
              Deselect all
            </button>
          </div>
          <div className="mb-3 space-y-1 max-h-48 overflow-y-auto">
            {savedTitles.map((title) => (
              <div
                key={title}
                className="flex items-center gap-2 rounded px-2 py-1 hover:bg-gray-50"
              >
                {!isEditing ? (
                  <label className="flex flex-1 cursor-pointer items-center gap-2">
                    <input
                      type="checkbox"
                      checked={selectedTitles.includes(title)}
                      onChange={() => toggleTitle(title)}
                      className="rounded border-gray-300"
                    />
                    <span className="text-sm text-gray-700">{title}</span>
                  </label>
                ) : (
                  <>
                    <span className="flex-1 text-sm text-gray-700">{title}</span>
                    <button
                      onClick={() => onRemoveTitle(title)}
                      className="text-red-500 hover:text-red-700"
                      aria-label={`Remove ${title}`}
                    >
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      <div className="border-t border-gray-100 pt-3">
        <div className="flex gap-2">
          <input
            type="text"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Add a title..."
            className="flex-1 rounded-md border border-gray-300 px-2 py-1 text-sm focus:border-blue-500 focus:outline-none"
          />
          <button
            onClick={handleAddTitle}
            disabled={!newTitle.trim()}
            className="rounded-md bg-blue-600 px-3 py-1 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
          >
            Add
          </button>
        </div>
      </div>
    </div>
  );
}
