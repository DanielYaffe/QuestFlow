import React from 'react';
import { Film, Loader2, Plus, AlertTriangle } from 'lucide-react';
import { AnimationSummary } from '../../../api/animationApi';
import { CHECKER_SM } from '../../../utils/spriteStyles';

interface AnimationsListProps {
  animations: AnimationSummary[];
  selectedId: string | null;
  loading: boolean;
  onSelect: (id: string) => void;
  onNew: () => void;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function AnimationsList({ animations, selectedId, loading, onSelect, onNew }: AnimationsListProps) {
  return (
    <aside className="w-60 shrink-0 h-full flex flex-col bg-steel-900 border-r border-steel-700">
      <div className="flex items-center justify-between px-4 pt-4 pb-3">
        <h2 className="text-steel-100 text-sm font-semibold">Animations</h2>
        <button
          onClick={onNew}
          className="flex items-center gap-1.5 px-2.5 py-1.5 bg-volt hover:brightness-95 text-steel-950 text-xs font-semibold rounded-md transition-[filter] cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
          New
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-2 pb-3 flex flex-col gap-1">
        {loading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="w-5 h-5 text-pulse animate-spin" />
          </div>
        ) : animations.length === 0 ? (
          <div className="text-center px-4 py-10">
            <Film className="w-7 h-7 mx-auto mb-2 text-steel-600" />
            <p className="text-steel-400 text-xs leading-relaxed">
              No animations yet. Pick a sprite and describe an action to bring it to life.
            </p>
          </div>
        ) : (
          animations.map((anim) => (
            <button
              key={anim._id}
              onClick={() => onSelect(anim._id)}
              className={`flex items-center gap-2.5 px-2.5 py-2 rounded-md text-left transition-colors cursor-pointer ${
                anim._id === selectedId ? 'bg-steel-800 shadow-[inset_2px_0_0_0_#f5d90a]' : 'hover:bg-steel-800/60'
              }`}
            >
              <div
                className="w-10 h-10 shrink-0 rounded border border-steel-700 overflow-hidden"
                style={CHECKER_SM}
              >
                {anim.previewUrl && (
                  <img src={anim.previewUrl} alt="" className="w-full h-full object-contain" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-steel-100 text-xs font-medium truncate">{anim.name}</p>
                <p className="text-steel-400 text-[11px] flex items-center gap-1.5">
                  {anim.status === 'generating' ? (
                    <><Loader2 className="w-3 h-3 animate-spin text-pulse" /> generating…</>
                  ) : anim.status === 'failed' ? (
                    <><AlertTriangle className="w-3 h-3 text-[#e5484d]" /> failed</>
                  ) : (
                    <>{anim.frameCount} frames · {timeAgo(anim.updatedAt)}</>
                  )}
                </p>
              </div>
            </button>
          ))
        )}
      </div>
    </aside>
  );
}
