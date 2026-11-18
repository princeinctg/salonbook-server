import jwt, { SignOptions } from "jsonwebtoken";
import { ENV } from "../config/env";

export interface TokenPayload {
  userId: string;
  email: string;
  role: "customer" | "admin";
}

export function generateToken(payload: TokenPayload): string {
  const options: SignOptions = {
    expiresIn: (ENV.JWT_EXPIRES_IN || "7d") as any,
  };
  return jwt.sign(payload, ENV.JWT_SECRET, options);
}

export function verifyToken(token: string): TokenPayload {
  return jwt.verify(token, ENV.JWT_SECRET) as TokenPayload;
}
