import React, { useState } from 'react';
import { Search, Loader2, FlaskConical } from 'lucide-react';
import { toast } from 'sonner';
import { KbType, KB_TYPES, KbSearchResult, searchKb } from '../../api/gameApi';

const TYPE_LABELS: Record<KbType, string> = {
  lore: 'Lore',
  quests: 'Quests',
  characters: 'Characters',
  dialogue: 'Dialogue',
};

// Test panel: run a semantic query against the game's knowledge base and see
// exactly which chunks (and scores) generation would receive.
export function KbTestSearch({ gameId, hasReadyDocs }: { gameId: string; hasReadyDocs: boolean }) {
  const [query, setQuery] = useState('');
  const [type, setType] = useState<KbType>('lore');
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<KbSearchResult[] | null>(null);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    if (!q || searching) return;
    setSearching(true);
    try {
      setResults(await searchKb(gameId, q, type, 5));
    } catch {
      toast.error('Search failed');
    } finally {
      setSearching(false);
    }
  };

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <FlaskConical className="w-4 h-4 text-purple-400" />
        <h2 className="text-white text-sm font-medium">Test your knowledge base</h2>
      </div>
      <p className="text-zinc-500 text-xs -mt-2">
        Ask a question the way quest generation would — the highest-scoring chunks below are what
        the AI will see as reference material.
      </p>

      <form onSubmit={handleSearch} className="flex flex-col gap-3">
        <div className="flex gap-1 bg-zinc-800 border border-zinc-700 rounded-lg p-1 self-start">
          {KB_TYPES.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setType(t)}
              className={`px-2.5 py-1 rounded-md text-xs transition-colors ${
                type === t ? 'bg-purple-600 text-white' : 'text-zinc-400 hover:text-white'
              }`}
            >
              {TYPE_LABELS[t]}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder='e.g. "who guards the bridge near the village?"'
            className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-white placeholder-zinc-500 focus:outline-none focus:border-purple-500 text-sm"
          />
          <button
            type="submit"
            disabled={searching || !query.trim()}
            className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white text-sm rounded-lg transition-colors"
          >
            {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            Search
          </button>
        </div>
      </form>

      {results !== null && (
        results.length === 0 ? (
          <div className="text-center py-6">
            <p className="text-zinc-500 text-sm">No matches.</p>
            <p className="text-zinc-600 text-xs mt-1">
              {hasReadyDocs
                ? `Nothing in "${TYPE_LABELS[type]}" was similar enough to your query.`
                : 'No documents are Ready yet — add one and wait for indexing to finish.'}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {results.map((r, i) => (
              <div key={`${r.docId}-${i}`} className="bg-zinc-950 border border-zinc-800 rounded-lg p-3">
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-zinc-300 text-xs font-medium truncate">{r.title}</span>
                  <div className="ml-auto flex items-center gap-2 shrink-0">
                    <div className="w-16 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-purple-500 rounded-full"
                        style={{ width: `${Math.round(Math.min(1, Math.max(0, r.score)) * 100)}%` }}
                      />
                    </div>
                    <span className="text-zinc-500 text-[10px] tabular-nums">{r.score.toFixed(3)}</span>
                  </div>
                </div>
                <p className="text-zinc-400 text-xs leading-relaxed line-clamp-4">{r.text}</p>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  );
}
