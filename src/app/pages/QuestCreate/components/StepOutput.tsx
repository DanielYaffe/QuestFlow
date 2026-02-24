import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Copy, Check } from 'lucide-react';
import { WizardStepIndicator } from './WizardStepIndicator';

const BASE_JSON = {
  questline: {
    id: 'ql-001',
    title: 'Untitled Questline',
    genre: 'Fantasy',
    description: '',
    nodes: [
      { id: 'n1', type: 'story', title: 'Prologue', body: '' },
      { id: 'n2', type: 'dialogue', title: 'First Encounter', body: '' },
      { id: 'n3', type: 'combat', title: 'Confrontation', body: '' },
      { id: 'n4', type: 'treasure', title: 'Resolution', body: '' },
    ],
    edges: [
      { from: 'n1', to: 'n2' },
      { from: 'n2', to: 'n3' },
      { from: 'n3', to: 'n4' },
    ],
    objectives: [],
    rewards: [],
  },
};

interface StepOutputProps {
  onBack: () => void;
}

export function StepOutput({ onBack }: StepOutputProps) {
  const navigate = useNavigate();
  const [json, setJson] = useState(JSON.stringify(BASE_JSON, null, 2));
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(json);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex flex-col gap-8">
      <WizardStepIndicator currentStep={3} />

      <div className="text-center flex flex-col gap-2">
        <h2 className="text-3xl font-bold text-white">Your quest structure</h2>
        <p className="text-zinc-400">Review and edit the generated questline JSON before opening in the builder</p>
      </div>

      {/* JSON Editor */}
      <div className="relative">
        {/* Editor header bar */}
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

        {/* Textarea editor */}
        <textarea
          value={json}
          onChange={(e) => setJson(e.target.value)}
          spellCheck={false}
          className="w-full font-mono text-sm leading-relaxed text-green-400 bg-zinc-950 border border-zinc-700 rounded-b-xl p-5 focus:outline-none focus:border-zinc-600 resize-none"
          style={{ minHeight: '420px' }}
        />
      </div>

      {/* Bottom bar */}
      <div className="flex items-center justify-between pt-2 border-t border-zinc-800">
        <button
          onClick={onBack}
          className="px-5 py-2.5 rounded-xl text-sm text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
        >
          Back
        </button>
        <button
          onClick={() => navigate('/quest-builder')}
          className="px-6 py-2.5 rounded-xl text-sm font-medium bg-purple-600 hover:bg-purple-500 text-white shadow-lg shadow-purple-600/25 transition-all"
        >
          Open in Quest Builder →
        </button>
      </div>
    </div>
  );
}
