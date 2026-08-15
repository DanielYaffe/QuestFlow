import React, { useRef } from 'react';
import { ArrowUp, Loader2 } from 'lucide-react';
import { WizardStepIndicator } from './WizardStepIndicator';
import { ExportTemplate } from '../../../api/exportTemplateApi';
import { FORMAT_OPTIONS, ENGINE_FORMATS } from '../../../api/questExportApi';

const GENRES = ['All', 'Fantasy', 'RPG', 'Horror', 'Sci-Fi', 'Action', 'Mystery', 'Historical', 'Open World', 'Puzzle', 'Dystopian'];

const ENGINE_OPTIONS = FORMAT_OPTIONS.filter((opt) => ENGINE_FORMATS.includes(opt.id));

interface StepStoryProps {
  storyInput: string;
  selectedGenre: string;
  templates: ExportTemplate[];
  selectedTemplateId: string;
  selectedEngineFormat: string;
  isLoading: boolean;
  onStoryChange: (value: string) => void;
  onGenreChange: (genre: string) => void;
  onExportModeChange: (templateId: string, engineFormat: string) => void;
  onSubmit: () => void;
}

const TEMPLATE_PREFIX = 'template:';
const ENGINE_PREFIX = 'engine:';

export function StepStory({
  storyInput,
  selectedGenre,
  templates,
  selectedTemplateId,
  selectedEngineFormat,
  isLoading,
  onStoryChange,
  onGenreChange,
  onExportModeChange,
  onSubmit,
}: StepStoryProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const exportModeValue = selectedTemplateId
    ? `${TEMPLATE_PREFIX}${selectedTemplateId}`
    : selectedEngineFormat
    ? `${ENGINE_PREFIX}${selectedEngineFormat}`
    : '';
  const selectedTemplate = templates.find((template) => template._id === selectedTemplateId);
  const selectedEngineLabel = ENGINE_OPTIONS.find((option) => option.id === selectedEngineFormat)?.label;

  const handleExportModeChange = (value: string) => {
    if (value.startsWith(TEMPLATE_PREFIX)) onExportModeChange(value.slice(TEMPLATE_PREFIX.length), '');
    else if (value.startsWith(ENGINE_PREFIX)) onExportModeChange('', value.slice(ENGINE_PREFIX.length));
    else onExportModeChange('', '');
  };

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
        <label className="text-steel-400 text-xs uppercase tracking-wide">Export Format</label>
        <select
          value={exportModeValue}
          onChange={(event) => handleExportModeChange(event.target.value)}
          disabled={isLoading}
          className="w-full bg-steel-800 border border-steel-600 rounded-lg px-3 py-2 text-steel-100 text-sm focus:outline-none focus:border-pulse"
        >
          <option value="">No template (QuestFlow YAML export)</option>
          {templates.length > 0 && (
            <optgroup label="Templates">
              {templates.map((template) => (
                <option key={template._id} value={`${TEMPLATE_PREFIX}${template._id}`}>
                  {template.name}
                </option>
              ))}
            </optgroup>
          )}
          <optgroup label="Engines">
            {ENGINE_OPTIONS.map((option) => (
              <option key={option.id} value={`${ENGINE_PREFIX}${option.id}`}>
                {option.label}
              </option>
            ))}
          </optgroup>
        </select>
        <p className="text-steel-400 text-xs">
          {selectedTemplateId
            ? selectedTemplate?.templateSchema?.summary
              || selectedTemplate?.schemaSummary?.structureSummary
              || 'Template schema will guide requirement, reward, and dialog generation.'
            : selectedEngineFormat
            ? `This quest will only be exportable as ${selectedEngineLabel} later on.`
            : 'YAML export will be used by default when no template or engine is selected.'}
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
