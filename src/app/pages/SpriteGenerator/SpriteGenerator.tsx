import React, { useState } from 'react';
import { Sparkles, Wand2 } from 'lucide-react';
import { SpriteCard } from './components/SpriteCard';

const sampleSprites = [
  { id: 1, name: 'Knight Character', prompt: 'Medieval knight with sword and shield' },
  { id: 2, name: 'Forest Enemy', prompt: 'Small goblin creature for forest level' },
  { id: 3, name: 'Magic Item', prompt: 'Glowing blue potion bottle' },
  { id: 4, name: 'NPC Villager', prompt: 'Friendly village merchant character' },
];

const quickPrompts = ['Pixel art hero', 'Enemy boss', 'Health potion', 'Treasure chest'];

export function SpriteGenerator() {
  const [prompt, setPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);

  const handleGenerate = () => {
    setIsGenerating(true);
    setTimeout(() => setIsGenerating(false), 2000);
  };

  return (
    <div className="h-full overflow-auto bg-zinc-950">
      <div className="max-w-6xl mx-auto px-8 py-8">
        {/* Generator Section */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 mb-8">
          <div className="flex items-center gap-2 mb-4">
            <Wand2 className="w-5 h-5 text-blue-400" />
            <h2 className="text-white text-lg">Generate New Sprite</h2>
          </div>
          <div className="flex gap-4">
            <input
              type="text"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Describe your sprite... (e.g., 'pixel art wizard with staff')"
              className="flex-1 bg-zinc-800 text-white px-4 py-3 rounded-lg border border-zinc-700 focus:border-blue-500 focus:outline-none placeholder:text-zinc-500"
            />
            <button
              onClick={handleGenerate}
              disabled={!prompt.trim() || isGenerating}
              className="px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-zinc-700 disabled:text-zinc-500 text-white rounded-lg transition-colors flex items-center gap-2"
            >
              {isGenerating ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Sparkles className="w-5 h-5" />
                  Generate
                </>
              )}
            </button>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <span className="text-zinc-500 text-sm">Quick prompts:</span>
            {quickPrompts.map((qp) => (
              <button
                key={qp}
                onClick={() => setPrompt(qp)}
                className="px-3 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm rounded-full transition-colors"
              >
                {qp}
              </button>
            ))}
          </div>
        </div>

        {/* Preview Area */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 mb-8">
          <h3 className="text-white mb-4">Preview</h3>
          <div className="bg-zinc-800 rounded-lg p-8 flex items-center justify-center min-h-[300px]">
            {isGenerating ? (
              <div className="text-center">
                <div className="w-12 h-12 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin mx-auto mb-4" />
                <p className="text-zinc-400">Generating your sprite...</p>
              </div>
            ) : (
              <div className="text-center">
                <Sparkles className="w-16 h-16 text-zinc-600 mx-auto mb-4" />
                <p className="text-zinc-500">Your generated sprite will appear here</p>
                <p className="text-zinc-600 text-sm mt-2">Enter a prompt above to get started</p>
              </div>
            )}
          </div>
        </div>

        {/* Recent Generations */}
        <div>
          <h3 className="text-white mb-4">Recent Generations</h3>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            {sampleSprites.map((sprite) => (
              <SpriteCard key={sprite.id} name={sprite.name} prompt={sprite.prompt} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
