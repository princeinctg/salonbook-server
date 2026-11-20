import dns from "dns";
import dotenv from "dotenv";

try {
  dns.setServers(["8.8.8.8", "1.1.1.1"]);
} catch (e) {}

dotenv.config();

const IS_PRODUCTION = (process.env.NODE_ENV || "development") === "production";

// Known production origins. They are only used as a safety net when a deployed
// environment is missing a URL variable or still has a localhost value.
const PRODUCTION_CLIENT_URL = "https://salonbook-client.vercel.app";
const PRODUCTION_SERVER_URL = "https://salonbook-server-kniz.onrender.com";

function trimTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, "");
}

function isLoopbackUrl(value: string): boolean {
  try {
    const hostname = new URL(value).hostname;
    return (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "::1" ||
      hostname === "[::1]"
    );
  } catch {
    return false;
  }
}

/**
 * Resolves a public URL. In production a localhost value is ignored so the API
 * can never redirect a deployed user back to a developer machine.
 */
function resolvePublicUrl(
  configured: string | undefined,
  localFallback: string,
  productionFallback: string
): string {
  const value = configured?.trim();
  if (value && !(IS_PRODUCTION && isLoopbackUrl(value))) {
    return trimTrailingSlashes(value);
  }
  return IS_PRODUCTION ? productionFallback : localFallback;
}

const CLIENT_URL = resolvePublicUrl(
  process.env.CLIENT_URL,
  "http://localhost:3000",
  PRODUCTION_CLIENT_URL
);

const SERVER_URL = resolvePublicUrl(
  process.env.SERVER_URL,
  "http://localhost:5000",
  PRODUCTION_SERVER_URL
);

const BETTER_AUTH_URL = resolvePublicUrl(
  process.env.BETTER_AUTH_URL,
  "http://localhost:5000",
  PRODUCTION_SERVER_URL
);

// In production the Google redirect URI MUST be the Next.js callback bridge that
// is registered in Google Cloud Console. This deliberately ignores a stale
// localhost or direct-API value in the Render dashboard.
const GOOGLE_REDIRECT_URI = IS_PRODUCTION
  ? `${CLIENT_URL}/api/auth/callback/google`
  : process.env.GOOGLE_REDIRECT_URI?.trim() ||
    `${CLIENT_URL}/api/auth/callback/google`;

export const ENV = {
  PORT: process.env.PORT ? parseInt(process.env.PORT, 10) : 5000,
  NODE_ENV: process.env.NODE_ENV || "development",
  IS_PRODUCTION,
  MONGODB_URI: process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/salonbook",
  // Server-only secrets. Never expose these through NEXT_PUBLIC_* variables or
  // return them from an API response.
  BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET || "salonbook_secret_key_development_32chars_min",
  BETTER_AUTH_URL,
  JWT_SECRET: process.env.JWT_SECRET || process.env.BETTER_AUTH_SECRET || "salonbook_secret_key_development_32chars_min",
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || "7d",
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID || "",
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET || "",
  // Must exactly match an "Authorized redirect URI" in the Google Cloud Console
  // on the same OAuth client as GOOGLE_CLIENT_ID.
  GOOGLE_REDIRECT_URI,
  STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY || "",
  STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET || "",
  IMGBB_API_KEY: process.env.IMGBB_API_KEY || "",
  CLIENT_URL,
  SERVER_URL,
};
