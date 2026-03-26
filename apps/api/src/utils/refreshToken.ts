// utils/refreshToken.ts
// Implements refresh token generation and verification for secure session renewal

import jwt from "jsonwebtoken";
import { env } from "../config/env";
import type { UserRole } from "../types/roles";

export interface RefreshTokenPayload {
  id: string;
  email: string;
  role: UserRole;
  type: "refresh";
}

// 7 days expiry for refresh tokens
export function signRefreshToken(payload: Omit<RefreshTokenPayload, "type">): string {
  return jwt.sign({ ...payload, type: "refresh" }, env.JWT_SECRET, { expiresIn: "7d" });
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  const decoded = jwt.verify(token, env.JWT_SECRET);
  if (typeof decoded !== "object" || !decoded || decoded.type !== "refresh") {
    throw new Error("Invalid refresh token payload.");
  }
  return decoded as RefreshTokenPayload;
}
