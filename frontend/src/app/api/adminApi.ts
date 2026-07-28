import api from './axiosInstance';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Me {
  _id: string;
  email: string;
  role: 'user' | 'admin';
}

export interface StyleLora {
  loraFilename: string;
  strength: number;
  strengthClip: number;
  triggerWord?: string;
}

export interface SamplerParams {
  steps: number;
  cfg: number;
  sampler: string;
  scheduler: string;
}

export type StyleCategory = 'pixel' | 'illustrated' | 'realistic' | 'raw';

export interface AdminSpriteStyle {
  _id: string;
  styleId: string;
  name: string;
  description: string;
  previewImagePath: string;
  category: StyleCategory;
  baseModel: 'SDXL' | 'SD1.5' | 'Flux';
  checkpointFilename: string;
  loras: StyleLora[];
  promptPrefix: string;
  negativePrompt: string;
  defaultDimensions: { width: number; height: number };
  removeBackground: boolean;
  targetSize?: number;
  sampler: SamplerParams;
  presetId?: string;
  isDefault: boolean;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowPresetInfo {
  presetId: string;
  name: string;
  description: string;
  supportsLoras: boolean;
  samplerEditable: boolean;
  defaultSampler: SamplerParams;
}

export interface StyleMutationResult {
  style: AdminSpriteStyle;
  warnings: string[];
}

export interface CreateStylePayload {
  styleId: string;
  name: string;
  description?: string;
  previewImagePath?: string;
  category: StyleCategory;
  baseModel?: 'SDXL' | 'SD1.5' | 'Flux';
  checkpointFilename: string;
  loras?: StyleLora[];
  promptPrefix?: string;
  negativePrompt?: string;
  defaultDimensions?: { width: number; height: number };
  removeBackground?: boolean;
  // null clears a previously set value; undefined leaves it unchanged
  targetSize?: number | null;
  sampler?: SamplerParams;
  presetId: string;
  isActive?: boolean;
}

export type UpdateStylePayload = Partial<Omit<CreateStylePayload, 'styleId'>>;

export interface AdminCheckpoint {
  _id: string;
  filename: string;
  displayName: string;
  baseModel: 'SDXL' | 'SD1.5' | 'Flux';
  source: 'civitai' | 'huggingface' | 'handmade';
  sourceUrl?: string;
  description?: string;
  isActive: boolean;
}

export interface AdminLora {
  _id: string;
  filename: string;
  displayName: string;
  triggerWord?: string;
  defaultStrength: number;
  defaultStrengthClip: number;
  source: 'civitai' | 'huggingface' | 'handmade';
  sourceUrl?: string;
  description?: string;
  isActive: boolean;
}

export type CreateCheckpointPayload = Omit<AdminCheckpoint, '_id' | 'isActive'> & { isActive?: boolean };
export type UpdateCheckpointPayload = Partial<Omit<CreateCheckpointPayload, 'filename'>>;
export type CreateLoraPayload = Omit<AdminLora, '_id' | 'isActive'> & { isActive?: boolean };
export type UpdateLoraPayload = Partial<Omit<CreateLoraPayload, 'filename'>>;

export interface ComfyModels {
  reachable: boolean;
  checkpoints: string[];
  loras: string[];
  samplers: string[];
  schedulers: string[];
}

export interface AdminUser {
  _id: string;
  email: string;
  role: 'user' | 'admin';
  usesGoogleLogin: boolean;
}

// ---------------------------------------------------------------------------
// Calls
// ---------------------------------------------------------------------------

export async function getMe(): Promise<Me> {
  const { data } = await api.get<Me>('/auth/me');
  return data;
}

export async function getWorkflowPresets(): Promise<WorkflowPresetInfo[]> {
  const { data } = await api.get<WorkflowPresetInfo[]>('/admin/workflow-presets');
  return data;
}

export async function getAdminStyles(): Promise<AdminSpriteStyle[]> {
  const { data } = await api.get<AdminSpriteStyle[]>('/admin/styles');
  return data;
}

export async function createAdminStyle(payload: CreateStylePayload): Promise<StyleMutationResult> {
  const { data } = await api.post<StyleMutationResult>('/admin/styles', payload);
  return data;
}

export async function updateAdminStyle(styleId: string, payload: UpdateStylePayload): Promise<StyleMutationResult> {
  const { data } = await api.put<StyleMutationResult>(`/admin/styles/${styleId}`, payload);
  return data;
}

export async function setDefaultAdminStyle(styleId: string): Promise<AdminSpriteStyle> {
  const { data } = await api.post<AdminSpriteStyle>(`/admin/styles/${styleId}/default`);
  return data;
}

export async function reorderAdminStyles(styleIds: string[]): Promise<void> {
  await api.post('/admin/styles/reorder', { styleIds });
}

export async function deleteAdminStyle(styleId: string): Promise<void> {
  await api.delete(`/admin/styles/${styleId}`);
}

export async function getAdminCheckpoints(): Promise<AdminCheckpoint[]> {
  const { data } = await api.get<AdminCheckpoint[]>('/admin/checkpoints');
  return data;
}

export async function createAdminCheckpoint(payload: CreateCheckpointPayload): Promise<AdminCheckpoint> {
  const { data } = await api.post<AdminCheckpoint>('/admin/checkpoints', payload);
  return data;
}

export async function updateAdminCheckpoint(filename: string, payload: UpdateCheckpointPayload): Promise<AdminCheckpoint> {
  const { data } = await api.put<AdminCheckpoint>(`/admin/checkpoints/${encodeURIComponent(filename)}`, payload);
  return data;
}

export async function deleteAdminCheckpoint(filename: string): Promise<void> {
  await api.delete(`/admin/checkpoints/${encodeURIComponent(filename)}`);
}

export async function getAdminLoras(): Promise<AdminLora[]> {
  const { data } = await api.get<AdminLora[]>('/admin/loras');
  return data;
}

export async function createAdminLora(payload: CreateLoraPayload): Promise<AdminLora> {
  const { data } = await api.post<AdminLora>('/admin/loras', payload);
  return data;
}

export async function updateAdminLora(filename: string, payload: UpdateLoraPayload): Promise<AdminLora> {
  const { data } = await api.put<AdminLora>(`/admin/loras/${encodeURIComponent(filename)}`, payload);
  return data;
}

export async function deleteAdminLora(filename: string): Promise<void> {
  await api.delete(`/admin/loras/${encodeURIComponent(filename)}`);
}

export async function getComfyModels(): Promise<ComfyModels> {
  const { data } = await api.get<ComfyModels>('/admin/comfy/models');
  return data;
}

export async function getAdminUsers(): Promise<AdminUser[]> {
  const { data } = await api.get<AdminUser[]>('/admin/users');
  return data;
}

export async function setAdminUserRole(userId: string, role: 'user' | 'admin'): Promise<AdminUser> {
  const { data } = await api.put<AdminUser>(`/admin/users/${userId}/role`, { role });
  return data;
}
