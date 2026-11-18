import { Request, Response } from "express";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { User } from "../models/user.model";
import { generateToken } from "../utils/jwt";
import { ENV } from "../config/env";

// Strict Password Validation Rule: Minimum 6 chars, at least 1 uppercase, at least 1 lowercase
const signupSchema = z.object({
  name: z.string().min(2, "Full Name must be at least 2 characters"),
  email: z.string().email("Invalid email address"),
  password: z
    .string()
    .min(6, "Password must be at least 6 characters")
    .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
    .regex(/[a-z]/, "Password must contain at least one lowercase letter"),
  image: z.string().optional(),
  phone: z.string().optional(),
});

const signinSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

export async function signUp(req: Request, res: Response): Promise<void> {
  try {
    const parseResult = signupSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({
        success: false,
        message: parseResult.error.errors[0].message,
        errors: parseResult.error.errors,
      });
      return;
    }

    const { name, email, password, image, phone } = parseResult.data;

    // Check existing email
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      res.status(400).json({ success: false, message: "An account with this email already exists" });
      return;
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // CRITICAL SECURITY: Default role must always be customer; never create admin from public signup
    const newUser = await User.create({
      name,
      email,
      password: hashedPassword,
      image: image || "",
      phone: phone || "",
      role: "customer",
      isBlocked: false,
      provider: "credential",
    });

    const token = generateToken({
      userId: newUser._id.toString(),
      email: newUser.email,
      role: newUser.role,
    });

    res.status(201).json({
      success: true,
      message: "Registration successful",
      token,
      user: {
        id: newUser._id,
        name: newUser.name,
        email: newUser.email,
        image: newUser.image,
        phone: newUser.phone,
        role: newUser.role,
        isBlocked: newUser.isBlocked,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: "Error registering account", error: error.message });
  }
}

export async function signIn(req: Request, res: Response): Promise<void> {
  try {
    const parseResult = signinSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({
        success: false,
        message: parseResult.error.errors[0].message,
      });
      return;
    }

    const { email, password } = parseResult.data;

    const user = await User.findOne({ email }).select("+password");
    if (!user) {
      res.status(401).json({ success: false, message: "Invalid email or password" });
      return;
    }

    if (user.isBlocked) {
      res.status(403).json({ success: false, message: "Your account has been suspended. Please contact support." });
      return;
    }

    if (!user.password) {
      res.status(400).json({
        success: false,
        message: "This account was registered via Google OAuth. Please use Google Login.",
      });
      return;
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      res.status(401).json({ success: false, message: "Invalid email or password" });
      return;
    }

    const token = generateToken({
      userId: user._id.toString(),
      email: user.email,
      role: user.role,
    });

    res.status(200).json({
      success: true,
      message: "Login successful",
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        image: user.image,
        phone: user.phone,
        role: user.role,
        isBlocked: user.isBlocked,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: "Login error", error: error.message });
  }
}

/**
 * The redirect URI sent to Google must EXACTLY match an "Authorized redirect URI"
 * configured in the Google Cloud Console, and it must be identical on both the
 * authorization request and the token exchange. It is therefore resolved from
 * configuration instead of the incoming request host (which previously produced
 * http://localhost:5000/api/auth/google/callback and triggered
 * "Error 400: redirect_uri_mismatch").
 */
export function resolveGoogleCallbackUrl(_req?: Request): string {
  const configured = ENV.GOOGLE_REDIRECT_URI.trim();
  // Do NOT normalise this value (no trailing-slash stripping): Google requires
  // the redirect_uri to match the Console entry byte-for-byte.
  if (configured) return configured;
  // Default to the client-app callback route that is actually registered in the
  // Google Cloud Console. It proxies the code to this API. See
  // salonbook-client/src/app/api/auth/callback/google/route.ts.
  return `${ENV.CLIENT_URL.replace(/\/+$/, "")}/api/auth/callback/google`;
}

/** Only allow the browser to be sent back to the configured SalonBook client. */
function resolveClientOrigin(candidate?: string): string {
  const fallback = ENV.CLIENT_URL.replace(/\/+$/, "");
  try {
    const url = new URL(candidate || fallback);
    const defaultOrigin = new URL(fallback).origin;
    const isLocalDev =
      ENV.NODE_ENV !== "production" &&
      (url.hostname === "localhost" || url.hostname === "127.0.0.1") &&
      (url.port === "3000" || url.port === "");
    return url.origin === defaultOrigin || isLocalDev ? url.origin : defaultOrigin;
  } catch {
    return fallback;
  }
}

