import mongoose, { Document, Schema } from 'mongoose';

// ---------------------------------------------------------------------------
// Unified Character — project-scoped, reusable across questlines.
//   kind: 'npc'    → portraitUrl + dialogueTraits
//   kind: 'monster'→ speciesData + assets (sprite/animation pipeline)
// Supersedes the inline questline.characters[] and the standalone Monster model.
// ---------------------------------------------------------------------------

export type CharacterKind = 'npc' | 'monster';

export const MAX_SPRITE_CANDIDATES = 20;

// Candidate-grid asset model. Sprite iteration appends raw candidates (oldest
// pruned past MAX_SPRITE_CANDIDATES); the user promotes one to canonical
// (snappedSpriteS3Key). Exports are produced on-demand, never persisted.
export interface ICharacterAssets {
  rawSpriteCandidates: string[];   // S3 keys, capped at MAX_SPRITE_CANDIDATES
  snappedSpriteS3Key: string;      // user-picked canonical sprite
  spritesheetS3Key: string;        // animation sheet (PixelLab output)
  spritesheetJsonS3Key: string;    // Aseprite frame-tag JSON
  targetSizeOverride?: number;     // overrides style.targetSize when snapping
}

export interface ICharacterSpeciesData {
  species_name: string;
  type1: string;
  type2: string;
  base_hp: number;
  base_melee_attack: number;
  base_melee_defense: number;
  base_ranged_attack: number;
  base_ranged_defense: number;
  base_speed: number;
  base_max_ap: number;
  move_tags: string[];
  bestiary_bio: string;
}

export interface ICharacter extends Document {
  _id: mongoose.Types.ObjectId;
  ownerId: string;
  projectId: string;
  kind: CharacterKind;
  name: string;
  appearance: string;              // visually concrete — used as the sprite subject
  lore: string;                    // background / story
  tags: string[];
  // KB provenance tag ("{gameId}:{entityName}") for characters materialized
  // from a knowledge-base entity — generation reuses the existing doc instead
  // of duplicating it. '' = not KB-linked.
  kbRef: string;
  // NPC-only
  portraitUrl: string;
  dialogueTraits: string[];
  // Monster-only
  speciesData: ICharacterSpeciesData;
  assets: ICharacterAssets;
  createdAt: Date;
  updatedAt: Date;
}

const AssetsSchema = new Schema<ICharacterAssets>(
  {
    rawSpriteCandidates:  { type: [String], default: [] },
    snappedSpriteS3Key:   { type: String, default: '' },
    spritesheetS3Key:     { type: String, default: '' },
    spritesheetJsonS3Key: { type: String, default: '' },
    targetSizeOverride:   { type: Number },
  },
  { _id: false },
);

const SpeciesDataSchema = new Schema<ICharacterSpeciesData>(
  {
    species_name:        { type: String, default: '' },
    type1:               { type: String, default: '' },
    type2:               { type: String, default: '' },
    base_hp:             { type: Number, default: 0 },
    base_melee_attack:   { type: Number, default: 0 },
    base_melee_defense:  { type: Number, default: 0 },
    base_ranged_attack:  { type: Number, default: 0 },
    base_ranged_defense: { type: Number, default: 0 },
    base_speed:          { type: Number, default: 0 },
    base_max_ap:         { type: Number, default: 0 },
    move_tags:           { type: [String], default: [] },
    bestiary_bio:        { type: String, default: '' },
  },
  { _id: false },
);

/**
 * @swagger
 * components:
 *   schemas:
 *     Character:
 *       type: object
 *       required:
 *         - name
 *         - ownerId
 *         - projectId
 *         - kind
 *       properties:
 *         _id:
 *           type: string
 *         projectId:
 *           type: string
 *         kind:
 *           type: string
 *           enum: [npc, monster]
 *         name:
 *           type: string
 *         appearance:
 *           type: string
 *         lore:
 *           type: string
 *         tags:
 *           type: array
 *           items:
 *             type: string
 *         portraitUrl:
 *           type: string
 *         dialogueTraits:
 *           type: array
 *           items:
 *             type: string
 *         speciesData:
 *           type: object
 *         assets:
 *           type: object
 */
const CharacterSchema = new Schema<ICharacter>(
  {
    ownerId:        { type: String, required: true, index: true },
    projectId:      { type: String, required: true, index: true },
    kind:           { type: String, enum: ['npc', 'monster'], required: true },
    name:           { type: String, required: true },
    appearance:     { type: String, default: '' },
    lore:           { type: String, default: '' },
    tags:           { type: [String], default: [] },
    kbRef:          { type: String, default: '', index: true },
    portraitUrl:    { type: String, default: '' },
    dialogueTraits: { type: [String], default: [] },
    speciesData:    { type: SpeciesDataSchema, default: () => ({}) },
    assets:         { type: AssetsSchema, default: () => ({}) },
  },
  { timestamps: true },
);

const CharacterModel = mongoose.model<ICharacter>('Character', CharacterSchema);
export default CharacterModel;
