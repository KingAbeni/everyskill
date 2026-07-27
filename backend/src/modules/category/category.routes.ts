import { Router } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import { requireAuth, requireRole } from "../../middleware/auth";
import * as categoryController from "./category.controller";

export const categoryRouter = Router();

categoryRouter.get("/", asyncHandler(categoryController.listCategoriesHandler));

categoryRouter.post(
  "/",
  requireAuth,
  requireRole("ADMIN", "SUPER_ADMIN"),
  asyncHandler(categoryController.createCategoryHandler),
);
categoryRouter.patch(
  "/:categoryId",
  requireAuth,
  requireRole("ADMIN", "SUPER_ADMIN"),
  asyncHandler(categoryController.updateCategoryHandler),
);
categoryRouter.delete(
  "/:categoryId",
  requireAuth,
  requireRole("ADMIN", "SUPER_ADMIN"),
  asyncHandler(categoryController.deleteCategoryHandler),
);