/** Only allow internal dashboard paths as a post-login destination. */
function resolveRedirectPath(candidate?: string, role?: string): string {
  if (candidate && candidate.startsWith("/") && !candidate.startsWith("//")) {
    return candidate;
  }
  return role === "admin" ? "/dashboard/admin" : "/dashboard/customer";
}

/**
 * State is HMAC-signed with the server's JWT secret so the callback can prove
 * the returnTo/redirect values were issued by this server (CSRF / open-redirect
 * protection). The payload itself is not secret.
 */
function signGoogleState(payload: { returnTo: string; redirect: string }): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto.createHmac("sha256", ENV.JWT_SECRET).update(body).digest("base64url");
  return `${body}.${signature}`;
}

function verifyGoogleState(rawState: string): { returnTo?: string; redirect?: string } | null {
  const parts = rawState.split(".");
  if (parts.length !== 2) return null;
  const [body, signature] = parts;
  if (!body || !signature) return null;

  const expected = crypto.createHmac("sha256", ENV.JWT_SECRET).update(body).digest("base64url");
  const providedBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (
    providedBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(providedBuffer, expectedBuffer)
  ) {
    return null;
  }

  try {
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf-8"));
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Initiates Real Google OAuth 2.0 Authorization Flow
 */
export function googleRedirect(req: Request, res: Response): void {
  const rootUrl = "https://accounts.google.com/o/oauth2/v2/auth";

  const returnClientUrl = resolveClientOrigin((req.query.returnTo as string) || ENV.CLIENT_URL);
  const requestedRedirect = typeof req.query.redirect === "string" ? req.query.redirect : "";
  const redirectPath =
    requestedRedirect.startsWith("/") && !requestedRedirect.startsWith("//")
      ? requestedRedirect
      : "";

  const stateParam = signGoogleState({
    returnTo: returnClientUrl,
    redirect: redirectPath,
  });

  const callbackUri = resolveGoogleCallbackUrl(req);

  const options = {
    redirect_uri: callbackUri,
    client_id: ENV.GOOGLE_CLIENT_ID,
    access_type: "offline",
    response_type: "code",
    prompt: "select_account",
    state: stateParam,
    scope: "openid email profile",
  };

  const qs = new URLSearchParams(options);
  res.redirect(`${rootUrl}?${qs.toString()}`);
}

/**
 * Handles Real Google OAuth 2.0 Authorization Callback
 */
export async function googleCallback(req: Request, res: Response): Promise<void> {
  const code = req.query.code as string;
  const rawState = req.query.state as string;

  let returnClient = ENV.CLIENT_URL.replace(/\/+$/, "");
  let redirectPath = "";

  // Verify the authorization response carries the state we issued.
  if (!rawState) {
    res.redirect(`${returnClient}/sign-in?error=${encodeURIComponent("Invalid Google OAuth state. Please try signing in again.")}`);
    return;
  }

  const parsedState = verifyGoogleState(rawState);
  if (!parsedState) {
    res.redirect(`${returnClient}/sign-in?error=${encodeURIComponent("Invalid Google OAuth state. Please try signing in again.")}`);
    return;
  }

  if (parsedState.returnTo) returnClient = resolveClientOrigin(parsedState.returnTo);
  if (parsedState.redirect && typeof parsedState.redirect === "string") {
    redirectPath = parsedState.redirect;
  }

  // Google reports user cancellation/consent errors back on the redirect URI.
  const oauthError = typeof req.query.error === "string" ? req.query.error : "";
  if (oauthError) {
    const description =
      typeof req.query.error_description === "string" ? req.query.error_description : oauthError;
    res.redirect(`${returnClient}/sign-in?error=${encodeURIComponent(description)}`);
    return;
  }

  if (!code) {
    res.redirect(`${returnClient}/sign-in?error=Google+authorization+code+missing`);
    return;
  }

  try {
    const callbackUri = resolveGoogleCallbackUrl(req);

    // Exchange authorization code for tokens
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: ENV.GOOGLE_CLIENT_ID,
        client_secret: ENV.GOOGLE_CLIENT_SECRET,
        redirect_uri: callbackUri,
        grant_type: "authorization_code",
      }),
    });

    const tokenData = await tokenRes.json();
    if (!tokenRes.ok || !tokenData.access_token) {
      console.error("[Google OAuth] Token exchange error:", tokenData);
      res.redirect(
        `${returnClient}/sign-in?error=${encodeURIComponent(
          tokenData.error_description || tokenData.error || "Failed to exchange Google code"
        )}`
      );
      return;
    }

    // Fetch user profile from Google UserInfo endpoint
    const profileRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });

    const profileData = await profileRes.json();
    if (!profileRes.ok || !profileData.email || profileData.email_verified === false) {
      console.error("[Google OAuth] Profile fetch error:", profileData);
      res.redirect(`${returnClient}/sign-in?error=Failed+to+fetch+a+verified+Google+profile`);
      return;
    }

    const email = profileData.email.toLowerCase().trim();
    const name = profileData.name || email.split("@")[0];
    const image = profileData.picture || "";

    // Find or create user in MongoDB Atlas
    let user = await User.findOne({ email });
    if (user) {
      if (user.isBlocked) {
        res.redirect(`${returnClient}/sign-in?error=Your+account+has+been+suspended`);
        return;
      }
      if (image && !user.image) {
        user.image = image;
        await user.save();
      }
    } else {
      user = await User.create({
        name,
        email,
        image,
        role: "customer",
        isBlocked: false,
        provider: "google",
      });
    }

    // Generate JWT token
    const token = generateToken({
      userId: user._id.toString(),
      email: user.email,
      role: user.role,
    });

    // Send each role to its own dashboard unless an explicit internal path was requested.
    const destination = resolveRedirectPath(redirectPath, user.role);

    // Pass token & user via secure query parameters back to client session receiver
    const userJson = encodeURIComponent(
      JSON.stringify({
        id: user._id,
        name: user.name,
        email: user.email,
        image: user.image,
        phone: user.phone,
        role: user.role,
        isBlocked: user.isBlocked,
      })
    );

    res.redirect(`${returnClient}/sign-in?token=${encodeURIComponent(token)}&user=${userJson}&redirect=${encodeURIComponent(destination)}`);
  } catch (error: any) {
    console.error("[Google OAuth Error]:", error);
    res.redirect(`${returnClient}/sign-in?error=${encodeURIComponent(error.message || "Google authentication failed")}`);
  }
}

