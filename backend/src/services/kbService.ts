import { KbType, deleteDocumentPoints } from './qdrant';
import { embedBatch } from './ai';
import { chunkText } from './chunk';
import { canonicalEntityId, ENTITY_ID_KEYS, parseCollectionFile, ParsedEntity } from './structuredParse';
import KbDocumentModel, { IKbDocument } from '../models/kbDocumentModel';
import CharacterModel from '../models/characterModel';
import { kbQueue } from '../queues/kbQueue';

// ---------------------------------------------------------------------------
// KB document lifecycle. Controllers call this; it owns both stores. Ingest and
// re-embed enqueue a BullMQ job (chunk + embed is slow and belongs off the
// request path); the synchronous operations here are the cheap ones.
// ---------------------------------------------------------------------------

/**
 * Chunk + embed a document's text into Qdrant points (worker-side helper).
 *
 * Part 2: entity-shaped categories first try the structured collection parser —
 * one point per entity (name, role, inferred difficulty, and source fields in
 * the payload). Anything that isn't an entity collection falls back to Part
 * 1's freeform chunking; prose categories (lore/general) are always freeform.
 */
const FREEFORM_TYPES: KbType[] = ['lore', 'general'];

function stringField(fields: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = fields[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

function stringListField(fields: Record<string, unknown>, keys: string[]): string[] {
  for (const key of keys) {
    const value = fields[key];
    if (Array.isArray(value)) {
      return value.map((item) => String(item).trim()).filter(Boolean);
    }
    if (typeof value === 'string' && value.trim()) {
      return value.split(/[,;]/).map((item) => item.trim()).filter(Boolean);
    }
  }
  return [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function mergeMissingFields(
  current: Record<string, unknown>,
  source: Record<string, unknown>,
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...current };
  for (const [key, sourceValue] of Object.entries(source)) {
    if (!Object.prototype.hasOwnProperty.call(merged, key)) {
      merged[key] = sourceValue;
      continue;
    }
    if (isRecord(merged[key]) && isRecord(sourceValue)) {
      merged[key] = mergeMissingFields(merged[key] as Record<string, unknown>, sourceValue);
    }
  }
  return merged;
}

/**
 * Merge KB fields into a design's custom fields, but let the KB restate the
 * canonical id outright. Everything else is descriptive and an author edit wins;
 * an id is identity, and a copy taken from an older version of this same
 * document is precisely what needs correcting.
 */
function mergeFieldsWithCanonicalId(
  current: Record<string, unknown>,
  source: Record<string, unknown>,
): Record<string, unknown> {
  const merged = mergeMissingFields(current, source);
  for (const key of ENTITY_ID_KEYS) {
    if (key in source) merged[key] = source[key];
  }
  return merged;
}

function characterPatchFromEntity(entity: ParsedEntity, type: KbType): Record<string, unknown> {
  const fields = entity.fields;
  const appearance = stringField(fields, ['appearance', 'look', 'visual', 'description']);
  const lore = stringField(fields, ['notes', 'lore', 'background', 'bio', 'description']);
  const dialogueTraits = stringListField(fields, ['traits', 'dialogueTraits', 'dialogue_traits', 'personality']);
  const mapleId = canonicalEntityId(fields);

  const patch: Record<string, unknown> = {
    name: entity.name,
    kind: type === 'monsters' ? 'monster' : 'npc',
  };
  if (appearance) patch.appearance = appearance;
  if (lore) patch.lore = lore;
  if (dialogueTraits.length > 0) patch.dialogueTraits = dialogueTraits;
  if (mapleId) patch['maple.mapleId'] = mapleId;
  return patch;
}

export async function syncCharacterReferencesFromKb(doc: IKbDocument): Promise<void> {
  if (doc.type !== 'characters' && doc.type !== 'monsters') return;

  const entities = parseCollectionFile(doc.originalText);
  if (!entities?.length) return;

  const docId = doc._id.toString();
  const singleEntityDoc = entities.length === 1;
  for (const entity of entities) {
    const filters: Record<string, unknown>[] = [
      { kbRef: `${doc.gameId}:${entity.name}` },
    ];
    if (singleEntityDoc) filters.push({ kbDocId: docId });

    const linkedCharacters = await CharacterModel.find({ $or: filters }).select('customFields').lean();
    await Promise.all(linkedCharacters.map((character) => CharacterModel.updateOne(
      { _id: character._id },
      {
        $set: {
          ...characterPatchFromEntity(entity, doc.type),
          kbRef: `${doc.gameId}:${entity.name}`,
          customFields: mergeFieldsWithCanonicalId(
            isRecord(character.customFields) ? character.customFields : {},
            entity.fields,
          ),
        },
      },
    )));
  }
}

export async function buildPoints(text: string, gameId: string, docId: string, type: KbType) {
  const entities = FREEFORM_TYPES.includes(type) ? null : parseCollectionFile(text);

  if (entities) {
    const vectors = await embedBatch(entities.map((e) => e.text));
    const points = entities.map((e, i) => ({
      id: crypto.randomUUID(),
      vector: vectors[i],
      payload: {
        text: e.text,
        gameId,
        docId,
        type,
        chunkIndex: i,
        entity: e.name,
        ...(e.role !== undefined ? { entityRole: e.role } : {}),
        ...(e.difficulty !== undefined
          ? { difficulty: e.difficulty, difficultyBucket: e.difficultyBucket }
          : {}),
        fields: e.fields,
      },
    }));
    return { points, chunkCount: entities.length, entityCount: entities.length };
  }

  const chunks = chunkText(text);
  const vectors = await embedBatch(chunks);
  const points = chunks.map((chunk, i) => ({
    id: crypto.randomUUID(),
    vector: vectors[i],
    payload: { text: chunk, gameId, docId, type, chunkIndex: i },
  }));
  return { points, chunkCount: chunks.length, entityCount: 0 };
}

/** Create the pending registry row and enqueue ingestion. Returns the docId. */
export async function ingestDocument(args: {
  gameId: string;
  type: KbType;
  title: string;
  text: string;
  sourceFilename?: string;
  metadata?: Record<string, unknown>;
}): Promise<string> {
  const doc = await KbDocumentModel.create({
    gameId: args.gameId,
    type: args.type,
    title: args.title,
    sourceFilename: args.sourceFilename,
    originalText: args.text,
    metadata: args.metadata ?? {},
    status: 'pending',
  });
  const docId = doc._id.toString();
  await kbQueue.add('ingest', { docId, gameId: args.gameId, type: args.type, mode: 'ingest' });
  return docId;
}

export async function listDocuments(gameId: string): Promise<IKbDocument[]> {
  return KbDocumentModel.find({ gameId }).select('-originalText').sort({ updatedAt: -1 });
}

export async function getDocument(gameId: string, docId: string): Promise<IKbDocument | null> {
  return KbDocumentModel.findOne({ _id: docId, gameId });
}

/**
 * Edit routing: changed text → hide the doc (status 'pending') and enqueue a
 * re-embed job; tags/title-only → instant Mongo update, no re-embed.
 */
export async function editDocument(
  doc: IKbDocument,
  fields: { title?: string; text?: string; metadata?: Record<string, unknown> },
): Promise<{ reEmbedded: boolean }> {
  const textChanged = typeof fields.text === 'string' && fields.text !== doc.originalText;

  if (fields.title !== undefined) doc.title = fields.title;
  if (fields.metadata !== undefined) doc.metadata = fields.metadata;
  if (textChanged) {
    doc.originalText = fields.text as string;
    doc.status = 'pending';
    doc.statusError = '';
  }
  await doc.save();
  await syncCharacterReferencesFromKb(doc);

  if (textChanged) {
    await kbQueue.add('reembed', {
      docId: doc._id.toString(),
      gameId: doc.gameId,
      type: doc.type,
      mode: 'reembed',
    });
  }
  return { reEmbedded: textChanged };
}

/** Retry a failed (or stuck) document by re-running the full re-embed path. */
export async function retryDocument(doc: IKbDocument): Promise<void> {
  doc.status = 'pending';
  doc.statusError = '';
  await doc.save();
  await kbQueue.add('reembed', {
    docId: doc._id.toString(),
    gameId: doc.gameId,
    type: doc.type,
    mode: 'reembed',
  });
}

/** Delete chunks before the registry row (the safe direction). */
export async function deleteDocument(doc: IKbDocument): Promise<void> {
  const docId = doc._id.toString();
  await KbDocumentModel.updateOne({ _id: docId }, { $set: { status: 'pending' } });
  await deleteDocumentPoints(doc.gameId, doc.type, docId);
  await KbDocumentModel.deleteOne({ _id: docId });
}
