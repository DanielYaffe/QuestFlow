import React, { useEffect, useMemo, useState } from 'react';
import { Edit3, FileCode2, Loader2, Plus, RefreshCcw, Save, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import {
  analyzeExportTemplate,
  createExportTemplate,
  deleteExportTemplate,
  ExportTemplate,
  fetchExportTemplates,
  TemplateSchema,
  TemplateFormat,
  updateExportTemplate,
} from '../../../api/exportTemplateApi';

const DEFAULT_TEMPLATE = `{
  "name": "Free Tier 3",
  "quest_id": 2,
  "silent": "true",
  "pre_quest": [-1],
  "daily": "false",
  "to_kill": [
    { "id": 100134, "amount": 200 }
  ],
  "to_collect": [
    { "item_id": 4000002, "amount": 80 }
  ],
  "rewards": {
    "items": [
      { "id": 4000006, "amount": 100 },
      { "id": 5072000, "amount": 20 }
    ]
  }
}`;

function detectedGroups(template: ExportTemplate): string[] {
  const fields = template.templateSchema?.editableFields ?? template.fieldSchema;
  const roles = new Set(fields.map((field) => field.gameplayRole).filter(Boolean));
  const groups = [
    roles.has('combatRequirement') || roles.has('collectionRequirement') || roles.has('requirement') ? 'Requirements' : null,
    roles.has('reward') || roles.has('itemReward') || roles.has('currencyReward') || roles.has('experienceReward') ? 'Rewards' : null,
    roles.has('questDialog') ? 'Quest dialog' : null,
    roles.has('questId') || roles.has('preQuest') || roles.has('completedQuestRequirement') || roles.has('ongoingQuestRequirement') || roles.has('questFlag') ? 'Metadata' : null,
  ].filter(Boolean) as string[];
  return groups.length ? groups : ['Quest fields'];
}

export function QuestTemplateSettingsCard() {
  const [templates, setTemplates] = useState<ExportTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [analyzingId, setAnalyzingId] = useState<string | null>(null);
  const [name, setName] = useState('Free Tier 3');
  const [description, setDescription] = useState('Maple-style quest-node export template');
  const [inputFormat, setInputFormat] = useState<TemplateFormat>('json');
  const [outputFormat, setOutputFormat] = useState<TemplateFormat>('yaml');
  const [rawTemplate, setRawTemplate] = useState(DEFAULT_TEMPLATE);
  const [hintEditingId, setHintEditingId] = useState<string | null>(null);
  const [fieldHintsDraft, setFieldHintsDraft] = useState('[]');
  const [relationshipHintsDraft, setRelationshipHintsDraft] = useState('[]');
  const [generationHintsDraft, setGenerationHintsDraft] = useState('');
  const [userExamplesDraft, setUserExamplesDraft] = useState('');

  const sortedTemplates = useMemo(
    () => [...templates].sort((a, b) => Number(b.isBuiltIn) - Number(a.isBuiltIn) || a.name.localeCompare(b.name)),
    [templates],
  );

  const loadTemplates = () => {
    setIsLoading(true);
    fetchExportTemplates()
      .then(setTemplates)
      .catch(() => toast.error('Failed to load quest templates'))
      .finally(() => setIsLoading(false));
  };

  useEffect(() => {
    loadTemplates();
  }, []);

  const handleSave = async () => {
    if (!name.trim() || !rawTemplate.trim()) return;
    setIsSaving(true);
    try {
      const payload = {
        name,
        description,
        rawTemplate,
        inputFormat,
        defaultOutputFormat: outputFormat,
      };
      if (editingId) {
        const updated = await updateExportTemplate(editingId, payload);
        setTemplates((prev) => prev.map((template) => template._id === editingId ? updated : template));
        toast.success('Quest template updated');
      } else {
        const created = await createExportTemplate(payload);
        setTemplates((prev) => [...prev, created]);
        toast.success('Quest template saved');
      }
      resetForm();
    } catch (err: any) {
      toast.error(err?.response?.data?.error ?? 'Failed to save template');
    } finally {
      setIsSaving(false);
    }
  };

  const resetForm = () => {
    setEditingId(null);
    setName('Free Tier 3');
    setDescription('Maple-style quest-node export template');
    setInputFormat('json');
    setOutputFormat('yaml');
    setRawTemplate(DEFAULT_TEMPLATE);
  };

  const handleEdit = (template: ExportTemplate) => {
    if (template.isBuiltIn) return;
    setEditingId(template._id);
    setName(template.name);
    setDescription(template.description ?? '');
    setInputFormat(template.acceptedInputFormat);
    setOutputFormat(template.defaultOutputFormat);
    setRawTemplate(template.rawTemplate);
  };

  const handleAnalyze = async (template: ExportTemplate, schemaOverride?: Partial<TemplateSchema>) => {
    setAnalyzingId(template._id);
    try {
      const updated = await analyzeExportTemplate(template._id, schemaOverride);
      setTemplates((prev) => prev.map((item) => item._id === template._id ? updated : item));
      toast.success(updated.analysisStatus === 'ready' ? 'Template analyzed by AI' : 'Template saved with parser fallback');
    } catch (err: any) {
      toast.error(err?.response?.data?.error ?? 'Failed to analyze template');
    } finally {
      setAnalyzingId(null);
    }
  };

  const handleDelete = async (template: ExportTemplate) => {
    try {
      await deleteExportTemplate(template._id);
      setTemplates((prev) => prev.filter((item) => item._id !== template._id));
      toast.success('Template deleted');
    } catch {
      toast.error('Failed to delete template');
    }
  };

  const startHintEdit = (template: ExportTemplate) => {
    const contract = template.templateSchema?.generationContract;
    setHintEditingId(template._id);
    setFieldHintsDraft(JSON.stringify(contract?.fieldHints ?? [], null, 2));
    setRelationshipHintsDraft(JSON.stringify(contract?.relationshipHints ?? [], null, 2));
    setGenerationHintsDraft((contract?.generationHints ?? []).join('\n'));
    setUserExamplesDraft((contract?.userExamples ?? []).join('\n'));
  };

  const contractDraft = (template: ExportTemplate): Partial<TemplateSchema> | null => {
    try {
      return {
        generationContract: {
          ...(template.templateSchema?.generationContract ?? {
            requirementRoles: [],
            rewardRoles: [],
            dialogRoles: [],
            promptSummary: '',
          }),
          fieldHints: JSON.parse(fieldHintsDraft),
          relationshipHints: JSON.parse(relationshipHintsDraft),
          generationHints: generationHintsDraft.split('\n').map((line) => line.trim()).filter(Boolean),
          userExamples: userExamplesDraft.split('\n').map((line) => line.trim()).filter(Boolean),
        },
      };
    } catch {
      toast.error('Hint JSON is invalid');
      return null;
    }
  };

  const saveHints = async (template: ExportTemplate) => {
    const templateSchema = contractDraft(template);
    if (!templateSchema) return;
    setIsSaving(true);
    try {
      const updated = await updateExportTemplate(template._id, {
        name: template.name,
        description: template.description,
        rawTemplate: template.rawTemplate,
        inputFormat: template.acceptedInputFormat,
        defaultOutputFormat: template.defaultOutputFormat,
        templateSchema,
        skipAnalysis: true,
      });
      setTemplates((prev) => prev.map((item) => item._id === template._id ? updated : item));
      setHintEditingId(null);
      toast.success('Template hints saved');
    } catch (err: any) {
      toast.error(err?.response?.data?.error ?? 'Failed to save hints');
    } finally {
      setIsSaving(false);
    }
  };

  const reanalyzeWithHints = async (template: ExportTemplate) => {
    const templateSchema = contractDraft(template);
    if (!templateSchema) return;
    await handleAnalyze(template, templateSchema);
    setHintEditingId(null);
  };

  return (
    <div className="bg-steel-850 border border-steel-700 rounded-md p-6 space-y-6">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-lg bg-steel-800 border border-pulse/20 flex items-center justify-center">
          <FileCode2 className="w-5 h-5 text-pulse" />
        </div>
        <div>
          <h2 className="text-steel-100 font-semibold">Quest Templates</h2>
          <p className="text-steel-400 text-sm">Upload one-file quest templates for node exports</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="block text-steel-400 text-sm mb-1">Template Name</label>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="w-full bg-steel-800 border border-steel-600 rounded-lg px-3 py-2 text-steel-100 text-sm focus:outline-none focus:border-pulse"
          />
        </div>
        <div>
          <label className="block text-steel-400 text-sm mb-1">Description</label>
          <input
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            className="w-full bg-steel-800 border border-steel-600 rounded-lg px-3 py-2 text-steel-100 text-sm focus:outline-none focus:border-pulse"
          />
        </div>
        <div>
          <label className="block text-steel-400 text-sm mb-1">Input Format</label>
          <select
            value={inputFormat}
            onChange={(event) => setInputFormat(event.target.value as TemplateFormat)}
            className="w-full bg-steel-800 border border-steel-600 rounded-lg px-3 py-2 text-steel-100 text-sm focus:outline-none focus:border-pulse"
          >
            <option value="json">JSON</option>
            <option value="yaml">YAML</option>
            <option value="xml">XML</option>
          </select>
        </div>
        <div>
          <label className="block text-steel-400 text-sm mb-1">Default Output</label>
          <select
            value={outputFormat}
            onChange={(event) => setOutputFormat(event.target.value as TemplateFormat)}
            className="w-full bg-steel-800 border border-steel-600 rounded-lg px-3 py-2 text-steel-100 text-sm focus:outline-none focus:border-pulse"
          >
            <option value="yaml">YAML</option>
            <option value="json">JSON</option>
            <option value="xml">XML</option>
          </select>
        </div>
      </div>

      <div>
        <label className="block text-steel-400 text-sm mb-1">Template</label>
        <textarea
          value={rawTemplate}
          onChange={(event) => setRawTemplate(event.target.value)}
          rows={12}
          className="w-full bg-steel-950 border border-steel-600 rounded-lg px-3 py-2 text-steel-200 font-mono text-xs focus:outline-none focus:border-pulse"
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          onClick={handleSave}
          disabled={isSaving || !name.trim() || !rawTemplate.trim()}
          className="flex items-center gap-2 px-4 py-2 bg-volt hover:brightness-95 disabled:opacity-50 disabled:cursor-not-allowed text-steel-950 font-semibold rounded-lg text-sm transition-colors"
        >
          {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {editingId ? 'Update Template' : 'Save Template'}
        </button>
        {editingId && (
          <button
            onClick={resetForm}
            className="flex items-center gap-2 px-4 py-2 bg-steel-800 hover:bg-steel-700 text-steel-200 rounded-lg text-sm transition-colors"
          >
            <X className="w-4 h-4" />
            Cancel Edit
          </button>
        )}
      </div>

      <div className="border-t border-steel-700 pt-5">
        <div className="flex items-center gap-2 mb-3">
          <Plus className="w-4 h-4 text-steel-400" />
          <h3 className="text-sm font-medium text-steel-200">Saved Templates</h3>
        </div>
        {isLoading ? (
          <div className="flex items-center gap-2 text-steel-400 text-sm">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading templates...
          </div>
        ) : sortedTemplates.length === 0 ? (
          <p className="text-steel-400 text-sm">No templates saved yet.</p>
        ) : (
          <div className="space-y-2">
            {sortedTemplates.map((template) => (
              <div key={template._id} className="rounded-lg border border-steel-700 bg-steel-950/60 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-steel-100 text-sm font-medium">{template.name}</p>
                      {template.isBuiltIn && <span className="text-[10px] uppercase tracking-wide text-pulse border border-steel-600 rounded px-1.5 py-0.5">Built-in</span>}
                    </div>
                    <p className="text-steel-400 text-xs mt-1">{template.description || `${template.acceptedInputFormat.toUpperCase()} template`}</p>
                    <p className="text-steel-500 text-xs mt-1">
                      Analysis: {template.analysisStatus ?? 'fallback'}
                    </p>
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {detectedGroups(template).map((group) => (
                        <span key={group} className="text-xs text-steel-200 bg-steel-800 border border-steel-600 rounded-full px-2 py-0.5">
                          {group}
                        </span>
                      ))}
                    </div>
                  </div>
                  {!template.isBuiltIn && (
                    <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleEdit(template)}
                      className="p-2 text-steel-400 hover:text-pulse hover:bg-steel-800 rounded-lg transition-colors"
                      title="Edit template"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleAnalyze(template)}
                      disabled={analyzingId === template._id}
                      className="p-2 text-steel-400 hover:text-blue-300 hover:bg-blue-950/30 rounded-lg transition-colors disabled:opacity-50"
                      title="Re-analyze template"
                    >
                      {analyzingId === template._id ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCcw className="w-4 h-4" />}
                    </button>
                    <button
                      onClick={() => handleDelete(template)}
                      className="p-2 text-steel-400 hover:text-red-300 hover:bg-red-950/30 rounded-lg transition-colors"
                      title="Delete template"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                    </div>
                  )}
                </div>
                {!template.isBuiltIn && hintEditingId === template._id ? (
                  <div className="mt-4 border-t border-steel-700 pt-4 space-y-3">
                    <div>
                      <label className="block text-steel-400 text-xs uppercase tracking-wide mb-1">Field Hints JSON</label>
                      <textarea
                        value={fieldHintsDraft}
                        onChange={(event) => setFieldHintsDraft(event.target.value)}
                        rows={5}
                        className="w-full bg-steel-950 border border-steel-600 rounded-lg px-3 py-2 text-steel-200 font-mono text-xs focus:outline-none focus:border-pulse"
                      />
                    </div>
                    <div>
                      <label className="block text-steel-400 text-xs uppercase tracking-wide mb-1">Relationship Hints JSON</label>
                      <textarea
                        value={relationshipHintsDraft}
                        onChange={(event) => setRelationshipHintsDraft(event.target.value)}
                        rows={5}
                        className="w-full bg-steel-950 border border-steel-600 rounded-lg px-3 py-2 text-steel-200 font-mono text-xs focus:outline-none focus:border-pulse"
                      />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-steel-400 text-xs uppercase tracking-wide mb-1">Generation Hints</label>
                        <textarea
                          value={generationHintsDraft}
                          onChange={(event) => setGenerationHintsDraft(event.target.value)}
                          rows={4}
                          placeholder="One hint per line"
                          className="w-full bg-steel-950 border border-steel-600 rounded-lg px-3 py-2 text-steel-200 text-xs focus:outline-none focus:border-pulse"
                        />
                      </div>
                      <div>
                        <label className="block text-steel-400 text-xs uppercase tracking-wide mb-1">User Examples</label>
                        <textarea
                          value={userExamplesDraft}
                          onChange={(event) => setUserExamplesDraft(event.target.value)}
                          rows={4}
                          placeholder="One example or correction per line"
                          className="w-full bg-steel-950 border border-steel-600 rounded-lg px-3 py-2 text-steel-200 text-xs focus:outline-none focus:border-pulse"
                        />
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => saveHints(template)}
                        disabled={isSaving}
                        className="px-3 py-2 bg-volt hover:brightness-95 disabled:opacity-50 text-steel-950 font-semibold rounded-lg text-xs"
                      >
                        Save hints
                      </button>
                      <button
                        type="button"
                        onClick={() => reanalyzeWithHints(template)}
                        disabled={analyzingId === template._id}
                        className="px-3 py-2 bg-steel-800 hover:bg-steel-700 disabled:opacity-50 text-steel-200 rounded-lg text-xs"
                      >
                        Re-analyze with examples
                      </button>
                      <button
                        type="button"
                        onClick={() => setHintEditingId(null)}
                        className="px-3 py-2 bg-steel-900 hover:bg-steel-800 text-steel-300 rounded-lg text-xs"
                      >
                        Close
                      </button>
                    </div>
                  </div>
                ) : !template.isBuiltIn ? (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => startHintEdit(template)}
                      className="text-xs text-pulse hover:text-pulse"
                    >
                      Edit generation hints
                    </button>
                    <span className="text-xs text-steel-500">
                      {(template.templateSchema?.generationContract?.fieldHints?.length ?? 0)} field hints,
                      {' '}{(template.templateSchema?.generationContract?.relationshipHints?.length ?? 0)} relationships
                    </span>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
