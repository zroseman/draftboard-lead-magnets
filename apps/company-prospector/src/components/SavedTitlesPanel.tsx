'use client';

import { useState } from 'react';
import type { TitleGroup } from '@/types';

interface SavedTitlesPanelProps {
  titleGroups: TitleGroup[];
  selectedTitles: string[];
  onUpdateGroups: (groups: TitleGroup[]) => void;
  onSelectTitles: (titles: string[]) => void;
}

export function SavedTitlesPanel({
  titleGroups,
  selectedTitles,
  onUpdateGroups,
  onSelectTitles,
}: SavedTitlesPanelProps) {
  const [newTitle, setNewTitle] = useState('');
  const [newGroupName, setNewGroupName] = useState('');
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set((titleGroups || []).map(g => g.id)));
  const [showCreateGroup, setShowCreateGroup] = useState(false);

  // Generate a unique ID
  const generateId = () => `group-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  // Create a new group
  const handleCreateGroup = () => {
    const trimmedName = newGroupName.trim();
    if (!trimmedName) return;

    const newGroup: TitleGroup = {
      id: generateId(),
      name: trimmedName,
      titles: [],
    };

    onUpdateGroups([...titleGroups, newGroup]);
    setNewGroupName('');
    setShowCreateGroup(false);
    setExpandedGroups(prev => new Set([...prev, newGroup.id]));
  };

  // Delete a group
  const handleDeleteGroup = (groupId: string) => {
    const group = titleGroups.find(g => g.id === groupId);
    if (group) {
      // Deselect all titles from this group
      const titlesToRemove = new Set(group.titles);
      onSelectTitles(selectedTitles.filter(t => !titlesToRemove.has(t)));
    }
    onUpdateGroups(titleGroups.filter(g => g.id !== groupId));
  };

  // Rename a group
  const handleRenameGroup = (groupId: string, newName: string) => {
    onUpdateGroups(titleGroups.map(g =>
      g.id === groupId ? { ...g, name: newName } : g
    ));
    setEditingGroupId(null);
  };

  // Add a title to a group
  const handleAddTitle = (groupId: string) => {
    const trimmed = newTitle.trim();
    if (!trimmed) return;

    onUpdateGroups(titleGroups.map(g =>
      g.id === groupId && !g.titles.includes(trimmed)
        ? { ...g, titles: [...g.titles, trimmed] }
        : g
    ));
    setNewTitle('');
  };

  // Remove a title from a group
  const handleRemoveTitle = (groupId: string, title: string) => {
    onUpdateGroups(titleGroups.map(g =>
      g.id === groupId
        ? { ...g, titles: g.titles.filter(t => t !== title) }
        : g
    ));
    // Also deselect the title if it was selected
    if (selectedTitles.includes(title)) {
      onSelectTitles(selectedTitles.filter(t => t !== title));
    }
  };

  // Toggle a title's selection
  const toggleTitle = (title: string) => {
    if (selectedTitles.includes(title)) {
      onSelectTitles(selectedTitles.filter(t => t !== title));
    } else {
      onSelectTitles([...selectedTitles, title]);
    }
  };

  // Select all titles in a group
  const selectGroup = (group: TitleGroup) => {
    const newSelected = new Set(selectedTitles);
    group.titles.forEach(t => newSelected.add(t));
    onSelectTitles(Array.from(newSelected));
  };

  // Deselect all titles in a group
  const deselectGroup = (group: TitleGroup) => {
    const groupTitles = new Set(group.titles);
    onSelectTitles(selectedTitles.filter(t => !groupTitles.has(t)));
  };

  // Check if all titles in a group are selected
  const isGroupFullySelected = (group: TitleGroup) => {
    return group.titles.length > 0 && group.titles.every(t => selectedTitles.includes(t));
  };

  // Check if some titles in a group are selected
  const isGroupPartiallySelected = (group: TitleGroup) => {
    return group.titles.some(t => selectedTitles.includes(t)) && !isGroupFullySelected(group);
  };

  // Toggle group expansion
  const toggleExpand = (groupId: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  };

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-medium text-gray-900">Title Groups</h3>
        <button
          onClick={() => setShowCreateGroup(!showCreateGroup)}
          className="text-xs text-blue-600 hover:underline"
        >
          {showCreateGroup ? 'Cancel' : '+ New Group'}
        </button>
      </div>

      {/* Create new group form */}
      {showCreateGroup && (
        <div className="mb-3 rounded-md border border-blue-200 bg-blue-50 p-3">
          <label className="mb-1 block text-xs font-medium text-gray-700">Group Name</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreateGroup()}
              placeholder="e.g., Heads of Marketing"
              className="flex-1 rounded-md border border-gray-300 px-2 py-1 text-sm focus:border-blue-500 focus:outline-none"
              autoFocus
            />
            <button
              onClick={handleCreateGroup}
              disabled={!newGroupName.trim()}
              className="rounded-md bg-blue-600 px-3 py-1 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
            >
              Create
            </button>
          </div>
        </div>
      )}

      {titleGroups.length === 0 ? (
        <p className="text-sm text-gray-500">
          No title groups yet. Create a group to save and reuse titles across searches.
        </p>
      ) : (
        <div className="space-y-2 max-h-[400px] overflow-y-auto">
          {titleGroups.map((group) => (
            <div key={group.id} className="rounded-md border border-gray-200 bg-gray-50">
              {/* Group header */}
              <div className="flex items-center gap-2 px-3 py-2">
                <button
                  onClick={() => toggleExpand(group.id)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <svg
                    className={`h-4 w-4 transition-transform ${expandedGroups.has(group.id) ? 'rotate-90' : ''}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>

                {/* Group checkbox */}
                <input
                  type="checkbox"
                  checked={isGroupFullySelected(group)}
                  ref={(el) => {
                    if (el) el.indeterminate = isGroupPartiallySelected(group);
                  }}
                  onChange={() => {
                    if (isGroupFullySelected(group)) {
                      deselectGroup(group);
                    } else {
                      selectGroup(group);
                    }
                  }}
                  className="rounded border-gray-300"
                  disabled={group.titles.length === 0}
                />

                {/* Group name (editable) */}
                {editingGroupId === group.id ? (
                  <input
                    type="text"
                    defaultValue={group.name}
                    onBlur={(e) => handleRenameGroup(group.id, e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handleRenameGroup(group.id, (e.target as HTMLInputElement).value);
                      } else if (e.key === 'Escape') {
                        setEditingGroupId(null);
                      }
                    }}
                    className="flex-1 rounded border border-blue-300 px-1 text-sm focus:outline-none"
                    autoFocus
                  />
                ) : (
                  <span
                    className="flex-1 text-sm font-medium text-gray-700 cursor-pointer hover:text-gray-900"
                    onClick={() => toggleExpand(group.id)}
                  >
                    {group.name}
                    <span className="ml-1 text-xs text-gray-400">({group.titles.length})</span>
                  </span>
                )}

                {/* Group actions */}
                <button
                  onClick={() => setEditingGroupId(group.id)}
                  className="text-gray-400 hover:text-gray-600"
                  title="Rename group"
                >
                  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                  </svg>
                </button>
                <button
                  onClick={() => handleDeleteGroup(group.id)}
                  className="text-gray-400 hover:text-red-500"
                  title="Delete group"
                >
                  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>

              {/* Group titles (expanded) */}
              {expandedGroups.has(group.id) && (
                <div className="border-t border-gray-200 px-3 py-2">
                  {group.titles.length === 0 ? (
                    <p className="text-xs text-gray-400 italic mb-2">No titles in this group yet</p>
                  ) : (
                    <div className="space-y-1 mb-2">
                      {group.titles.map((title) => (
                        <div
                          key={title}
                          className="flex items-center gap-2 rounded px-2 py-1 hover:bg-gray-100"
                        >
                          <label className="flex flex-1 cursor-pointer items-center gap-2">
                            <input
                              type="checkbox"
                              checked={selectedTitles.includes(title)}
                              onChange={() => toggleTitle(title)}
                              className="rounded border-gray-300"
                            />
                            <span className="text-xs text-gray-600">{title}</span>
                          </label>
                          <button
                            onClick={() => handleRemoveTitle(group.id, title)}
                            className="text-gray-400 hover:text-red-500"
                          >
                            <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Add title to group */}
                  <div className="flex gap-1">
                    <input
                      type="text"
                      value={newTitle}
                      onChange={(e) => setNewTitle(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddTitle(group.id);
                        }
                      }}
                      placeholder="Add title..."
                      className="flex-1 rounded border border-gray-300 px-2 py-1 text-xs focus:border-blue-500 focus:outline-none"
                    />
                    <button
                      onClick={() => handleAddTitle(group.id)}
                      disabled={!newTitle.trim()}
                      className="rounded bg-gray-200 px-2 py-1 text-xs text-gray-600 hover:bg-gray-300 disabled:opacity-50"
                    >
                      Add
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Selected titles summary */}
      {selectedTitles.length > 0 && (
        <div className="mt-3 border-t border-gray-100 pt-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-gray-700">
              {selectedTitles.length} title{selectedTitles.length !== 1 ? 's' : ''} selected
            </span>
            <button
              onClick={() => onSelectTitles([])}
              className="text-xs text-red-500 hover:underline"
            >
              Clear all
            </button>
          </div>
          <div className="flex flex-wrap gap-1">
            {selectedTitles.slice(0, 5).map((title) => (
              <span
                key={title}
                className="inline-block px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded-full"
              >
                {title}
              </span>
            ))}
            {selectedTitles.length > 5 && (
              <span className="text-xs text-gray-500">+{selectedTitles.length - 5} more</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
