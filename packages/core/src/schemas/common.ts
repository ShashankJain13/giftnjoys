import { z } from 'zod';

export const roundMoney = (value: number): number => Math.round((value + Number.EPSILON) * 100) / 100;

export const moneySchema = z
  .number({ error: 'Enter an amount' })
  .min(0, 'Amount cannot be negative')
  .max(10_000_000, 'Amount is too large')
  .transform(roundMoney);

export const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1)
  .max(120)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, numbers and single hyphens');

export const idSchema = z.string().trim().min(1).max(64);

/** A stored media object by S3 key — used for both product images and product videos. */
export const imageRefSchema = z.object({
  key: z
    .string()
    .min(1)
    .max(512)
    .regex(/^[A-Za-z0-9/_.-]+$/, 'Invalid image key'),
});
export type ImageRef = z.infer<typeof imageRefSchema>;

export interface ValidationIssue {
  path: string;
  message: string;
}

export function toIssues(error: z.ZodError): ValidationIssue[] {
  return error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message }));
}
