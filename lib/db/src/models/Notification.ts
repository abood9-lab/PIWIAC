import mongoose, { Schema, type Document } from "mongoose";

export interface INotification extends Document {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  actorId: mongoose.Types.ObjectId;
  type: "like" | "comment" | "follow" | "message";
  postId?: mongoose.Types.ObjectId;
  commentText?: string;
  isRead: boolean;
  createdAt: Date;
}

const NotificationSchema = new Schema<INotification>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    actorId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    type: { type: String, enum: ["like", "comment", "follow", "message"], required: true },
    postId: { type: Schema.Types.ObjectId, ref: "Post", default: null },
    commentText: { type: String, default: null },
    isRead: { type: Boolean, default: false },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

export const Notification = mongoose.models.Notification ?? mongoose.model<INotification>("Notification", NotificationSchema);
