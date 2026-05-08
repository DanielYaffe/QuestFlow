import mongoose, { Document, Schema } from 'mongoose';

export interface IMonsterAssets {
  battleSpriteKey: string;
  worldSpriteKey: string;
  battleJsonKey: string;
  worldJsonKey: string;
  exportFileKey: string;
  portraitKey: string;
}

export interface IMonsterSpeciesData {
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

export interface IMonster extends Document {
  ownerId: string;
  themeId: string;
  questlineId: string;
  name: string;
  description: string;
  speciesData: IMonsterSpeciesData;
  assets: IMonsterAssets;
  jobId: string;
  status: 'pending' | 'generating' | 'complete' | 'failed';
  createdAt: Date;
  updatedAt: Date;
}

const MonsterSchema = new Schema<IMonster>(
  {
    ownerId:     { type: String, required: true, index: true },
    themeId:     { type: String, required: true },
    questlineId: { type: String, default: '' },
    name:        { type: String, required: true },
    description: { type: String, default: '' },
    speciesData: {
      species_name:         { type: String, default: '' },
      type1:                { type: String, default: '' },
      type2:                { type: String, default: '' },
      base_hp:              { type: Number, default: 0 },
      base_melee_attack:    { type: Number, default: 0 },
      base_melee_defense:   { type: Number, default: 0 },
      base_ranged_attack:   { type: Number, default: 0 },
      base_ranged_defense:  { type: Number, default: 0 },
      base_speed:           { type: Number, default: 0 },
      base_max_ap:          { type: Number, default: 0 },
      move_tags:            { type: [String], default: [] },
      bestiary_bio:         { type: String, default: '' },
    },
    assets: {
      battleSpriteKey: { type: String, default: '' },
      worldSpriteKey:  { type: String, default: '' },
      battleJsonKey:   { type: String, default: '' },
      worldJsonKey:    { type: String, default: '' },
      exportFileKey:   { type: String, default: '' },
      portraitKey:     { type: String, default: '' },
    },
    jobId:  { type: String, default: '' },
    status: { type: String, enum: ['pending', 'generating', 'complete', 'failed'], default: 'pending' },
  },
  { timestamps: true },
);

const MonsterModel = mongoose.model<IMonster>('Monster', MonsterSchema);
export default MonsterModel;
