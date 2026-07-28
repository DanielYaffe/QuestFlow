import mongoose, { Document, Schema } from 'mongoose';

export interface IRewardType {
  name: string;
  description: string;
  rarity: string;
}

export interface IQuestType {
  name: string;
  description: string;
}

export interface IGameTheme extends Document {
  themeId: string;
  questTone: string;
  namingStyle: string;
  rewardTypes: IRewardType[];
  questTypes: IQuestType[];
  locationRules: string;
  dialogueStyle: string;
}

const GameThemeSchema = new Schema<IGameTheme>({
  themeId:      { type: String, required: true, unique: true },
  questTone:    { type: String, default: '' },
  namingStyle:  { type: String, default: '' },
  rewardTypes:  {
    type: [{
      name:        { type: String, required: true },
      description: { type: String, default: '' },
      rarity:      { type: String, default: 'common' },
    }],
    default: [],
  },
  questTypes: {
    type: [{
      name:        { type: String, required: true },
      description: { type: String, default: '' },
    }],
    default: [],
  },
  locationRules: { type: String, default: '' },
  dialogueStyle: { type: String, default: '' },
});

const GameThemeModel = mongoose.model<IGameTheme>('GameTheme', GameThemeSchema);
export default GameThemeModel;
