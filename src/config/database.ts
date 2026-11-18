import mongoose from "mongoose";
import { ENV } from "./env";

export async function connectDB(uri?: string): Promise<typeof mongoose> {
  const targetUri = uri || ENV.MONGODB_URI;
  try {
    mongoose.set("strictQuery", false);
    const conn = await mongoose.connect(targetUri, {
      autoIndex: true,
      serverSelectionTimeoutMS: 5000,
    });
    console.log(`[MongoDB] Connected successfully to: ${conn.connection.name}`);
    return conn;
  } catch (error: any) {
    console.error("[MongoDB] Connection error:", error.message);
    throw error;
  }
}

export async function disconnectDB(): Promise<void> {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
    console.log("[MongoDB] Disconnected successfully");
  }
}
