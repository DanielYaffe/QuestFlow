import api from './axiosInstance';
import { ExportFile, Format } from './questExportApi';

export interface EditMeta {
  title:       string;
  description: string;
  genre:       string;
}

export interface EditNode {
  _ref:      string;
  nodeId:    string;
  title:     string;
  body:      string;
  variant:   string;
  exportKey: string;
}

export interface EditCharacter {
  _ref:       string;
  name:       string;
  appearance: string;
  background: string;
  exportKey:  string;
}

export interface EditReward {
  _ref:        string;
  title:       string;
  description: string;
  rarity:      'common' | 'rare' | 'epic';
  exportKey:   string;
}

export interface EditObjective {
  _ref:        string;
  title:       string;
  description: string;
}

export interface EditQuestData {
  meta:       EditMeta;
  nodes:      EditNode[];
  characters: EditCharacter[];
  rewards:    EditReward[];
  objectives: EditObjective[];
}

export async function getEditData(questlineId: string): Promise<EditQuestData> {
  const { data } = await api.get(`/questlines/${questlineId}/edit-data`);
  return data;
}

export async function renderPreview(
  questlineId: string,
  format: Format,
  edits: EditQuestData,
): Promise<{ files: ExportFile[] }> {
  const { data } = await api.post(`/questlines/${questlineId}/render-preview`, {
    format,
    ...edits,
  });
  return data;
}

export async function saveEditData(
  questlineId: string,
  edits: EditQuestData,
): Promise<void> {
  await api.put(`/questlines/${questlineId}/edit-data`, edits);
}
