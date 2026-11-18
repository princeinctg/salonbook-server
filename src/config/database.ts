import dns from "dns";
import mongoose from "mongoose";
import { ENV } from "./env";

// Ensure Node.js can resolve SRV records for MongoDB Atlas on Windows environments
try {
  dns.setServers(["8.8.8.8", "1.1.1.1"]);
} catch (e) {
  // Ignore if custom servers cannot be set
}

export async function connectDB(uri?: string): Promise<typeof mongoose> {
  const targetUri = uri || ENV.MONGODB_URI;
  try {
    mongoose.set("strictQuery", false);
    const conn = await mongoose.connect(targetUri, {
      dbName: "salonbook",
      autoIndex: true,
      serverSelectionTimeoutMS: 10000,
    });
    console.log(`[MongoDB] Connected successfully to host: ${conn.connection.host}, database: ${conn.connection.name}`);
    return conn;
  } catch (error: any) {
    console.error("[MongoDB] Connection to configured database failed:", error.message);
    throw error;
  }
}

export async function disconnectDB(): Promise<void> {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
    console.log("[MongoDB] Disconnected successfully");
  }
}
