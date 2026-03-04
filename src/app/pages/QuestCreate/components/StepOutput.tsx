import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Copy, Check, Plus, X, Save, Loader2 } from 'lucide-react';
import { WizardStepIndicator } from './WizardStepIndicator';
import { Objective, Reward, GeneratedCharacter, generateQuestline } from '../../../api/questCreateApi';
import {
  ExportTemplate,
  getTemplates,
  saveTemplate,
  deleteTemplate,
} from '../../../api/exportTemplateApi';

interface StepOutputProps {
  story: string;
  genre: string;
  objectives: Objective[];
  selectedObjectives: string[];
  rewards: Reward[];
  selectedRewards: string[];
  characters: GeneratedCharacter[];
  styleId: string;
  onBack: () => void;
}

// ---------------------------------------------------------------------------
// Apply template — replaces "{{placeholder}}" tokens with real data
// ---------------------------------------------------------------------------

interface QuestExportData {
  title: string;
  genre: string;
  objectives: Objective[];
  rewards: Reward[];
}

function applyTemplate(structure: object, data: QuestExportData): object {
  const map: Record<string, unknown> = {
    '{{id}}': 'quest-new',
    '{{title}}': data.title || 'Untitled Quest',
    '{{genre}}': data.genre,
    '{{nodes}}': [],
    '{{edges}}': [],
    '{{objectives}}': data.objectives,
    '{{rewards}}': data.rewards,
  };
  return JSON.parse(
    JSON.stringify(structure, (_, v) =>
      typeof v === 'string' && v in map ? map[v] : v,
    ),
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function StepOutput({
  story,
  genre,
  objectives,
  selectedObjectives,
  rewards,
  selectedRewards,
  characters,
  styleId,
  onBack,
}: StepOutputProps) {
  const navigate = useNavigate();

  const [templates, setTemplates] = useState<ExportTemplate[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const [copied, setCopied] = useState(false);
  const [saveMode, setSaveMode] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);

  useEffect(() => {
    getTemplates().then((list) => {
      setTemplates(list);
      const questflow = list.find((t) => t.engine === 'questflow');
      if (questflow) setSelectedId(questflow._id);
    });
  }, []);

  const filteredObjectives = objectives.filter((o) => selectedObjectives.includes(o.id));
  const filteredRewards = rewards.filter((r) => selectedRewards.includes(r.id));

  const exportData: QuestExportData = {
    title: story.split('\n')[0].slice(0, 60) || 'Untitled Quest',
    genre,
    objectives: filteredObjectives,
    rewards: filteredRewards,
  };

  const selectedTemplate = templates.find((t) => t._id === selectedId);
  const previewJson = selectedTemplate
    ? JSON.stringify(applyTemplate(selectedTemplate.structure, exportData), null, 2)
    : '';

  const handleCopy = async () => {
    await navigator.clipboard.writeText(previewJson);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSave = async () => {
    if (!saveName.trim() || !selectedTemplate) return;
    setSaving(true);
    try {
      const saved = await saveTemplate(saveName.trim(), 'custom', selectedTemplate.structure);
      setTemplates((prev) => [...prev, saved]);
      setSelectedId(saved._id);
      setSaveMode(false);
      setSaveName('');
    } finally {
      setSaving(false);
    }
  };

  const handleOpenInBuilder = async () => {
    setGenerating(true);
    setGenerateError(null);
    try {
      const id = await generateQuestline(
        story,
        genre,
        objectives.filter((o) => selectedObjectives.includes(o.id)),
        rewards.filter((r) => selectedRewards.includes(r.id)),
        characters,
        styleId,
      );
      navigate(`/quest-builder/${id}`);
    } catch (err) {
      setGenerateError(err instanceof Error ? err.message : 'Failed to generate questline');
      setGenerating(false);
    }
  };

  const handleDelete = async (id: string) => {
    await deleteTemplate(id);
    setTemplates((prev) => prev.filter((t) => t._id !== id));
    if (selectedId === id) {
      const fallback = templates.find((t) => t.engine === 'questflow' && t._id !== id);
      setSelectedId(fallback?._id ?? '');
    }
  };

  return (
    <div className="h-full flex flex-col gap-5">
      <WizardStepIndicator currentStep={5} />

      <div className="text-center flex flex-col gap-1">
        <h2 className="text-3xl font-bold text-white">Your quest structure</h2>
        <p className="text-zinc-400">Choose an engine format and review the export JSON</p>
      </div>

      {/* Template selector */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          {templates.map((t) => (
            <div key={t._id} className="flex items-center">
              <button
                onClick={() => { setSelectedId(t._id); setSaveMode(false); }}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${
                  selectedId === t._id
                    ? 'bg-purple-600 border-purple-600 text-white'
                    : 'bg-zinc-900 border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200'
                }`}
              >
                {t.name}
              </button>
              {!t.isBuiltIn && (
                <button
                  onClick={() => handleDelete(t._id)}
                  className="ml-0.5 p-0.5 text-zinc-600 hover:text-red-400 transition-colors"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          ))}

          {!saveMode && (
            <button
              onClick={() => setSaveMode(true)}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium border border-dashed border-zinc-600 text-zinc-500 hover:border-purple-500 hover:text-purple-400 transition-all"
            >
              <Plus className="w-3 h-3" />
              Save current
            </button>
          )}
        </div>

        {saveMode && (
          <div className="flex items-center gap-2">
            <input
              autoFocus
              type="text"
              value={saveName}
              onChange={(e) => setSaveName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSave();
                if (e.key === 'Escape') setSaveMode(false);
              }}
              placeholder="Template name…"
              className="flex-1 bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-purple-500"
            />
            <button
              onClick={handleSave}
              disabled={!saveName.trim() || saving}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-purple-600 hover:bg-purple-500 text-white disabled:opacity-50 transition-all"
            >
              <Save className="w-3 h-3" />
              Save
            </button>
            <button
              onClick={() => { setSaveMode(false); setSaveName(''); }}
              className="px-3 py-1.5 rounded-lg text-xs text-zinc-500 hover:text-white hover:bg-zinc-800 transition-colors"
            >
              Cancel
            </button>
          </div>
        )}
      </div>

      {/* JSON preview */}
      <div className="flex-1 min-h-0 flex flex-col">
        <div className="flex items-center justify-between bg-zinc-900 border border-zinc-700 border-b-0 rounded-t-xl px-4 py-2.5">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-zinc-700" />
            <div className="w-3 h-3 rounded-full bg-zinc-700" />
            <div className="w-3 h-3 rounded-full bg-zinc-700" />
            <span className="ml-2 text-xs text-zinc-500 font-mono">questline.json</span>
          </div>
          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>
        <pre className="flex-1 overflow-y-auto font-mono text-sm leading-relaxed text-green-400 bg-zinc-950 border border-zinc-700 rounded-b-xl p-5 whitespace-pre-wrap break-words">
          {previewJson || <span className="text-zinc-600">Loading templates…</span>}
        </pre>
      </div>

      {/* Bottom bar */}
      {generateError && (
        <p className="text-red-400 text-sm text-center">{generateError}</p>
      )}
      <div className="flex items-center justify-between pt-2 border-t border-zinc-800">
        <button
          onClick={onBack}
          disabled={generating}
          className="px-5 py-2.5 rounded-xl text-sm text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors disabled:opacity-50"
        >
          Back
        </button>
        <button
          onClick={handleOpenInBuilder}
          disabled={generating}
          className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-medium bg-purple-600 hover:bg-purple-500 text-white shadow-lg shadow-purple-600/25 transition-all disabled:opacity-70 disabled:cursor-not-allowed"
        >
          {generating ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Generating…
            </>
          ) : (
            'Open in Quest Builder →'
          )}
        </button>
      </div>
    </div>
  );
}
