import React, { useEffect, useMemo, useState } from 'react';
import { Copy, Edit3, FileCode2, Loader2, Plus, RefreshCcw, Save, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import {
  analyzeExportTemplate,
  analyzeTemplateKbMappings,
  createExportTemplate,
  deleteExportTemplate,
  ExportTemplate,
  fetchExportTemplates,
  fetchTemplateKbMappings,
  saveRequiredFieldPaths,
  saveTemplateKbMappings,
  TemplateKbMappingEntry,
  TemplateSchema,
  TemplateFormat,
  updateExportTemplate,
} from '../../../api/exportTemplateApi';
import { Game, KB_TYPES, listGames } from '../../../api/gameApi';
import { useProject } from '../../../context/ProjectContext';

const DEFAULT_TEMPLATE = `{
  "id": 1,
  "title": "Quest Title",
  "prerequisites": {
    "requiredQuestIds": []
  },
  "objectives": [
    { "type": "objective_type", "targetId": 0, "amount": 1 }
  ],
  "dialogue": [
    { "id": "intro", "speakerId": 0, "text": "Player-facing quest text." }
  ],
  "rewards": [
    { "type": "reward_type", "targetId": 0, "amount": 1 }
  ]
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

function templateFieldOptions(template: ExportTemplate) {
  const fields = template.templateSchema?.editableFields ?? template.fieldSchema ?? [];
  return fields.flatMap((field) => [
    {
      path: field.path,
      valueType: field.valueType ?? 'string',
    },
    ...(field.itemSchema ?? []).map((item) => ({
      path: `${field.path}[].${item.path}`,
      valueType: item.valueType,
    })),
  ]);
}

export function QuestTemplateSettingsCard() {
  const { activeProject } = useProject();
  const [templates, setTemplates] = useState<ExportTemplate[]>([]);
  const [games, setGames] = useState<Game[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [analyzingId, setAnalyzingId] = useState<string | null>(null);
  const [mappingEditingId, setMappingEditingId] = useState<string | null>(null);
  const [mappingGameId, setMappingGameId] = useState('');
  const [mappingLoadingId, setMappingLoadingId] = useState<string | null>(null);
  const [mappingDrafts, setMappingDrafts] = useState<Record<string, TemplateKbMappingEntry[]>>({});
  // Required-field marks are edited per template and saved as a whole set.
  const [requiredEditingId, setRequiredEditingId] = useState<string | null>(null);
  const [requiredSavingId, setRequiredSavingId] = useState<string | null>(null);
  const [requiredDrafts, setRequiredDrafts] = useState<Record<string, string[]>>({});
  const [name, setName] = useState('Generic Quest');
  const [description, setDescription] = useState('Quest-node export template');
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
    listGames().then(setGames).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!mappingGameId && activeProject?.gameId) setMappingGameId(activeProject.gameId);
  }, [activeProject?.gameId, mappingGameId]);

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
    setName('Generic Quest');
    setDescription('Quest-node export template');
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

  const loadMappings = async (template: ExportTemplate) => {
    if (!mappingGameId) {
      toast.error('Select a game KB before editing mappings');
      return;
    }
    setMappingLoadingId(template._id);
    try {
      const mapping = await fetchTemplateKbMappings(template._id, mappingGameId);
      setMappingDrafts((prev) => ({ ...prev, [template._id]: mapping.entries ?? [] }));
      setMappingEditingId(template._id);
    } catch (err: any) {
      toast.error(err?.response?.data?.error ?? 'Failed to load KB mappings');
    } finally {
      setMappingLoadingId(null);
    }
  };

  const copyTemplate = async (template: ExportTemplate) => {
    setIsSaving(true);
    try {
      const created = await createExportTemplate({
        name: `${template.name} Copy`,
        description: template.description,
        rawTemplate: template.rawTemplate,
        inputFormat: template.acceptedInputFormat,
        defaultOutputFormat: template.defaultOutputFormat,
        templateSchema: template.templateSchema,
      });
      setTemplates((prev) => [...prev, created]);
      toast.success('Editable template copy created');
    } catch (err: any) {
      toast.error(err?.response?.data?.error ?? 'Failed to copy template');
    } finally {
      setIsSaving(false);
    }
  };

  const analyzeMappings = async (template: ExportTemplate) => {
    if (!mappingGameId) {
      toast.error('Select a game KB before analyzing mappings');
      return;
    }
    setMappingLoadingId(template._id);
    try {
      const mapping = await analyzeTemplateKbMappings(template._id, mappingGameId);
      setMappingDrafts((prev) => ({ ...prev, [template._id]: mapping.entries ?? [] }));
      setMappingEditingId(template._id);
      if ((mapping.entries ?? []).length === 0) {
        toast.warning('No mappings found', {
          description: 'Make sure the selected game KB has ready structured NPC, item, monster, or quest records.',
        });
      } else {
        toast.success(`KB mappings analyzed: ${(mapping.entries ?? []).length} proposed`);
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.error ?? 'Failed to analyze KB mappings');
    } finally {
      setMappingLoadingId(null);
    }
  };

  const saveMappings = async (template: ExportTemplate) => {
    if (!mappingGameId) return;
    setIsSaving(true);
    try {
      const mapping = await saveTemplateKbMappings(template._id, mappingGameId, mappingDrafts[template._id] ?? []);
      setMappingDrafts((prev) => ({ ...prev, [template._id]: mapping.entries ?? [] }));
      toast.success('KB mappings saved');
    } catch (err: any) {
      toast.error(err?.response?.data?.error ?? 'Failed to save KB mappings');
    } finally {
      setIsSaving(false);
    }
  };

  const updateMappingDraft = (templateId: string, index: number, patch: Partial<TemplateKbMappingEntry>) => {
    setMappingDrafts((prev) => ({
      ...prev,
      [templateId]: (prev[templateId] ?? []).map((entry, entryIndex) => (
        entryIndex === index ? { ...entry, ...patch } : entry
      )),
    }));
  };

  const removeMappingDraft = (templateId: string, index: number) => {
    setMappingDrafts((prev) => ({
      ...prev,
      [templateId]: (prev[templateId] ?? []).filter((_, entryIndex) => entryIndex !== index),
    }));
  };

  const startRequiredEdit = (template: ExportTemplate) => {
    setRequiredDrafts((prev) => ({ ...prev, [template._id]: template.requiredFieldPaths ?? [] }));
    setRequiredEditingId(template._id);
  };

  const toggleRequired = (templateId: string, path: string, checked: boolean) => {
    setRequiredDrafts((prev) => {
      const current = prev[templateId] ?? [];
      return {
        ...prev,
        [templateId]: checked ? [...new Set([...current, path])] : current.filter((item) => item !== path),
      };
    });
  };

  const saveRequired = async (template: ExportTemplate) => {
    setRequiredSavingId(template._id);
    try {
      const saved = await saveRequiredFieldPaths(template._id, requiredDrafts[template._id] ?? []);
      setTemplates((prev) => prev.map((item) => (item._id === saved._id ? saved : item)));
      setRequiredEditingId(null);
      toast.success(`${(saved.requiredFieldPaths ?? []).length} required field(s) saved`);
    } catch (err: any) {
      toast.error(err?.response?.data?.error ?? 'Failed to save required fields');
    } finally {
      setRequiredSavingId(null);
    }
  };

  const addMappingDraft = (template: ExportTemplate) => {
    const firstField = templateFieldOptions(template)[0];
    setMappingDrafts((prev) => ({
      ...prev,
      [template._id]: [
        ...(prev[template._id] ?? []),
        {
          templatePath: firstField?.path ?? '',
          kbType: 'general',
          kbFieldPath: 'fields.id',
          valueType: (firstField?.valueType ?? 'string') as TemplateKbMappingEntry['valueType'],
          purpose: '',
          status: 'validated',
          confidence: 1,
          explanation: 'Manual mapping.',
        },
      ],
    }));
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
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3 mb-3">
          <div className="flex items-center gap-2">
            <Plus className="w-4 h-4 text-steel-400" />
            <h3 className="text-sm font-medium text-steel-200">Saved Templates</h3>
          </div>
          <div className="w-full md:w-72">
            <label className="block text-steel-500 text-xs mb-1">Game KB for mappings</label>
            <select
              value={mappingGameId}
              onChange={(event) => {
                setMappingGameId(event.target.value);
                setMappingEditingId(null);
                setMappingDrafts({});
              }}
              className="w-full bg-steel-800 border border-steel-600 rounded-lg px-3 py-2 text-steel-100 text-sm focus:outline-none focus:border-pulse"
            >
              <option value="">Select game KB...</option>
              {games.map((game) => (
                <option key={game._id} value={game._id}>{game.name}</option>
              ))}
            </select>
          </div>
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
                  <div className="flex items-center gap-1">
                    {template.isBuiltIn ? (
                      <button
                        onClick={() => copyTemplate(template)}
                        disabled={isSaving}
                        className="p-2 text-steel-400 hover:text-pulse hover:bg-steel-800 rounded-lg transition-colors disabled:opacity-50"
                        title="Copy to editable template"
                      >
                        <Copy className="w-4 h-4" />
                      </button>
                    ) : (
                      <>
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
                      </>
                    )}
                  </div>
                </div>
                {hintEditingId === template._id ? (
                  <div className="mt-4 border-t border-steel-700 pt-4 space-y-3">
                    {template.isBuiltIn && (
                      <p className="text-steel-400 text-xs">
                        Built-in templates are read-only. Copy this template to create an editable version.
                      </p>
                    )}
                    <div>
                      <label className="block text-steel-400 text-xs uppercase tracking-wide mb-1">Field Hints JSON</label>
                      <textarea
                        value={fieldHintsDraft}
                        onChange={(event) => setFieldHintsDraft(event.target.value)}
                        readOnly={template.isBuiltIn}
                        rows={5}
                        className="w-full bg-steel-950 border border-steel-600 rounded-lg px-3 py-2 text-steel-200 font-mono text-xs focus:outline-none focus:border-pulse"
                      />
                    </div>
                    <div>
                      <label className="block text-steel-400 text-xs uppercase tracking-wide mb-1">Relationship Hints JSON</label>
                      <textarea
                        value={relationshipHintsDraft}
                        onChange={(event) => setRelationshipHintsDraft(event.target.value)}
                        readOnly={template.isBuiltIn}
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
                          readOnly={template.isBuiltIn}
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
                          readOnly={template.isBuiltIn}
                          rows={4}
                          placeholder="One example or correction per line"
                          className="w-full bg-steel-950 border border-steel-600 rounded-lg px-3 py-2 text-steel-200 text-xs focus:outline-none focus:border-pulse"
                        />
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {!template.isBuiltIn && (
                        <>
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
                        </>
                      )}
                      {template.isBuiltIn && (
                        <button
                          type="button"
                          onClick={() => copyTemplate(template)}
                          disabled={isSaving}
                          className="px-3 py-2 bg-volt hover:brightness-95 disabled:opacity-50 text-steel-950 font-semibold rounded-lg text-xs"
                        >
                          Copy to edit
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setHintEditingId(null)}
                        className="px-3 py-2 bg-steel-900 hover:bg-steel-800 text-steel-300 rounded-lg text-xs"
                      >
                        Close
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-3 border-t border-steel-800 pt-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-steel-200 text-xs font-medium">Generation hints</p>
                        <p className="text-steel-500 text-xs">
                          {(template.templateSchema?.generationContract?.fieldHints?.length ?? 0)} field hints,
                          {' '}{(template.templateSchema?.generationContract?.relationshipHints?.length ?? 0)} relationships,
                          {' '}{(template.templateSchema?.generationContract?.generationHints?.length ?? 0)} generation notes,
                          {' '}{(template.templateSchema?.generationContract?.userExamples?.length ?? 0)} examples
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => startHintEdit(template)}
                        className="px-3 py-2 bg-steel-800 hover:bg-steel-700 text-steel-200 rounded-lg text-xs"
                      >
                        {template.isBuiltIn ? 'View hints' : 'View / edit hints'}
                      </button>
                    </div>
                  </div>
                )}
                <div className="mt-3 border-t border-steel-800 pt-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-steel-200 text-xs font-medium">Required fields</p>
                      <p className="text-steel-500 text-xs">
                        Fields every quest node must fill. Empty ones are flagged in the node editor.
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <span className="px-3 py-2 text-steel-400 text-xs">
                        {(requiredDrafts[template._id] ?? template.requiredFieldPaths ?? []).length} marked
                      </span>
                      {requiredEditingId === template._id ? (
                        <>
                          <button
                            type="button"
                            onClick={() => saveRequired(template)}
                            disabled={requiredSavingId === template._id}
                            className="px-3 py-2 bg-pulse/20 hover:bg-pulse/30 disabled:opacity-50 text-pulse rounded-lg text-xs"
                          >
                            {requiredSavingId === template._id ? 'Saving...' : 'Save required'}
                          </button>
                          <button
                            type="button"
                            onClick={() => setRequiredEditingId(null)}
                            className="px-3 py-2 bg-steel-800 hover:bg-steel-700 text-steel-200 rounded-lg text-xs"
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          onClick={() => startRequiredEdit(template)}
                          disabled={template.isBuiltIn}
                          title={template.isBuiltIn ? 'Built-in templates cannot be edited' : undefined}
                          className="px-3 py-2 bg-steel-800 hover:bg-steel-700 disabled:opacity-50 disabled:cursor-not-allowed text-steel-200 rounded-lg text-xs"
                        >
                          Edit required
                        </button>
                      )}
                    </div>
                  </div>
                  {requiredEditingId === template._id && (
                    <div className="mt-3 max-h-64 overflow-y-auto rounded-lg border border-steel-700 bg-steel-900/50 p-3 space-y-1">
                      {templateFieldOptions(template).length === 0 ? (
                        <p className="text-steel-500 text-xs italic">Analyze this template first to list its fields.</p>
                      ) : (
                        templateFieldOptions(template).map((field) => (
                          <label key={field.path} className="flex items-center gap-2 text-xs text-steel-300 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={(requiredDrafts[template._id] ?? []).includes(field.path)}
                              onChange={(event) => toggleRequired(template._id, field.path, event.target.checked)}
                              className="accent-pulse"
                            />
                            <span className="font-mono">{field.path}</span>
                            <span className="text-steel-600">{field.valueType}</span>
                          </label>
                        ))
                      )}
                    </div>
                  )}
                </div>
                <div className="mt-3 border-t border-steel-800 pt-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-steel-200 text-xs font-medium">KB mappings</p>
                      <p className="text-steel-500 text-xs">Map this template's fields to structured fields from the selected game KB.</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => loadMappings(template)}
                        disabled={!mappingGameId || mappingLoadingId === template._id}
                        className="px-3 py-2 bg-steel-800 hover:bg-steel-700 disabled:opacity-50 disabled:cursor-not-allowed text-steel-200 rounded-lg text-xs"
                      >
                        {mappingLoadingId === template._id && mappingEditingId !== template._id ? 'Loading...' : 'Edit mappings'}
                      </button>
                      <button
                        type="button"
                        onClick={() => analyzeMappings(template)}
                        disabled={!mappingGameId || mappingLoadingId === template._id}
                        className="px-3 py-2 bg-steel-800 hover:bg-steel-700 disabled:opacity-50 disabled:cursor-not-allowed text-steel-200 rounded-lg text-xs"
                      >
                        {mappingLoadingId === template._id ? 'Analyzing...' : 'Analyze mappings'}
                      </button>
                    </div>
                  </div>
                  {mappingEditingId === template._id && (
                    <div className="mt-3 space-y-3">
                      {(mappingDrafts[template._id] ?? []).length === 0 ? (
                        <p className="text-steel-500 text-xs italic">No mappings yet. Analyze mappings after selecting a game KB.</p>
                      ) : (
                        (mappingDrafts[template._id] ?? []).map((entry, index) => (
                          <div key={`${entry.templatePath}-${entry.kbType}-${entry.kbFieldPath}-${index}`} className="rounded-lg border border-steel-700 bg-steel-900/50 p-3 space-y-2">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                              <div>
                                <label className="block text-steel-500 text-[10px] uppercase tracking-wide mb-1">Template path</label>
                                <select
                                  value={entry.templatePath}
                                  onChange={(event) => {
                                    const option = templateFieldOptions(template).find((item) => item.path === event.target.value);
                                    updateMappingDraft(template._id, index, {
                                      templatePath: event.target.value,
                                      valueType: (option?.valueType ?? entry.valueType) as TemplateKbMappingEntry['valueType'],
                                    });
                                  }}
                                  className="w-full bg-steel-950 border border-steel-600 rounded-lg px-3 py-2 text-steel-100 text-xs focus:outline-none focus:border-pulse"
                                >
                                  {templateFieldOptions(template).map((field) => (
                                    <option key={field.path} value={field.path}>{field.path}</option>
                                  ))}
                                </select>
                              </div>
                              <div>
                                <label className="block text-steel-500 text-[10px] uppercase tracking-wide mb-1">KB type</label>
                                <select
                                  value={entry.kbType}
                                  onChange={(event) => updateMappingDraft(template._id, index, { kbType: event.target.value })}
                                  className="w-full bg-steel-950 border border-steel-600 rounded-lg px-3 py-2 text-steel-100 text-xs focus:outline-none focus:border-pulse"
                                >
                                  {KB_TYPES.map((type) => (
                                    <option key={type} value={type}>{type}</option>
                                  ))}
                                </select>
                              </div>
                              <div>
                                <label className="block text-steel-500 text-[10px] uppercase tracking-wide mb-1">KB field path</label>
                                <input
                                  value={entry.kbFieldPath}
                                  onChange={(event) => updateMappingDraft(template._id, index, { kbFieldPath: event.target.value })}
                                  className="w-full bg-steel-950 border border-steel-600 rounded-lg px-3 py-2 text-steel-100 text-xs focus:outline-none focus:border-pulse"
                                />
                              </div>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                              <select
                                value={entry.valueType}
                                onChange={(event) => updateMappingDraft(template._id, index, { valueType: event.target.value as TemplateKbMappingEntry['valueType'] })}
                                className="bg-steel-950 border border-steel-600 rounded-lg px-3 py-2 text-steel-100 text-xs focus:outline-none focus:border-pulse"
                              >
                                <option value="string">string</option>
                                <option value="number">number</option>
                                <option value="boolean">boolean</option>
                                <option value="array">array</option>
                                <option value="object">object</option>
                              </select>
                              <input
                                value={entry.purpose}
                                onChange={(event) => updateMappingDraft(template._id, index, { purpose: event.target.value })}
                                placeholder="Purpose"
                                className="bg-steel-950 border border-steel-600 rounded-lg px-3 py-2 text-steel-100 text-xs focus:outline-none focus:border-pulse"
                              />
                              <select
                                value={entry.status}
                                onChange={(event) => updateMappingDraft(template._id, index, { status: event.target.value as TemplateKbMappingEntry['status'] })}
                                className="bg-steel-950 border border-steel-600 rounded-lg px-3 py-2 text-steel-100 text-xs focus:outline-none focus:border-pulse"
                              >
                                <option value="proposed">proposed</option>
                                <option value="validated">validated</option>
                                <option value="disabled">disabled</option>
                              </select>
                              <button
                                type="button"
                                onClick={() => removeMappingDraft(template._id, index)}
                                className="px-3 py-2 text-red-300 hover:text-red-200 hover:bg-red-950/30 rounded-lg text-xs"
                              >
                                Remove
                              </button>
                            </div>
                            {entry.explanation && <p className="text-steel-500 text-xs">{entry.explanation}</p>}
                          </div>
                        ))
                      )}
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => addMappingDraft(template)}
                          className="px-3 py-2 bg-steel-800 hover:bg-steel-700 text-steel-200 rounded-lg text-xs"
                        >
                          Add mapping
                        </button>
                        <button
                          type="button"
                          onClick={() => saveMappings(template)}
                          disabled={isSaving || !mappingGameId}
                          className="px-3 py-2 bg-volt hover:brightness-95 disabled:opacity-50 text-steel-950 font-semibold rounded-lg text-xs"
                        >
                          Save mappings
                        </button>
                        <button
                          type="button"
                          onClick={() => setMappingEditingId(null)}
                          className="px-3 py-2 bg-steel-900 hover:bg-steel-800 text-steel-300 rounded-lg text-xs"
                        >
                          Close mappings
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
