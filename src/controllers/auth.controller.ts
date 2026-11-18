import { Request, Response } from "express";
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

export function resolveGoogleCallbackUrl(req: Request): string {
  const host = req.headers["x-forwarded-host"] || req.get("host") || "localhost:5000";
  const protocol = req.headers["x-forwarded-proto"] || req.protocol || "http";
  return `${protocol}://${host}/api/auth/google/callback`;
}

/**
 * Initiates Real Google OAuth 2.0 Authorization Flow
 */
export function googleRedirect(req: Request, res: Response): void {
  const rootUrl = "https://accounts.google.com/o/oauth2/v2/auth";

  const returnClientUrl = (req.query.returnTo as string) || ENV.CLIENT_URL;
  const redirectPath = (req.query.redirect as string) || "/dashboard/customer";

  const stateParam = Buffer.from(
    JSON.stringify({
      returnTo: returnClientUrl,
      redirect: redirectPath,
    })
  ).toString("base64");

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

  let returnClient = ENV.CLIENT_URL;
  let redirectPath = "/dashboard/customer";

  if (rawState) {
    try {
      const parsed = JSON.parse(Buffer.from(rawState, "base64").toString("utf-8"));
      if (parsed.returnTo) returnClient = parsed.returnTo;
      if (parsed.redirect) redirectPath = parsed.redirect;
    } catch {
      // Ignore parse failure, use defaults
    }
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
    if (!profileRes.ok || !profileData.email) {
      console.error("[Google OAuth] Profile fetch error:", profileData);
      res.redirect(`${returnClient}/sign-in?error=Failed+to+fetch+Google+profile`);
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

    res.redirect(`${returnClient}/sign-in?token=${encodeURIComponent(token)}&user=${userJson}&redirect=${encodeURIComponent(redirectPath)}`);
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
