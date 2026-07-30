import { Request, Response, Router } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import * as gamificationService from "./gamification.service";

/**
 * Public provider gamification endpoints — mounted at /api/providers BEFORE providerRouter in
 * app.ts, since providerRouter gates its entire mount path behind requireAuth+requireRole
 * (Express router-level .use() middleware applies to the whole router, not per-route, so a public
 * sub-route can't live inside providerRouter itself). Path shapes (".../stats", ".../achievements")
 * never collide with providerRouter's literal "/me/..." routes.
 */
export const publicProviderStatsRouter = Router();

async function getStatsHandler(req: Request, res: Response) {
  const stats = await gamificationService.getProviderStats(req.params.providerProfileId);
  res.status(200).json(stats);
}

async function getAchievementsHandler(req: Request, res: Response) {
  const achievements = await gamificationService.getProviderAchievements(req.params.providerProfileId);
  res.status(200).json(achievements);
}

publicProviderStatsRouter.get("/:providerProfileId/stats", asyncHandler(getStatsHandler));
publicProviderStatsRouter.get("/:providerProfileId/achievements", asyncHandler(getAchievementsHandler));
