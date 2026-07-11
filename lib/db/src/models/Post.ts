import mongoose, { Schema, type Document } from "mongoose";

export interface IComment {
  _id: mongoose.Types.ObjectId;
  authorId: mongoose.Types.ObjectId;
  text: string;
  parentId?: mongoose.Types.ObjectId;
  likes: mongoose.Types.ObjectId[];
  createdAt: Date;
}

export interface IPost extends Document {
  _id: mongoose.Types.ObjectId;
  authorId: mongoose.Types.ObjectId;
  caption?: string;
  mediaUrl: string;
  mediaType: "image" | "video";
  audience: "everyone" | "close_friends";
  location?: string;
  altText?: string;
  commentsDisabled: boolean;
  additionalMediaUrls: string[];
  likes: mongoose.Types.ObjectId[];
  saves: mongoose.Types.ObjectId[];
  comments: IComment[];
  createdAt: Date;
  updatedAt: Date;
}

const CommentSchema = new Schema<IComment>(
  {
    authorId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    text: { type: String, required: true },
    parentId: { type: Schema.Types.ObjectId, default: null },
    likes: [{ type: Schema.Types.ObjectId, ref: "User" }],
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

const PostSchema = new Schema<IPost>(
  {
    authorId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    caption: { type: String, default: null },
    mediaUrl: { type: String, required: true },
    mediaType: { type: String, enum: ["image", "video"], default: "image" },
    audience: { type: String, enum: ["everyone", "close_friends"], default: "everyone" },
    location: { type: String, default: null },
    altText: { type: String, default: null },
    commentsDisabled: { type: Boolean, default: false },
    additionalMediaUrls: [{ type: String }],
    likes: [{ type: Schema.Types.ObjectId, ref: "User" }],
    saves: [{ type: Schema.Types.ObjectId, ref: "User" }],
    comments: [CommentSchema],
  },
  { timestamps: true }
);

export const Post = mongoose.models.Post ?? mongoose.model<IPost>("Post", PostSchema);
