import { Response } from 'express';
import { z } from 'zod';
import { AuthRequest } from '../middlewares/authMiddleware';
import * as gameService from '../services/gameService';
import * as kbService from '../services/kbService';
import * as ragService from '../services/ragService';
import { KB_TYPES, KbType } from '../services/qdrant';

// ---------------------------------------------------------------------------
// /games — Game (KB owner) CRUD + knowledge-base document endpoints.
// Every KB route resolves the Game through an ownership check first: the raw
// :gameId from the URL is never trusted for Qdrant collection naming.
// ---------------------------------------------------------------------------

const kbTypeSchema = z.enum(KB_TYPES as [KbType, ...KbType[]]);

const ingestSchema = z.object({
  type: kbTypeSchema,
  title: z.string().trim().min(1).max(200),
  text: z.string().min(1).max(1_000_000),
  sourceFilename: z.string().max(300).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const editSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  text: z.string().min(1).max(1_000_000).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const searchSchema = z.object({
  q: z.string().trim().min(1).max(1_000),
  type: kbTypeSchema,
  topK: z.coerce.number().int().min(1).max(20).default(5),
});

// Express 5 types route params as string | string[]; ours are always single.
function param(req: AuthRequest, name: string): string {
  const value = req.params[name];
  return Array.isArray(value) ? value[0] : value;
}

function requireUserId(req: AuthRequest, res: Response): string | null {
  const userId = req.user?._id;
  if (!userId) {
    res.status(401).json({ error: 'Unauthorized' });
    return null;
  }
  return userId;
}

async function resolveOwnedGame(req: AuthRequest, res: Response) {
  const userId = requireUserId(req, res);
  if (!userId) return null;
  const game = await gameService.getOwnedGame(userId, param(req, 'gameId')).catch(() => null);
  if (!game) {
    res.status(404).json({ error: 'Game not found' });
    return null;
  }
  return game;
}

// POST /games
export async function createGame(req: AuthRequest, res: Response) {
  const userId = requireUserId(req, res);
  if (!userId) return;
  const { name, description } = req.body as { name?: string; description?: string };
  if (!name?.trim()) {
    res.status(400).json({ error: 'name is required' });
    return;
  }
  try {
    const game = await gameService.createGame(userId, name, description ?? '');
    res.status(201).json(game);
  } catch (error) {
    console.error('[gameController] createGame error:', error);
    res.status(500).json({ error: 'Failed to create game' });
  }
}

// GET /games
export async function listGames(req: AuthRequest, res: Response) {
  const userId = requireUserId(req, res);
  if (!userId) return;
  try {
    res.json(await gameService.listGames(userId));
  } catch (error) {
    console.error('[gameController] listGames error:', error);
    res.status(500).json({ error: 'Failed to list games' });
  }
}

// GET /games/:gameId
export async function getGame(req: AuthRequest, res: Response) {
  try {
    const game = await resolveOwnedGame(req, res);
    if (!game) return;
    res.json(game);
  } catch (error) {
    console.error('[gameController] getGame error:', error);
    res.status(500).json({ error: 'Failed to get game' });
  }
}

// PUT /games/:gameId
export async function updateGame(req: AuthRequest, res: Response) {
  const userId = requireUserId(req, res);
  if (!userId) return;
  const { name, description } = req.body as { name?: string; description?: string };
  try {
    const game = await gameService.updateGame(userId, param(req, 'gameId'), { name, description });
    if (!game) {
      res.status(404).json({ error: 'Game not found' });
      return;
    }
    res.json(game);
  } catch (error) {
    console.error('[gameController] updateGame error:', error);
    res.status(500).json({ error: 'Failed to update game' });
  }
}

// DELETE /games/:gameId — wipes the entire Qdrant KB + KbDocuments + links
export async function deleteGame(req: AuthRequest, res: Response) {
  const userId = requireUserId(req, res);
  if (!userId) return;
  try {
    const deleted = await gameService.deleteGame(userId, param(req, 'gameId'));
    if (!deleted) {
      res.status(404).json({ error: 'Game not found' });
      return;
    }
    res.json({ message: 'Game and its knowledge base deleted' });
  } catch (error) {
    console.error('[gameController] deleteGame error:', error);
    res.status(500).json({ error: 'Failed to delete game' });
  }
}

// POST /games/:gameId/kb/ingest — 202 + docId; chunk/embed runs as a BullMQ job
export async function ingestDocument(req: AuthRequest, res: Response) {
  try {
    const game = await resolveOwnedGame(req, res);
    if (!game) return;
    const body = ingestSchema.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: z.flattenError(body.error).fieldErrors });
      return;
    }
    const docId = await kbService.ingestDocument({
      gameId: game._id.toString(),
      ...body.data,
    });
    res.status(202).json({ docId, status: 'pending' });
  } catch (error) {
    console.error('[gameController] ingestDocument error:', error);
    res.status(500).json({ error: 'Failed to ingest document' });
  }
}

