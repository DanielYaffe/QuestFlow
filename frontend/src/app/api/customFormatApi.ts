import api from './axiosInstance';

export interface BindingRule {
  type: 'const' | 'field' | 'repeat' | 'item' | 'item-field';
  field?: string;
  over?: string;
}

export interface CustomFormat {
  id: string;
  name: string;
  extension: string;
  fileNamePattern: string;
  example: unknown;
  bindings: Record<string, BindingRule>;
}

export interface CustomFormatDraft {
  name: string;
  extension: string;
  fileNamePattern: string;
  example: unknown;
  bindings: Record<string, BindingRule>;
}

export async function listCustomFormats(): Promise<CustomFormat[]> {
  const { data } = await api.get('/custom-formats');
  return data;
}

export async function createCustomFormat(draft: CustomFormatDraft): Promise<CustomFormat> {
  const { data } = await api.post('/custom-formats', draft);
  return data;
}

export async function deleteCustomFormat(id: string): Promise<void> {
  await api.delete(`/custom-formats/${id}`);
}

export async function previewSample(
  draft: CustomFormatDraft,
): Promise<{ fileName: string; content: string }> {
  const { data } = await api.post('/custom-formats/preview-sample', draft);
  return data;
}

/** Quest fields available for binding (shown in the editor dropdowns). */
export const QUEST_FIELDS: { value: string; label: string }[] = [
  { value: 'id',                  label: 'Quest export id (quest_1)' },
  { value: 'nodeId',              label: 'Quest node id (numeric)' },
  { value: 'title',               label: 'Quest title' },
  { value: 'variant',             label: 'Quest variant' },
  { value: 'body',                label: 'Quest body' },
  { value: 'questline.id',        label: 'Questline id' },
  { value: 'questline.title',     label: 'Questline title' },
  { value: 'questline.genre',     label: 'Questline genre' },
  { value: 'questline.description', label: 'Questline description' },
];

/** Array fields that can be bound whole or drive a repeat. */
export const ARRAY_FIELDS: { value: string; label: string; hasSubFields?: boolean }[] = [
  { value: 'monsters',     label: 'Monsters (monster ids)' },
  { value: 'rewards',      label: 'Rewards (reward ids)' },
  { value: 'npcs',         label: 'NPCs (character ids)' },
  { value: 'prevQuestIds', label: 'Previous quest ids' },
  { value: 'objectives',   label: 'Objectives', hasSubFields: true },
];

/** Fields accessible on each objective item inside a repeat. */
export const OBJECTIVE_ITEM_FIELDS: { value: string; label: string }[] = [
  { value: 'id',          label: 'Objective id' },
  { value: 'title',       label: 'Objective title' },
  { value: 'description', label: 'Objective description' },
];
