import { z } from 'zod';

export const IMPORT_JOB_STATUSES = ['QUEUED', 'PROCESSING', 'DONE', 'FAILED'] as const;
export type ImportJobStatus = (typeof IMPORT_JOB_STATUSES)[number];

export interface ImportJobStats {
  messages: number;
  candidates: number;
  created: number;
  duplicates: number;
  withoutImage: number;
  withoutPrice: number;
  imagesUploaded: number;
  videosUploaded: number;
}

export interface ImportJob {
  id: string;
  /** Constant partition for the byCreatedAt GSI. */
  kind: 'IMPORT';
  filename: string;
  s3Key: string;
  status: ImportJobStatus;
  stats?: ImportJobStats;
  warnings?: string[];
  error?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  finishedAt?: string;
}

export const importCreateSchema = z.object({
  key: z
    .string()
    .min(1)
    .max(512)
    .regex(/^imports\/[A-Za-z0-9/_.-]+$/, 'Invalid upload key'),
  filename: z.string().trim().min(1).max(200),
});

export const UPLOAD_PURPOSES = ['product-image', 'product-video', 'category-image', 'banner-image', 'import'] as const;
export const IMAGE_CONTENT_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] as const;
export const VIDEO_CONTENT_TYPES = ['video/mp4', 'video/quicktime'] as const;
export const IMPORT_CONTENT_TYPES = ['application/zip', 'application/x-zip-compressed', 'text/plain'] as const;

export const presignUploadSchema = z.object({
  purpose: z.enum(UPLOAD_PURPOSES),
  filename: z.string().trim().min(1).max(200),
  contentType: z.string().trim().min(3).max(100),
});
