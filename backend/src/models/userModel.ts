import mongoose, { Document, Schema } from 'mongoose';

export interface IGitSettings {
  encryptedToken?: string;
  repoOwner?: string;
  repoName?: string;
  defaultBranch?: string;
  defaultFilePath?: string;
}

export interface IUser extends Document {
  email: string;
  password?: string;
  googleId?: string;
  refreshTokens: string[];
  gitSettings: IGitSettings;
}

const GitSettingsSchema = new Schema<IGitSettings>(
  {
    encryptedToken: { type: String, default: undefined },
    repoOwner:      { type: String, default: undefined },
    repoName:       { type: String, default: undefined },
    defaultBranch:  { type: String, default: 'main' },
    defaultFilePath: { type: String, default: '' },
  },
  { _id: false },
);

const userSchema = new Schema<IUser>({
    email: {
        type: String,
        required: true,
        unique: true,
    },
    password: {
        type: String,
        required: false,
    },
    googleId: {
        type: String,
        required: false,
    },
    refreshTokens: {
        type: [String],
        default: [],
    },
    gitSettings: {
        type: GitSettingsSchema,
        default: () => ({}),
    },
});

const UserModel = mongoose.model<IUser>('User', userSchema);

export default UserModel;
