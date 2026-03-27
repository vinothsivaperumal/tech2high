import { NextFunction, Request, Response } from "express";

import { verifyAuthToken } from "../utils/jwt";
import { UserRole } from "../types/roles";

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;

  if (!header || !header.startsWith("Bearer ")) {
    res.status(401).json({ message: "Missing or invalid authorization header." });
    return;
  }

  const token = header.replace("Bearer ", "").trim();

  try {
    req.user = verifyAuthToken(token);
    next();
  } catch {
    res.status(401).json({ message: "Invalid or expired token." });
  }
}

export function requireRole(roles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ message: "Unauthorized" });
      return;
    }

    if (!roles.includes(req.user.role)) {
      res.status(403).json({ message: "Forbidden" });
      return;
    }

    next();
  };
}