// GET /games/:gameId/kb/documents
export async function listDocuments(req: AuthRequest, res: Response) {
  try {
    const game = await resolveOwnedGame(req, res);
    if (!game) return;
    res.json(await kbService.listDocuments(game._id.toString()));
  } catch (error) {
    console.error('[gameController] listDocuments error:', error);
    res.status(500).json({ error: 'Failed to list documents' });
  }
}

// GET /games/:gameId/kb/documents/:docId — includes originalText (edit view)
export async function getDocument(req: AuthRequest, res: Response) {
  try {
    const game = await resolveOwnedGame(req, res);
    if (!game) return;
    const doc = await kbService.getDocument(game._id.toString(), param(req, 'docId'));
    if (!doc) {
      res.status(404).json({ error: 'Document not found' });
      return;
    }
    res.json(doc);
  } catch (error) {
    console.error('[gameController] getDocument error:', error);
    res.status(500).json({ error: 'Failed to get document' });
  }
}

// PUT /games/:gameId/kb/documents/:docId — text change re-embeds (job);
// title/metadata-only is instant
export async function editDocument(req: AuthRequest, res: Response) {
  try {
    const game = await resolveOwnedGame(req, res);
    if (!game) return;
    const body = editSchema.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: z.flattenError(body.error).fieldErrors });
      return;
    }
    const doc = await kbService.getDocument(game._id.toString(), param(req, 'docId'));
    if (!doc) {
      res.status(404).json({ error: 'Document not found' });
      return;
    }
    const { reEmbedded } = await kbService.editDocument(doc, body.data);
    res.json({ success: true, reEmbedded });
  } catch (error) {
    console.error('[gameController] editDocument error:', error);
    res.status(500).json({ error: 'Failed to edit document' });
  }
}

// POST /games/:gameId/kb/documents/:docId/retry — re-run a failed ingestion
export async function retryDocument(req: AuthRequest, res: Response) {
  try {
    const game = await resolveOwnedGame(req, res);
    if (!game) return;
    const doc = await kbService.getDocument(game._id.toString(), param(req, 'docId'));
    if (!doc) {
      res.status(404).json({ error: 'Document not found' });
      return;
    }
    if (doc.status !== 'failed') {
      res.status(400).json({ error: 'Only failed documents can be retried' });
      return;
    }
    await kbService.retryDocument(doc);
    res.status(202).json({ docId: doc._id.toString(), status: 'pending' });
  } catch (error) {
    console.error('[gameController] retryDocument error:', error);
    res.status(500).json({ error: 'Failed to retry document' });
  }
}

// DELETE /games/:gameId/kb/documents/:docId
export async function deleteDocument(req: AuthRequest, res: Response) {
  try {
    const game = await resolveOwnedGame(req, res);
    if (!game) return;
    const doc = await kbService.getDocument(game._id.toString(), param(req, 'docId'));
    if (!doc) {
      res.status(404).json({ error: 'Document not found' });
      return;
    }
    await kbService.deleteDocument(doc);
    res.json({ message: 'Document deleted' });
  } catch (error) {
    console.error('[gameController] deleteDocument error:', error);
    res.status(500).json({ error: 'Failed to delete document' });
  }
}

// GET /games/:gameId/kb/search?q=&type=&topK= — test search so users can
// verify their KB returns sensible matches
export async function searchKb(req: AuthRequest, res: Response) {
  try {
    const game = await resolveOwnedGame(req, res);
    if (!game) return;
    const query = searchSchema.safeParse(req.query);
    if (!query.success) {
      res.status(400).json({ error: z.flattenError(query.error).fieldErrors });
      return;
    }
    const results = await ragService.retrieve({
      gameId: game._id.toString(),
      type: query.data.type,
      query: query.data.q,
      topK: query.data.topK,
    });
    res.json({ results });
  } catch (error) {
    console.error('[gameController] searchKb error:', error);
    res.status(500).json({ error: 'Failed to search knowledge base' });
  }
}
