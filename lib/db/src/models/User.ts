import mongoose, { Schema, type Document } from "mongoose";

export interface IUser extends Document {
  _id: mongoose.Types.ObjectId;
  username: string;
  email: string;
  fullName: string;
  passwordHash: string;
  bio?: string;
  avatarUrl?: string;
  website?: string;
  gender?: string;
  pronouns?: string;
  dateOfBirth?: Date;
  interests: string[];
  profileCompleted: boolean;
  vaultPin?: string;
  followers: mongoose.Types.ObjectId[];
  following: mongoose.Types.ObjectId[];
  closeFriends: mongoose.Types.ObjectId[];
  blockedUsers: mongoose.Types.ObjectId[];
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<IUser>(
  {
    username: { type: String, required: true, unique: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    fullName: { type: String, required: true },
    passwordHash: { type: String, required: true },
    bio: { type: String, default: null },
    avatarUrl: { type: String, default: null },
    website: { type: String, default: null },
    gender: { type: String, default: null },
    pronouns: { type: String, default: null },
    dateOfBirth: { type: Date, default: null },
    interests: [{ type: String }],
    profileCompleted: { type: Boolean, default: false },
    vaultPin: { type: String, default: null },
    followers: [{ type: Schema.Types.ObjectId, ref: "User" }],
    following: [{ type: Schema.Types.ObjectId, ref: "User" }],
    closeFriends: [{ type: Schema.Types.ObjectId, ref: "User" }],
    blockedUsers: [{ type: Schema.Types.ObjectId, ref: "User" }],
  },
  { timestamps: true }
);

export const User = mongoose.models.User ?? mongoose.model<IUser>("User", UserSchema);
