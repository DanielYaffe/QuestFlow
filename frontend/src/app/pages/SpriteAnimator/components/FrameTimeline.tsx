import React from 'react';
import { ChevronLeft, ChevronRight, Trash2 } from 'lucide-react';
import { CHECKER_SM } from '../../../utils/spriteStyles';

interface FrameTimelineProps {
  frameUrls: string[];
  currentIndex: number;
  disabled: boolean;
  onSelect: (index: number) => void;
  onMove: (index: number, direction: -1 | 1) => void;
  onDelete: (index: number) => void;
}

export function FrameTimeline({
  frameUrls, currentIndex, disabled, onSelect, onMove, onDelete,
}: FrameTimelineProps) {
  if (frameUrls.length === 0) return null;

  return (
    <div className="flex gap-2 overflow-x-auto px-4 py-3 bg-steel-900 border-t border-steel-700">
      {frameUrls.map((url, i) => (
        <div key={url} className="shrink-0 group relative">
          <button
            onClick={() => onSelect(i)}
            className={`block w-16 h-16 rounded-md border overflow-hidden transition-colors cursor-pointer ${
              i === currentIndex ? 'border-volt' : 'border-steel-700 hover:border-steel-500'
            }`}
            style={CHECKER_SM}
            title={`Frame ${i + 1}`}
          >
            <img src={url} alt={`Frame ${i + 1}`} className="w-full h-full object-contain" />
          </button>
          <span className="absolute top-0.5 left-1 text-[10px] text-steel-400 bg-steel-950/80 rounded px-1 tabular-nums">
            {i + 1}
          </span>

          {!disabled && (
            <div className="absolute -bottom-0.5 inset-x-0 flex justify-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                onClick={() => onMove(i, -1)}
                disabled={i === 0}
                className="w-5 h-5 flex items-center justify-center rounded bg-steel-950/90 text-steel-400 hover:text-steel-100 disabled:opacity-30 cursor-pointer"
                title="Move left"
              >
                <ChevronLeft className="w-3 h-3" />
              </button>
              <button
                onClick={() => onDelete(i)}
                disabled={frameUrls.length <= 1}
                className="w-5 h-5 flex items-center justify-center rounded bg-steel-950/90 text-steel-400 hover:text-[#e5484d] disabled:opacity-30 cursor-pointer"
                title="Delete frame"
              >
                <Trash2 className="w-3 h-3" />
              </button>
              <button
                onClick={() => onMove(i, 1)}
                disabled={i === frameUrls.length - 1}
                className="w-5 h-5 flex items-center justify-center rounded bg-steel-950/90 text-steel-400 hover:text-steel-100 disabled:opacity-30 cursor-pointer"
                title="Move right"
              >
                <ChevronRight className="w-3 h-3" />
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
