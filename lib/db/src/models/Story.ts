import mongoose, { Schema, type Document } from "mongoose";

export interface ISticker {
  id: string;
  type: "emoji" | "poll" | "question" | "quiz" | "countdown" | "location" | "hashtag" | "mention";
  x: number;
  y: number;
  emoji?: string;
  text?: string;
  pollQuestion?: string;
  pollA?: string;
  pollB?: string;
  quizOptions?: string[];
  quizAnswer?: number;
  countdownLabel?: string;
}

export interface IStory extends Document {
  _id: mongoose.Types.ObjectId;
  authorId: mongoose.Types.ObjectId;
  mediaUrl: string;
  mediaType: "image" | "video";
  caption?: string;
  textColor?: string;
  musicTrack?: string;
  musicUrl?: string;
  musicArtist?: string;
  audience: "everyone" | "close_friends";
  stickers: ISticker[];
  views: mongoose.Types.ObjectId[];
  reactions: { userId: mongoose.Types.ObjectId; emoji: string }[];
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface IHighlight extends Document {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  name: string;
  coverUrl?: string;
  storyIds: mongoose.Types.ObjectId[];
  createdAt: Date;
}

const StorySchema = new Schema<IStory>(
  {
    authorId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    mediaUrl: { type: String, required: true },
    mediaType: { type: String, enum: ["image", "video"], default: "image" },
    caption: { type: String, default: null },
    textColor: { type: String, default: null },
    musicTrack: { type: String, default: null },
    musicUrl: { type: String, default: null },
    musicArtist: { type: String, default: null },
    audience: { type: String, enum: ["everyone", "close_friends"], default: "everyone" },
    stickers: [
      {
        id: { type: String },
        type: { type: String, enum: ["emoji", "poll", "question", "quiz", "countdown", "location", "hashtag", "mention"] },
        x: { type: Number, default: 50 },
        y: { type: Number, default: 40 },
        emoji: { type: String, default: null },
        text: { type: String, default: null },
        pollQuestion: { type: String, default: null },
        pollA: { type: String, default: null },
        pollB: { type: String, default: null },
        quizOptions: [{ type: String }],
        quizAnswer: { type: Number, default: null },
        countdownLabel: { type: String, default: null },
      },
    ],
    views: [{ type: Schema.Types.ObjectId, ref: "User" }],
    reactions: [
      {
        userId: { type: Schema.Types.ObjectId, ref: "User" },
        emoji: { type: String },
      },
    ],
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true }
);

const HighlightSchema = new Schema<IHighlight>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    name: { type: String, required: true },
    coverUrl: { type: String, default: null },
    storyIds: [{ type: Schema.Types.ObjectId, ref: "Story" }],
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

export const Story = mongoose.models.Story ?? mongoose.model<IStory>("Story", StorySchema);
export const Highlight = mongoose.models.Highlight ?? mongoose.model<IHighlight>("Highlight", HighlightSchema);
