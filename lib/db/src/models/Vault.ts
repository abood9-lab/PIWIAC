import mongoose, { Schema, type Document } from "mongoose";

export interface IVaultConversation extends Document {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  conversationId: mongoose.Types.ObjectId;
  pinHash: string;
  addedAt: Date;
}

const VaultConversationSchema = new Schema<IVaultConversation>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    conversationId: { type: Schema.Types.ObjectId, ref: "Conversation", required: true },
    pinHash: { type: String, required: true },
    addedAt: { type: Date, default: Date.now },
  }
);

export const VaultConversation = mongoose.models.VaultConversation ?? mongoose.model<IVaultConversation>("VaultConversation", VaultConversationSchema);
