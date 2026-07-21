import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env";
import { AppError } from "../utils/AppError";

export interface AccessTokenPayload {
  sub: string;
  role: "CUSTOMER" | "PROVIDER" | "ADMIN" | "SUPER_ADMIN";
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AccessTokenPayload;
    }
  }
}

export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    throw new AppError(401, "Missing or invalid Authorization header");
  }

  const token = header.slice("Bearer ".length);
  try {
    const payload = jwt.verify(token, env.jwt.accessSecret) as AccessTokenPayload;
    req.user = payload;
    next();
  } catch {
    throw new AppError(401, "Invalid or expired access token");
  }
}

export function requireRole(...roles: AccessTokenPayload["role"][]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      throw new AppError(403, "Insufficient permissions");
    }
    next();
  };
}
