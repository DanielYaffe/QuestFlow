import api from './axiosInstance';

// ---------------------------------------------------------------------------
// Games own one knowledge base each (vector-indexed on the backend). Projects
// and questlines can link a gameId to ground quest generation in its KB.
// ---------------------------------------------------------------------------

export type KbType = 'lore' | 'quests' | 'characters' | 'dialogue';
export const KB_TYPES: KbType[] = ['lore', 'quests', 'characters', 'dialogue'];

export type DocStatus = 'pending' | 'ready' | 'failed';

export interface Game {
  _id: string;
  ownerId: string;
  name: string;
  description: string;
  documentCount?: number; // present on the list endpoint
  createdAt: string;
  updatedAt: string;
}

export interface KbDocument {
  _id: string;
  gameId: string;
  type: KbType;
  title: string;
  sourceFilename?: string;
  originalText?: string; // only on the get-one endpoint
  chunkCount: number;
  metadata: Record<string, unknown>;
  status: DocStatus;
  statusError: string;
  createdAt: string;
  updatedAt: string;
}

export interface KbSearchResult {
  text: string;
  score: number;
  docId: string;
  title: string;
}

// --- Games -----------------------------------------------------------------

export async function listGames(): Promise<Game[]> {
  const { data } = await api.get<Game[]>('/games');
  return data;
}

export async function getGame(gameId: string): Promise<Game> {
  const { data } = await api.get<Game>(`/games/${gameId}`);
  return data;
}

export async function createGame(name: string, description = ''): Promise<Game> {
  const { data } = await api.post<Game>('/games', { name, description });
  return data;
}

export async function updateGame(
  gameId: string,
  patch: { name?: string; description?: string },
): Promise<Game> {
  const { data } = await api.put<Game>(`/games/${gameId}`, patch);
  return data;
}

export async function deleteGame(gameId: string): Promise<void> {
  await api.delete(`/games/${gameId}`);
}

// --- KB documents ----------------------------------------------------------

export async function listKbDocuments(gameId: string): Promise<KbDocument[]> {
  const { data } = await api.get<KbDocument[]>(`/games/${gameId}/kb/documents`);
  return data;
}

export async function getKbDocument(gameId: string, docId: string): Promise<KbDocument> {
  const { data } = await api.get<KbDocument>(`/games/${gameId}/kb/documents/${docId}`);
  return data;
}

export async function ingestKbDocument(
  gameId: string,
  input: { type: KbType; title: string; text: string; sourceFilename?: string },
): Promise<{ docId: string; status: DocStatus }> {
  const { data } = await api.post<{ docId: string; status: DocStatus }>(
    `/games/${gameId}/kb/ingest`,
    input,
  );
  return data;
}

export async function editKbDocument(
  gameId: string,
  docId: string,
  patch: { title?: string; text?: string; metadata?: Record<string, unknown> },
): Promise<{ success: boolean; reEmbedded: boolean }> {
  const { data } = await api.put<{ success: boolean; reEmbedded: boolean }>(
    `/games/${gameId}/kb/documents/${docId}`,
    patch,
  );
  return data;
}

export async function retryKbDocument(gameId: string, docId: string): Promise<void> {
  await api.post(`/games/${gameId}/kb/documents/${docId}/retry`);
}

export async function deleteKbDocument(gameId: string, docId: string): Promise<void> {
  await api.delete(`/games/${gameId}/kb/documents/${docId}`);
}

// --- Test search -----------------------------------------------------------

export async function searchKb(
  gameId: string,
  query: string,
  type: KbType,
  topK = 5,
): Promise<KbSearchResult[]> {
  const { data } = await api.get<{ results: KbSearchResult[] }>(`/games/${gameId}/kb/search`, {
    params: { q: query, type, topK },
  });
  return data.results;
}
