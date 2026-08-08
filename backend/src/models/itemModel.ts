import mongoose, { Schema, Document } from 'mongoose';

// ---------------------------------------------------------------------------
// Item — a project-scoped design (weapon, trinket, quest loot…) authored in the
// Design Studio. Questline rewards stay embedded in their questline and may
// reference an Item via reward.itemId; the item is the visual/KB source of
// truth (sprite + published knowledge-base entity).
// ---------------------------------------------------------------------------

export const MAX_ITEM_SPRITE_CANDIDATES = 20;

export type ItemRarity = 'common' | 'rare' | 'epic';

export interface IItemAssets {
  rawSpriteCandidates: string[]; // S3 keys, capped at MAX_ITEM_SPRITE_CANDIDATES
  snappedSpriteS3Key: string;    // user-picked canonical sprite
  spriteHistoryIndex?: number;   // undo/redo cursor into rawSpriteCandidates
}

export interface IItem extends Document {
  _id: mongoose.Types.ObjectId;
  ownerId: string;
  projectId: string;
  name: string;
  description: string;
  rarity: ItemRarity;
  tags: string[];
  // KB provenance tag ("{gameId}:{entityName}"). '' = not KB-linked.
  kbRef: string;
  // KB document id when published from the design studio. '' = never published.
  kbDocId: string;
  // Sprite style this design generates in (SpriteStyle.styleId). '' = unset.
  spriteStyleId: string;
  assets: IItemAssets;
  createdAt: Date;
  updatedAt: Date;
}

const ItemAssetsSchema = new Schema<IItemAssets>(
  {
    rawSpriteCandidates: { type: [String], default: [] },
    snappedSpriteS3Key:  { type: String, default: '' },
    spriteHistoryIndex:  { type: Number },
  },
  { _id: false },
);

const ItemSchema = new Schema<IItem>(
  {
    ownerId:     { type: String, required: true, index: true },
    projectId:   { type: String, required: true, index: true },
    name:        { type: String, required: true },
    description: { type: String, default: '' },
    rarity:      { type: String, enum: ['common', 'rare', 'epic'], default: 'common' },
    tags:        { type: [String], default: [] },
    kbRef:       { type: String, default: '', index: true },
    kbDocId:     { type: String, default: '' },
    spriteStyleId: { type: String, default: '' },
    assets:      { type: ItemAssetsSchema, default: () => ({}) },
  },
  { timestamps: true },
);

export default mongoose.model<IItem>('Item', ItemSchema);
