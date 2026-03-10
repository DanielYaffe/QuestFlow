import mongoose, { Document, Schema } from 'mongoose';

export interface IPost extends Document {
  sender: string;
  text: string;
  image: string;
}

const PostSchema = new Schema<IPost>({
  sender: { type: String, required: true },
  text: { type: String, required: true },
  image: { type: String, required: false },
});

const PostModel = mongoose.model<IPost>('Post', PostSchema);

export default PostModel;
