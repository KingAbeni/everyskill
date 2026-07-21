import { Router } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import { requireAuth } from "../../middleware/auth";
import {
  forgotPasswordHandler,
  loginHandler,
  logoutHandler,
  refreshHandler,
  registerHandler,
  resetPasswordHandler,
} from "./auth.controller";

export const authRouter = Router();

authRouter.post("/register", asyncHandler(registerHandler));
authRouter.post("/login", asyncHandler(loginHandler));
authRouter.post("/refresh", asyncHandler(refreshHandler));
authRouter.post("/logout", requireAuth, asyncHandler(logoutHandler));
authRouter.post("/forgot-password", asyncHandler(forgotPasswordHandler));
authRouter.post("/reset-password", asyncHandler(resetPasswordHandler));
