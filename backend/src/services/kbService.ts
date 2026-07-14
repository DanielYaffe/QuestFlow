import { KbType, deleteDocumentPoints } from './qdrant';
import { embedBatch } from './ai';
import { chunkText } from './chunk';
import KbDocumentModel, { IKbDocument } from '../models/kbDocumentModel';
import { kbQueue } from '../queues/kbQueue';

// ---------------------------------------------------------------------------
// KB document lifecycle. Controllers call this; it owns both stores. Ingest and
// re-embed enqueue a BullMQ job (chunk + embed is slow and belongs off the
// request path); the synchronous operations here are the cheap ones.
// ---------------------------------------------------------------------------

/** Chunk + embed a document's text into Qdrant points (worker-side helper). */
export async function buildPoints(text: string, gameId: string, docId: string, type: KbType) {
  const chunks = chunkText(text);
  const vectors = await embedBatch(chunks);
  const points = chunks.map((chunk, i) => ({
    id: crypto.randomUUID(),
    vector: vectors[i],
    payload: { text: chunk, gameId, docId, type, chunkIndex: i },
  }));
  return { points, chunkCount: chunks.length };
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
