import mongoose from "mongoose";

let connected = false;

export async function connectDB() {
  if (connected) return;
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI must be set.");
  await mongoose.connect(uri);
  connected = true;
}

export * from "./models/User.js";
export * from "./models/Post.js";
export * from "./models/Story.js";
export * from "./models/Message.js";
export * from "./models/Notification.js";
export * from "./models/RefreshToken.js";
export * from "./models/Vault.js";
export * from "./models/PushSubscription.js";
