import { NextFunction, Request, Response } from "express";

export function requestLogger(req: Request, res: Response, next: NextFunction) {
  const start = Date.now();

  res.on("finish", () => {
    const durationMs = Date.now() - start;
    const who = req.user ? `${req.user.role}:${req.user.sub}` : "anon";
    console.log(`${req.method} ${req.originalUrl} ${res.statusCode} ${durationMs}ms [${who}]`);
  });

  next();
}
