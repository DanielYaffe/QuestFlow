import React, { useRef } from 'react';
import { ArrowUp, Loader2 } from 'lucide-react';
import { WizardStepIndicator } from './WizardStepIndicator';
import { ExportTemplate } from '../../../api/exportTemplateApi';

const GENRES = ['All', 'Fantasy', 'RPG', 'Horror', 'Sci-Fi', 'Action', 'Mystery', 'Historical', 'Open World', 'Puzzle', 'Dystopian'];

interface StepStoryProps {
  storyInput: string;
  selectedGenre: string;
  templates: ExportTemplate[];
  selectedTemplateId: string;
  isLoading: boolean;
  onStoryChange: (value: string) => void;
  onGenreChange: (genre: string) => void;
  onTemplateChange: (templateId: string) => void;
  onSubmit: () => void;
}

export function StepStory({
  storyInput,
  selectedGenre,
  templates,
  selectedTemplateId,
  isLoading,
  onStoryChange,
  onGenreChange,
  onTemplateChange,
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
        <h1 className="text-5xl font-bold text-steel-100 leading-tight">
          Story to Quest in seconds
        </h1>
        <p className="text-steel-400 text-lg">
          Describe your story and genre — AI will structure it into a questline
        </p>
      </div>

      {/* Textarea */}
      <div
        className="relative bg-steel-850 border border-steel-600 rounded-md p-4 transition-all focus-within:border-pulse focus-within:ring-2 focus-within:ring-pulse/20 cursor-text"
        onClick={() => textareaRef.current?.focus()}
      >
        <textarea
          ref={textareaRef}
          value={storyInput}
          onChange={(e) => onStoryChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="A wandering knight stumbles upon a shattered dimensional rift in an ancient forest. Strange creatures pour through and the surrounding villages begin to vanish into mist..."
          className="w-full bg-transparent text-steel-200 placeholder-steel-500 resize-none focus:outline-none text-base leading-relaxed"
          style={{ minHeight: '220px' }}
          disabled={isLoading}
        />

        {/* Send button */}
        <div className="flex justify-end mt-3">
          <button
            onClick={onSubmit}
            disabled={!storyInput.trim() || isLoading}
            title="Generate questline (Ctrl+Enter)"
            className={`w-10 h-10 rounded-md flex items-center justify-center transition-all ${
              storyInput.trim() && !isLoading
                ? 'bg-volt hover:brightness-95 text-steel-950 font-semibold shadow-lg shadow-black/30'
                : 'bg-steel-700 text-steel-400 cursor-not-allowed'
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

      <div className="bg-steel-850 border border-steel-700 rounded-md p-4 space-y-2">
        <label className="text-steel-400 text-xs uppercase tracking-wide">Quest Template</label>
        <select
          value={selectedTemplateId}
          onChange={(event) => onTemplateChange(event.target.value)}
          disabled={isLoading}
          className="w-full bg-steel-800 border border-steel-600 rounded-lg px-3 py-2 text-steel-100 text-sm focus:outline-none focus:border-pulse"
        >
          <option value="">No template</option>
          {templates.map((template) => (
            <option key={template._id} value={template._id}>
              {template.name}
            </option>
          ))}
        </select>
        <p className="text-steel-400 text-xs">
          {selectedTemplateId
            ? templates.find((template) => template._id === selectedTemplateId)?.templateSchema?.summary
              || templates.find((template) => template._id === selectedTemplateId)?.schemaSummary?.structureSummary
              || 'Template schema will guide requirement, reward, and dialog generation.'
            : 'YAML export will be used by default when no template is selected.'}
        </p>
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
                  ? 'bg-volt text-steel-950 font-semibold border border-transparent '
                  : 'bg-steel-800/60 border border-steel-600 text-steel-400 hover:text-steel-100 hover:border-steel-400'
              }`}
            >
              {genre}
            </button>
          );
        })}
      </div>

      {isLoading && (
        <p className="text-center text-steel-400 text-sm animate-pulse">
          Generating objectives and rewards...
        </p>
      )}
    </div>
  );
}