export async function googleSignIn(req: Request, res: Response): Promise<void> {
  try {
    const { email, name, image } = req.body;
    if (!email) {
      res.status(400).json({ success: false, message: "Email is required for Google Sign-In" });
      return;
    }

    let user = await User.findOne({ email });

    if (user) {
      if (user.isBlocked) {
        res.status(403).json({ success: false, message: "Your account has been suspended." });
        return;
      }
      // Update image if newly provided
      if (image && !user.image) {
        user.image = image;
        await user.save();
      }
    } else {
      user = await User.create({
        name: name || email.split("@")[0],
        email,
        image: image || "",
        role: "customer", // Default customer
        isBlocked: false,
        provider: "google",
      });
    }

    const token = generateToken({
      userId: user._id.toString(),
      email: user.email,
      role: user.role,
    });

    res.status(200).json({
      success: true,
      message: "Google authentication successful",
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        image: user.image,
        phone: user.phone,
        role: user.role,
        isBlocked: user.isBlocked,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: "Google sign-in error", error: error.message });
  }
}

export async function getProfile(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: "Unauthorized" });
      return;
    }

    res.status(200).json({
      success: true,
      user: {
        id: req.user._id,
        name: req.user.name,
        email: req.user.email,
        image: req.user.image,
        phone: req.user.phone,
        role: req.user.role,
        isBlocked: req.user.isBlocked,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: "Error fetching profile", error: error.message });
  }
}

export async function updateProfile(req: Request, res: Response): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, message: "Unauthorized" });
      return;
    }

    const { name, image, phone } = req.body;

    // Security check: User cannot alter role or isBlocked status
    if (name) req.user.name = name.trim();
    if (image !== undefined) req.user.image = image;
    if (phone !== undefined) req.user.phone = phone.trim();

    await req.user.save();

    res.status(200).json({
      success: true,
      message: "Profile updated successfully",
      user: {
        id: req.user._id,
        name: req.user.name,
        email: req.user.email,
        image: req.user.image,
        phone: req.user.phone,
        role: req.user.role,
        isBlocked: req.user.isBlocked,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: "Error updating profile", error: error.message });
  }
}
