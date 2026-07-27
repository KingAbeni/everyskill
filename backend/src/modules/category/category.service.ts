import { prisma } from "../../config/prisma";
import { AppError } from "../../utils/AppError";
import { z } from "zod";
import { createCategorySchema, updateCategorySchema } from "./category.schemas";

type CreateCategoryInput = z.infer<typeof createCategorySchema>;
type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;

export async function listCategories() {
  return prisma.category.findMany({ orderBy: { name: "asc" } });
}

async function assertParentExists(parentId: string, selfId?: string) {
  if (parentId === selfId) {
    throw new AppError(400, "A category cannot be its own parent");
  }
  const parent = await prisma.category.findUnique({ where: { id: parentId } });
  if (!parent) {
    throw new AppError(404, "Parent category not found");
  }
}

export async function createCategory(input: CreateCategoryInput) {
  const existing = await prisma.category.findUnique({ where: { name: input.name } });
  if (existing) {
    throw new AppError(409, "A category with this name already exists");
  }
  if (input.parentId) {
    await assertParentExists(input.parentId);
  }
  return prisma.category.create({ data: input });
}

export async function updateCategory(categoryId: string, input: UpdateCategoryInput) {
  const category = await prisma.category.findUnique({ where: { id: categoryId } });
  if (!category) {
    throw new AppError(404, "Category not found");
  }

  if (input.name && input.name !== category.name) {
    const existing = await prisma.category.findUnique({ where: { name: input.name } });
    if (existing) {
      throw new AppError(409, "A category with this name already exists");
    }
  }

  if (input.parentId) {
    await assertParentExists(input.parentId, categoryId);
  }

  return prisma.category.update({ where: { id: categoryId }, data: input });
}

export async function deleteCategory(categoryId: string) {
  const category = await prisma.category.findUnique({ where: { id: categoryId } });
  if (!category) {
    throw new AppError(404, "Category not found");
  }

  const [childCount, listingCount] = await Promise.all([
    prisma.category.count({ where: { parentId: categoryId } }),
    prisma.serviceListing.count({ where: { categories: { some: { id: categoryId } } } }),
  ]);

  if (childCount > 0) {
    throw new AppError(409, "Cannot delete a category that has subcategories");
  }
  if (listingCount > 0) {
    throw new AppError(409, "Cannot delete a category that has listings");
  }

  await prisma.category.delete({ where: { id: categoryId } });
}
