import React, { useRef } from 'react';
import { ArrowUp, Loader2 } from 'lucide-react';
import { WizardStepIndicator } from './WizardStepIndicator';

const GENRES = ['All', 'Fantasy', 'RPG', 'Horror', 'Sci-Fi', 'Action', 'Mystery', 'Historical', 'Open World', 'Puzzle', 'Dystopian'];

interface StepStoryProps {
  storyInput: string;
  selectedGenre: string;
  isLoading: boolean;
  onStoryChange: (value: string) => void;
  onGenreChange: (genre: string) => void;
  onSubmit: () => void;
}

export function StepStory({
  storyInput,
  selectedGenre,
  isLoading,
  onStoryChange,
  onGenreChange,
  onSubmit,
}: StepStoryProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && storyInput.trim()) {
      onSubmit();
    }
  };

  return (
    <div className="flex flex-col gap-10">
      <WizardStepIndicator currentStep={1} />

      {/* Heading */}
      <div className="text-center flex flex-col gap-3">
        <h1 className="text-5xl font-bold bg-gradient-to-r from-purple-400 via-violet-400 to-blue-400 bg-clip-text text-transparent leading-tight">
          Story to Quest in seconds
        </h1>
        <p className="text-zinc-400 text-lg">
          Describe your story and genre — AI will structure it into a questline
        </p>
      </div>

      {/* Textarea */}
      <div
        className="relative bg-zinc-900 border border-zinc-700 rounded-2xl p-4 transition-all focus-within:border-purple-500 focus-within:ring-2 focus-within:ring-purple-500/20 cursor-text"
        onClick={() => textareaRef.current?.focus()}
      >
        <textarea
          ref={textareaRef}
          value={storyInput}
          onChange={(e) => onStoryChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="A wandering knight stumbles upon a shattered dimensional rift in an ancient forest. Strange creatures pour through and the surrounding villages begin to vanish into mist..."
          className="w-full bg-transparent text-zinc-200 placeholder-zinc-600 resize-none focus:outline-none text-base leading-relaxed"
          style={{ minHeight: '220px' }}
          disabled={isLoading}
        />

        {/* Send button */}
        <div className="flex justify-end mt-3">
          <button
            onClick={onSubmit}
            disabled={!storyInput.trim() || isLoading}
            title="Generate questline (Ctrl+Enter)"
            className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${
              storyInput.trim() && !isLoading
                ? 'bg-purple-600 hover:bg-purple-500 text-white shadow-lg shadow-purple-600/30'
                : 'bg-zinc-700 text-zinc-500 cursor-not-allowed'
            }`}
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <ArrowUp className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>

      {/* Genre chips */}
      <div className="flex flex-wrap gap-2 justify-center">
        {GENRES.map((genre) => {
          const isActive = selectedGenre === genre;
          return (
            <button
              key={genre}
              onClick={() => onGenreChange(genre)}
              disabled={isLoading}
              className={`px-4 py-1.5 rounded-full text-sm transition-all ${
                isActive
                  ? 'bg-gradient-to-r from-purple-600 to-blue-500 text-white border border-transparent shadow-md shadow-purple-600/20'
                  : 'bg-zinc-800/60 border border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-500'
              }`}
            >
              {genre}
            </button>
          );
        })}
      </div>

      {isLoading && (
        <p className="text-center text-zinc-500 text-sm animate-pulse">
          Generating objectives and rewards...
        </p>
      )}
    </div>
  );
}
