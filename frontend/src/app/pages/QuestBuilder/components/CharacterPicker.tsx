import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, ChevronUp, Check, X, Search, Plus } from 'lucide-react';
import { CharacterKind, CharacterRecord } from '../../../api/characterApi';

interface CharacterPickerProps {
  label: string;
  icon: React.ElementType;
  kind: CharacterKind;
  characters: CharacterRecord[]; // already filtered to `kind`
  selectedIds: string[];
  onToggle: (id: string) => void;
  loading?: boolean;
  projectId: string;
  questId: string;
  nodeId: string;
}

/**
 * Node character selector: pick existing project characters of a given kind, or
 * jump to the full Characters page to create a new one. The "+ Create new" path
 * carries ?returnTo=quest:<questId>:<nodeId> so the new character is attached to
 * this node on return.
 */
export function CharacterPicker({
  label, icon: Icon, kind, characters, selectedIds, onToggle, loading,
  projectId, questId, nodeId,
}: CharacterPickerProps) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const filtered = characters.filter((c) =>
    c.name.toLowerCase().includes(query.trim().toLowerCase()),
  );

  const createNew = () => {
    if (!projectId) return;
    navigate(`/projects/${projectId}/characters?create=${kind}&returnTo=quest:${questId}:${nodeId}`);
  };

  return (
    <div>
      <label className="text-zinc-400 text-xs uppercase tracking-wide mb-2 flex items-center gap-1.5">
        <Icon className="w-3.5 h-3.5" />
        {label}
      </label>

      {/* Selected chips */}
      {selectedIds.length > 0 && !loading && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {selectedIds.map((id) => {
            const c = characters.find((it) => it._id === id);
            if (!c) return null;
            return (
              <span
                key={id}
                className="inline-flex items-center gap-1 text-xs bg-purple-500/10 text-purple-300 border border-purple-500/30 px-2 py-0.5 rounded-full"
              >
                {c.name}
                <button type="button" onClick={() => onToggle(id)} className="ml-0.5 hover:text-white transition-colors">
                  <X className="w-2.5 h-2.5" />
                </button>
              </span>
            );
          })}
        </div>
      )}

      {/* Dropdown toggle */}
      <button
        type="button"
        onClick={() => !loading && setOpen((v) => !v)}
        disabled={loading}
        className="w-full flex items-center justify-between px-3 py-2.5 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-300 hover:border-zinc-600 transition-colors disabled:opacity-50 disabled:cursor-wait"
      >
        <span className="text-zinc-500">
          {loading ? 'Loading…' : selectedIds.length > 0 ? `${selectedIds.length} selected` : `Select ${label.toLowerCase()}…`}
        </span>
        {open ? <ChevronUp className="w-4 h-4 text-zinc-500" /> : <ChevronDown className="w-4 h-4 text-zinc-500" />}
      </button>

      {/* Dropdown list */}
      {open && !loading && (
        <div className="mt-1 bg-zinc-800 border border-zinc-700 rounded-lg overflow-hidden shadow-xl">
          {/* Search */}
          <div className="flex items-center gap-2 px-3 py-2 border-b border-zinc-700/60">
            <Search className="w-3.5 h-3.5 text-zinc-500" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search…"
              className="flex-1 bg-transparent text-sm text-white placeholder-zinc-600 focus:outline-none"
            />
          </div>

          {/* Create new */}
          <button
            type="button"
            onClick={createNew}
            className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-purple-300 hover:bg-zinc-700 transition-colors text-left border-b border-zinc-700/60"
          >
            <Plus className="w-4 h-4" />
            Create new {kind === 'monster' ? 'monster' : 'NPC'}
          </button>

          {/* Options */}
          <div className="max-h-56 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="px-3 py-3 text-xs text-zinc-500 italic">
                {characters.length === 0 ? `No ${kind === 'monster' ? 'monsters' : 'NPCs'} in this project yet` : 'No matches'}
              </div>
            ) : (
              filtered.map((c) => {
                const selected = selectedIds.includes(c._id);
                return (
                  <button
                    key={c._id}
                    type="button"
                    onClick={() => onToggle(c._id)}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm hover:bg-zinc-700 transition-colors text-left"
                  >
                    <div className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${
                      selected ? 'bg-purple-600 border-purple-600' : 'border-zinc-600'
                    }`}>
                      {selected && <Check className="w-2.5 h-2.5 text-white" />}
                    </div>
                    <div className="w-6 h-6 rounded bg-zinc-900 overflow-hidden flex items-center justify-center shrink-0">
                      {c.previewUrl
                        ? <img src={c.previewUrl} alt={c.name} className="w-full h-full object-contain" />
                        : <span className="text-[9px] text-zinc-500">{c.name.slice(0, 2)}</span>}
                    </div>
                    <span className={selected ? 'text-white' : 'text-zinc-300'}>{c.name}</span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
