import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, FlaskConical, History, Loader2, Search } from 'lucide-react';
import { toast } from 'sonner';
import {
  Game,
  KbType,
  KB_TYPES,
  KbSearchResult,
  getGame,
  searchKb,
} from '../../api/gameApi';
import { TYPE_LABELS, TYPE_BADGES } from './kbContent';

interface HistoryEntry {
  query: string;
  totalMatches: number;
}

type ResultsByType = Partial<Record<KbType, KbSearchResult[]>>;

// KB playground: run a query the way quest generation would and see, per
// category, exactly which chunks retrieval returns and how they score. All
// four categories are searched in parallel; history is session-only.
export function KbPlayground() {
  const { gameId = '' } = useParams();
  const navigate = useNavigate();

  const [game, setGame] = useState<Game | null>(null);
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<ResultsByType | null>(null);
  const [lastQuery, setLastQuery] = useState('');
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  useEffect(() => {
    let cancelled = false;
    getGame(gameId)
      .then((g) => { if (!cancelled) setGame(g); })
      .catch(() => {
        if (!cancelled) {
          toast.error('Failed to load game');
          navigate('/games');
        }
      });
    return () => { cancelled = true; };
  }, [gameId, navigate]);

  const runSearch = async (raw: string) => {
    const q = raw.trim();
    if (!q || searching) return;
    setSearching(true);
    setQuery(q);
    try {
      const perType = await Promise.all(KB_TYPES.map((t) => searchKb(gameId, q, t, 5)));
      const grouped: ResultsByType = {};
      KB_TYPES.forEach((t, i) => { grouped[t] = perType[i]; });
      const total = perType.reduce((sum, r) => sum + r.length, 0);
      setResults(grouped);
      setLastQuery(q);
      setHistory((prev) => [{ query: q, totalMatches: total }, ...prev.filter((h) => h.query !== q)].slice(0, 20));
    } catch {
      toast.error('Search failed');
    } finally {
      setSearching(false);
    }
  };

  const typesWithHits = results ? KB_TYPES.filter((t) => (results[t] ?? []).length > 0) : [];
  const emptyTypes = results ? KB_TYPES.filter((t) => (results[t] ?? []).length === 0) : [];

  return (
    <div className="h-full overflow-y-auto bg-zinc-950">
      <main className="max-w-6xl mx-auto px-8 py-8 flex flex-col gap-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(`/games/${gameId}`)}
            className="w-8 h-8 flex items-center justify-center bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-400 hover:text-white rounded-lg transition-colors shrink-0"
            title="Back to game"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="w-9 h-9 rounded-lg bg-purple-600/20 flex items-center justify-center shrink-0">
            <FlaskConical className="w-5 h-5 text-purple-400" />
          </div>
          <div className="min-w-0">
            <h1 className="text-white font-semibold text-lg leading-none truncate">
              KB Playground{game ? ` — ${game.name}` : ''}
            </h1>
            <p className="text-zinc-500 text-xs mt-1 truncate">
              Ask a question the way quest generation would — the chunks below are what the AI sees.
            </p>
          </div>
        </div>

        {/* Query */}
        <form
          onSubmit={(e) => { e.preventDefault(); void runSearch(query); }}
          className="flex gap-2"
        >
          <input
            type="text"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder='e.g. "what lives in the caves near the starter village?"'
            className="flex-1 bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-2.5 text-white placeholder-zinc-600 focus:outline-none focus:border-purple-500 text-sm"
          />
          <button
            type="submit"
            disabled={searching || !query.trim()}
            className="flex items-center gap-2 px-5 py-2.5 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white text-sm rounded-lg transition-colors"
          >
            {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            Search
          </button>
        </form>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 items-start">
          {/* History */}
          <aside className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 flex flex-col gap-3 lg:sticky lg:top-6 order-last lg:order-first">
            <div className="flex items-center gap-2">
              <History className="w-4 h-4 text-zinc-500" />
              <h2 className="text-zinc-400 text-xs font-medium uppercase tracking-wider">History</h2>
            </div>
            {history.length === 0 ? (
              <p className="text-zinc-600 text-xs">Queries you run will show up here.</p>
            ) : (
              <div className="flex flex-col gap-1">
                {history.map((h) => (
                  <button
                    key={h.query}
                    onClick={() => void runSearch(h.query)}
                    className={`text-left px-2.5 py-1.5 rounded-lg text-xs transition-colors ${
                      h.query === lastQuery
                        ? 'bg-purple-600/15 text-purple-300'
                        : 'text-zinc-400 hover:bg-zinc-800 hover:text-white'
                    }`}
                    title={h.query}
                  >
                    <span className="line-clamp-2">{h.query}</span>
                    <span className="text-zinc-600 block mt-0.5">
                      {h.totalMatches} match{h.totalMatches === 1 ? '' : 'es'}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </aside>

          {/* Results */}
          <section className="lg:col-span-3 flex flex-col gap-6 min-w-0">
            {results === null ? (
              <div className="bg-zinc-900 border border-dashed border-zinc-800 rounded-xl py-16 flex flex-col items-center text-center px-6">
                <FlaskConical className="w-8 h-8 text-zinc-700 mb-3" />
                <p className="text-zinc-400 text-sm mb-1">Test your knowledge base</p>
                <p className="text-zinc-600 text-xs max-w-sm">
                  Every query searches all four categories at once. Only documents that are
                  Ready can match — pending or failed ones are never served to generation.
                </p>
              </div>
            ) : typesWithHits.length === 0 ? (
              <div className="bg-zinc-900 border border-dashed border-zinc-800 rounded-xl py-16 flex flex-col items-center text-center px-6">
                <Search className="w-8 h-8 text-zinc-700 mb-3" />
                <p className="text-zinc-400 text-sm mb-1">No matches for “{lastQuery}”</p>
                <p className="text-zinc-600 text-xs max-w-sm">
                  Nothing in the knowledge base was similar enough. If you just added documents,
                  wait for them to turn Ready on the game page.
                </p>
              </div>
            ) : (
              <>
                {typesWithHits.map((t) => (
                  <div key={t} className="flex flex-col gap-2">
                    <div className="flex items-center gap-2">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${TYPE_BADGES[t]}`}>
                        {TYPE_LABELS[t]}
                      </span>
                      <span className="text-zinc-500 text-xs">
                        {(results[t] ?? []).length} match{(results[t] ?? []).length === 1 ? '' : 'es'}
                      </span>
                    </div>
                    <div className="flex flex-col gap-2">
                      {(results[t] ?? []).map((r, i) => (
                        <div key={`${r.docId}-${i}`} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="text-zinc-300 text-xs font-medium truncate">{r.title}</span>
                            <div className="ml-auto flex items-center gap-2 shrink-0">
                              <div className="w-20 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-purple-500 rounded-full"
                                  style={{ width: `${Math.round(Math.min(1, Math.max(0, r.score)) * 100)}%` }}
                                />
                              </div>
                              <span className="text-zinc-500 text-[10px] tabular-nums">{r.score.toFixed(3)}</span>
                            </div>
                          </div>
                          <p className="text-zinc-400 text-xs leading-relaxed whitespace-pre-wrap">{r.text}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
                {emptyTypes.length > 0 && (
                  <p className="text-zinc-600 text-xs">
                    No matches in {emptyTypes.map((t) => TYPE_LABELS[t]).join(', ')}.
                  </p>
                )}
              </>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
