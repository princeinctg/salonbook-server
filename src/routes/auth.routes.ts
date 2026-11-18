import { Router } from "express";
import {
  signUp,
  signIn,
  googleRedirect,
  googleCallback,
  googleSignIn,
  getProfile,
  updateProfile,
} from "../controllers/auth.controller";
import { authenticate } from "../middleware/auth.middleware";

const router = Router();

router.post("/signup", signUp);
router.post("/signin", signIn);

// Real Google OAuth 2.0 flow
router.get("/google", googleRedirect);
router.get("/google/callback", googleCallback);
// Alias for Better Auth's default callback path, in case that URI is registered.
router.get("/callback/google", googleCallback);

// Backward-compatible JSON endpoint
router.post("/google", googleSignIn);

router.get("/profile", authenticate, getProfile);
router.patch("/profile", authenticate, updateProfile);

export default router;
