import GameModel, { IGame } from '../models/gameModel';
import ProjectModel from '../models/projectModel';
import QuestlineModel from '../models/questlineModel';
import KbDocumentModel from '../models/kbDocumentModel';
import { deleteGameKb } from './qdrant';

export async function createGame(ownerId: string, name: string, description: string): Promise<IGame> {
  return GameModel.create({ ownerId, name: name.trim(), description });
}

export interface GameListItem {
  _id: string;
  ownerId: string;
  name: string;
  description: string;
  documentCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export async function listGames(ownerId: string): Promise<GameListItem[]> {
  const games = await GameModel.find({ ownerId }).sort({ updatedAt: -1 }).lean();
  const counts = await KbDocumentModel.aggregate<{ _id: string; n: number }>([
    { $match: { gameId: { $in: games.map((g) => String(g._id)) } } },
    { $group: { _id: '$gameId', n: { $sum: 1 } } },
  ]);
  const countMap = new Map(counts.map((c) => [c._id, c.n]));
  return games.map((g) => ({
    _id: String(g._id),
    ownerId: g.ownerId,
    name: g.name,
    description: g.description,
    documentCount: countMap.get(String(g._id)) ?? 0,
    createdAt: g.createdAt,
    updatedAt: g.updatedAt,
  }));
}

export async function getOwnedGame(ownerId: string, gameId: string): Promise<IGame | null> {
  return GameModel.findOne({ _id: gameId, ownerId });
}

/** True when gameId names a Game owned by ownerId. Used to validate KB links. */
export async function ownsGame(ownerId: string, gameId: string): Promise<boolean> {
  return (await GameModel.exists({ _id: gameId, ownerId })) !== null;
}

export async function updateGame(
  ownerId: string,
  gameId: string,
  fields: { name?: string; description?: string },
): Promise<IGame | null> {
  const game = await GameModel.findOne({ _id: gameId, ownerId });
  if (!game) return null;
  if (fields.name !== undefined) game.name = fields.name;
  if (fields.description !== undefined) game.description = fields.description;
  await game.save();
  return game;
}

/**
 * Delete a Game: wipe its entire Qdrant KB first (safe direction — a failure
 * leaves recoverable Mongo rows, never orphaned vectors), then the KbDocument
 * registry, then the Game itself, and finally clear dangling links.
 */
export async function deleteGame(ownerId: string, gameId: string): Promise<boolean> {
  const game = await GameModel.findOne({ _id: gameId, ownerId });
  if (!game) return false;

  await deleteGameKb(gameId);
  await KbDocumentModel.deleteMany({ gameId });
  await GameModel.deleteOne({ _id: gameId });
  await Promise.all([
    ProjectModel.updateMany({ gameId }, { $set: { gameId: '' } }),
    QuestlineModel.updateMany({ gameId }, { $set: { gameId: '' } }),
  ]);
  return true;
}
