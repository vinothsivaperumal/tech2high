import jwt from "jsonwebtoken";



import { ROLES, UserRole } from "../types/roles";
import { env } from "../config/env";

export interface AuthTokenPayload {
  id: string;
  email: string;
  role: UserRole;
}


// Access token: 1 hour expiry (security best practice)
export function signAuthToken(payload: AuthTokenPayload): string {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: "1h" });
}

export function verifyAuthToken(token: string): AuthTokenPayload {
  const decoded = jwt.verify(token, env.JWT_SECRET);

  if (typeof decoded !== "object" || !decoded) {
    throw new Error("Invalid auth token payload.");
  }

  return {
    id: String(decoded.id),
    email: String(decoded.email),
    role: decoded.role as UserRole
  };
}
