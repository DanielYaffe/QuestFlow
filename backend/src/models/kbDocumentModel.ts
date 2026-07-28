import mongoose, { Document, Schema } from 'mongoose';
import { KbType, KB_TYPES } from '../services/qdrant';

// ---------------------------------------------------------------------------
// KbDocument — registry + source of truth for one knowledge-base document.
// The full original text lives here (Pattern C); lean chunk copies live in the
// Qdrant payload. _id IS the docId shared by both stores. Only 'ready'
// documents are ever served by retrieval (the status gate).
// ---------------------------------------------------------------------------

export type DocStatus = 'pending' | 'ready' | 'failed';

export interface IKbDocument extends Document {
  _id: mongoose.Types.ObjectId;
  gameId: string;
  type: KbType;
  title: string;
  sourceFilename?: string;
  originalText: string;
  chunkCount: number;
  pointIds: string[];
  metadata: Record<string, unknown>;
  status: DocStatus;
  statusError: string;
  createdAt: Date;
  updatedAt: Date;
}

const KbDocumentSchema = new Schema<IKbDocument>(
  {
    gameId:         { type: String, required: true, index: true },
    type:           { type: String, enum: KB_TYPES, required: true },
    title:          { type: String, required: true },
    sourceFilename: { type: String },
    originalText:   { type: String, required: true },
    chunkCount:     { type: Number, default: 0 },
    pointIds:       { type: [String], default: [] },
    metadata:       { type: Schema.Types.Mixed, default: {} },
    status:         { type: String, enum: ['pending', 'ready', 'failed'], default: 'pending', index: true },
    statusError:    { type: String, default: '' },
  },
  { timestamps: true },
);

const KbDocumentModel = mongoose.model<IKbDocument>('KbDocument', KbDocumentSchema);

export default KbDocumentModel;
