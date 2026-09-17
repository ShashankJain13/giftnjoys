import { z } from 'zod';
import { idSchema, slugSchema } from './common';

export interface Category {
  id: string;
  slug: string;
  name: string;
  description?: string;
  parentId?: string;
  imageKey?: string;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

const categoryFields = {
  name: z.string().trim().min(2).max(80),
  slug: slugSchema,
  description: z.string().trim().max(500).nullable(),
  parentId: idSchema.nullable(),
  imageKey: z.string().max(512).nullable(),
  sortOrder: z.number().int().min(0).max(10_000),
  isActive: z.boolean(),
};

export const categoryCreateSchema = z.object(categoryFields).partial().required({ name: true });
export const categoryUpdateSchema = z.object(categoryFields).partial();
export type CategoryCreateInput = z.infer<typeof categoryCreateSchema>;
export type CategoryUpdateInput = z.infer<typeof categoryUpdateSchema>;

export const categoryReorderSchema = z.object({ ids: z.array(idSchema).min(1).max(500) });
