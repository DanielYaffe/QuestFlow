import mongoose, { Document, Schema } from 'mongoose';

export interface IUser extends Document {
  email: string;
  password?: string;
  googleId?: string;
  refreshTokens: string[];
}

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
});

const UserModel = mongoose.model<IUser>('User', userSchema);

export default UserModel;
