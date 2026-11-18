import { Request, Response, NextFunction } from "express";
import { verifyToken, TokenPayload } from "../utils/jwt";
import { User, IUser } from "../models/user.model";

// Extend Express Request interface
declare global {
  namespace Express {
    interface Request {
      user?: IUser;
      tokenPayload?: TokenPayload;
    }
  }
}

export async function authenticate(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      res.status(401).json({ success: false, message: "Authentication required. Missing or invalid Bearer token." });
      return;
    }

    const token = authHeader.split(" ")[1];
    let decoded: TokenPayload;
    try {
      decoded = verifyToken(token);
    } catch (err: any) {
      res.status(401).json({ success: false, message: "Invalid or expired token." });
      return;
    }

    const user = await User.findById(decoded.userId);
    if (!user) {
      res.status(401).json({ success: false, message: "User account no longer exists." });
      return;
    }

    if (user.isBlocked) {
      res.status(403).json({ success: false, message: "Access denied. Your account has been suspended by an administrator." });
      return;
    }

    req.user = user;
    req.tokenPayload = decoded;
    next();
  } catch (error: any) {
    res.status(500).json({ success: false, message: "Authentication error", error: error.message });
  }
}

export function authorizeRole(roles: Array<"customer" | "admin">) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ success: false, message: "Unauthorized. Authentication required." });
      return;
    }

    if (!roles.includes(req.user.role)) {
      res.status(403).json({
        success: false,
        message: `Forbidden. Action restricted to [${roles.join(", ")}] roles.`,
      });
      return;
    }

    next();
  };
}
