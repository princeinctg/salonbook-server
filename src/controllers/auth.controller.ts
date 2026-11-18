import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { User } from "../models/user.model";
import { generateToken } from "../utils/jwt";

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
