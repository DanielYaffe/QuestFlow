import mongoose, { Schema } from "mongoose";

export interface IComment extends Document {
    postId: string;
    sender: string;
    content: string;
}

const commentSchema = new Schema<IComment>({
    postId: {
        type: String,
        required: true,
    },
    sender: {
        type: String,
        required: true,
    },
    content: {
        type: String,
        required: true,
    },
});

const CommentModel = mongoose.model<IComment>("Comment", commentSchema);

export default CommentModel;
