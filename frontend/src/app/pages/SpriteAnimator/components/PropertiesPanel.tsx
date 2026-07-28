import React, { useEffect, useState } from 'react';
import { Download, Loader2, RefreshCw, Trash2, Wand2 } from 'lucide-react';
import { AnimationDetail } from '../../../api/animationApi';
import { CHECKER_SM } from '../../../utils/spriteStyles';

interface PropertiesPanelProps {
  animation: AnimationDetail;
  busy: boolean;
  onRename: (name: string) => void;
  onRegenerate: (action: string, frameCount: number) => void;
  onEditWithText: (instruction: string) => void;
  onExport: (formats: ('spritesheet' | 'gif')[]) => Promise<void>;
  onDelete: () => void;
}

const FRAME_COUNTS = [4, 6, 8, 10, 12, 14, 16];

export function PropertiesPanel({
  animation, busy, onRename, onRegenerate, onEditWithText, onExport, onDelete,
}: PropertiesPanelProps) {
  const [name, setName] = useState(animation.name);
  const [action, setAction] = useState(animation.action);
  const [frameCount, setFrameCount] = useState(animation.frameCount || 8);
  const [instruction, setInstruction] = useState('');
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    setName(animation.name);
    setAction(animation.action);
    setFrameCount(animation.frameCount || 8);
    setInstruction('');
  }, [animation._id, animation.name, animation.action, animation.frameCount]);

  const handleExport = async (formats: ('spritesheet' | 'gif')[]) => {
    setExporting(true);
    try {
      await onExport(formats);
    } finally {
      setExporting(false);
    }
  };

  return (
    <aside className="w-72 shrink-0 h-full overflow-y-auto bg-steel-900 border-l border-steel-700 flex flex-col gap-5 p-4">
      {/* Name */}
      <div>
        <label className="block text-steel-400 text-xs uppercase tracking-wider font-semibold mb-1.5">Name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => { if (name.trim() && name !== animation.name) onRename(name.trim()); }}
          className="w-full bg-steel-850 border border-steel-700 rounded-md px-3 py-2 text-steel-100 text-sm focus:outline-none focus:border-pulse"
        />
      </div>

      {/* Source */}
      <div>
        <label className="block text-steel-400 text-xs uppercase tracking-wider font-semibold mb-1.5">Source</label>
        <div className="flex items-center gap-2.5">
          <div className="w-12 h-12 rounded-md border border-steel-700 overflow-hidden shrink-0" style={CHECKER_SM}>
            {animation.sourceImageUrl && (
              <img src={animation.sourceImageUrl} alt="Source sprite" className="w-full h-full object-contain" />
            )}
          </div>
          <p className="text-steel-400 text-xs">
            {animation.frameWidth > 0 ? `${animation.frameWidth}×${animation.frameHeight}px frames` : 'no frames yet'}
          </p>
        </div>
      </div>

      {/* Generate / re-roll */}
      <div className="border-t border-steel-700 pt-4">
        <label className="block text-steel-400 text-xs uppercase tracking-wider font-semibold mb-1.5">Action</label>
        <textarea
          value={action}
          onChange={(e) => setAction(e.target.value)}
          rows={2}
          placeholder='e.g. "walk cycle"'
          className="w-full bg-steel-850 border border-steel-700 rounded-md px-3 py-2 text-steel-100 placeholder-steel-500 text-sm resize-none focus:outline-none focus:border-pulse"
        />
        <div className="flex gap-1 bg-steel-850 border border-steel-700 rounded-md p-1 mt-2">
          {FRAME_COUNTS.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setFrameCount(n)}
              className={`flex-1 py-1 rounded text-[11px] tabular-nums transition-colors cursor-pointer ${
                frameCount === n ? 'bg-volt text-steel-950 font-semibold' : 'text-steel-400 hover:text-steel-100'
              }`}
            >
              {n}
            </button>
          ))}
        </div>
        <button
          onClick={() => onRegenerate(action.trim(), frameCount)}
          disabled={busy || !action.trim()}
          className="mt-2 w-full flex items-center justify-center gap-2 px-3 py-2 bg-volt hover:brightness-95 disabled:opacity-50 text-steel-950 text-sm font-semibold rounded-md transition-[filter] cursor-pointer"
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          {animation.frameCount > 0 ? 'Re-roll frames' : 'Generate frames'}
        </button>
        <p className="text-steel-500 text-[11px] mt-1.5">Replaces all frames. Uses 1 PixelLab generation.</p>
      </div>

      {/* Edit with text */}
      <div className="border-t border-steel-700 pt-4">
        <label className="block text-steel-400 text-xs uppercase tracking-wider font-semibold mb-1.5">Edit with text</label>
        <textarea
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          rows={2}
          placeholder='e.g. "add a flowing red cape"'
          className="w-full bg-steel-850 border border-steel-700 rounded-md px-3 py-2 text-steel-100 placeholder-steel-500 text-sm resize-none focus:outline-none focus:border-pulse"
        />
        <button
          onClick={() => { onEditWithText(instruction.trim()); setInstruction(''); }}
          disabled={busy || !instruction.trim() || animation.frameCount < 2}
          className="mt-2 w-full flex items-center justify-center gap-2 px-3 py-2 bg-steel-850 hover:bg-steel-800 border border-steel-600 disabled:opacity-50 text-steel-100 text-sm rounded-md transition-colors cursor-pointer"
        >
          <Wand2 className="w-4 h-4 text-pulse" />
          Apply to all frames
        </button>
        <p className="text-steel-500 text-[11px] mt-1.5">Pro tool — needs PixelLab USD credits.</p>
      </div>

      {/* Export */}
      <div className="border-t border-steel-700 pt-4">
        <label className="block text-steel-400 text-xs uppercase tracking-wider font-semibold mb-1.5">Export</label>
        <div className="flex flex-col gap-2">
          <button
            onClick={() => handleExport(['spritesheet'])}
            disabled={exporting || animation.status !== 'ready'}
            className="flex items-center gap-2 px-3 py-2 bg-steel-850 hover:bg-steel-800 border border-steel-600 disabled:opacity-50 text-steel-100 text-sm rounded-md transition-colors cursor-pointer"
          >
            <Download className="w-4 h-4 text-pulse" />
            Spritesheet PNG + JSON
          </button>
          <button
            onClick={() => handleExport(['gif'])}
            disabled={exporting || animation.status !== 'ready'}
            className="flex items-center gap-2 px-3 py-2 bg-steel-850 hover:bg-steel-800 border border-steel-600 disabled:opacity-50 text-steel-100 text-sm rounded-md transition-colors cursor-pointer"
          >
            {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4 text-pulse" />}
            Animated GIF
          </button>
        </div>
      </div>

      {/* Danger */}
      <div className="border-t border-steel-700 pt-4 mt-auto">
        <button
          onClick={onDelete}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 text-[#e5484d] hover:bg-steel-850 border border-steel-700 hover:border-[#e5484d]/50 text-sm rounded-md transition-colors cursor-pointer"
        >
          <Trash2 className="w-4 h-4" />
          Delete animation
        </button>
      </div>
    </aside>
  );
}
