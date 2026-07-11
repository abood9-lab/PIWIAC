import mongoose, { Schema, type Document } from "mongoose";

export interface ITimeoutEntry {
  userId: mongoose.Types.ObjectId;
  until: Date;
}

export interface IConversation extends Document {
  _id: mongoose.Types.ObjectId;
  // 1-to-1 participants (null for groups)
  user1Id?: mongoose.Types.ObjectId;
  user2Id?: mongoose.Types.ObjectId;
  // Group fields
  isGroup: boolean;
  groupName?: string;
  groupAvatarUrl?: string | null;
  groupDescription?: string | null;
  memberIds: mongoose.Types.ObjectId[];
  adminIds: mongoose.Types.ObjectId[];
  createdBy?: mongoose.Types.ObjectId;
  onlyAdminsCanSend: boolean;
  // Shared
  isArchivedBy: mongoose.Types.ObjectId[];
  isMutedBy: mongoose.Types.ObjectId[];
  lastActivityAt: Date;
  disappearAfter: string | null;
  timeoutEntries: ITimeoutEntry[];
  createdAt: Date;
}

export interface IMessage extends Document {
  _id: mongoose.Types.ObjectId;
  conversationId: mongoose.Types.ObjectId;
  senderId: mongoose.Types.ObjectId;
  text?: string;
  mediaUrl?: string;
  mediaType?: string;
  fileName?: string;
  isRead: boolean;
  readBy: mongoose.Types.ObjectId[]; // group read receipts
  replyToId?: mongoose.Types.ObjectId;
  isEdited: boolean;
  isDeleted: boolean;
  isForwarded: boolean;
  reactions: Record<string, mongoose.Types.ObjectId[]>;
  isPinned: boolean;
  starredBy: mongoose.Types.ObjectId[];
  clientId?: string;
  isSnap: boolean;
  viewOnce: boolean;
  viewsLeft: number | null;
  viewedBy: mongoose.Types.ObjectId[];
  createdAt: Date;
  updatedAt: Date;
}

const ConversationSchema = new Schema<IConversation>(
  {
    user1Id: { type: Schema.Types.ObjectId, ref: "User", default: null },
    user2Id: { type: Schema.Types.ObjectId, ref: "User", default: null },
    isGroup: { type: Boolean, default: false },
    groupName: { type: String, default: null },
    groupAvatarUrl: { type: String, default: null },
    groupDescription: { type: String, default: null },
    memberIds: [{ type: Schema.Types.ObjectId, ref: "User" }],
    adminIds: [{ type: Schema.Types.ObjectId, ref: "User" }],
    createdBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    onlyAdminsCanSend: { type: Boolean, default: false },
    isArchivedBy: [{ type: Schema.Types.ObjectId, ref: "User" }],
    isMutedBy: [{ type: Schema.Types.ObjectId, ref: "User" }],
    lastActivityAt: { type: Date, default: Date.now },
    disappearAfter: { type: String, default: null },
    timeoutEntries: [{
      userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
      until: { type: Date, required: true },
    }],
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

const MessageSchema = new Schema<IMessage>(
  {
    conversationId: { type: Schema.Types.ObjectId, ref: "Conversation", required: true },
    senderId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    text: { type: String, default: null },
    mediaUrl: { type: String, default: null },
    mediaType: { type: String, default: null },
    fileName: { type: String, default: null },
    isRead: { type: Boolean, default: false },
    readBy: [{ type: Schema.Types.ObjectId, ref: "User" }],
    replyToId: { type: Schema.Types.ObjectId, ref: "Message", default: null },
    isEdited: { type: Boolean, default: false },
    isDeleted: { type: Boolean, default: false },
    isForwarded: { type: Boolean, default: false },
    reactions: { type: Map, of: [Schema.Types.ObjectId], default: {} },
    isPinned: { type: Boolean, default: false },
    starredBy: [{ type: Schema.Types.ObjectId, ref: "User" }],
    clientId: { type: String, default: null },
    isSnap: { type: Boolean, default: false },
    viewOnce: { type: Boolean, default: false },
    viewsLeft: { type: Number, default: null },
    viewedBy: [{ type: Schema.Types.ObjectId, ref: "User" }],
  },
  { timestamps: true }
);

export const Conversation = mongoose.models.Conversation ?? mongoose.model<IConversation>("Conversation", ConversationSchema);
export const Message = mongoose.models.Message ?? mongoose.model<IMessage>("Message", MessageSchema);
