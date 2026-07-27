import { Request, Response } from "express";
import * as categoryService from "./category.service";
import { createCategorySchema, updateCategorySchema } from "./category.schemas";

export async function listCategoriesHandler(req: Request, res: Response) {
  const categories = await categoryService.listCategories();
  res.status(200).json(categories);
}

export async function createCategoryHandler(req: Request, res: Response) {
  const input = createCategorySchema.parse(req.body);
  const category = await categoryService.createCategory(input);
  res.status(201).json(category);
}

export async function updateCategoryHandler(req: Request, res: Response) {
  const input = updateCategorySchema.parse(req.body);
  const category = await categoryService.updateCategory(req.params.categoryId, input);
  res.status(200).json(category);
}

export async function deleteCategoryHandler(req: Request, res: Response) {
  await categoryService.deleteCategory(req.params.categoryId);
  res.status(204).send();
}
