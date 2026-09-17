import { z } from 'zod';

const csv = z
  .string()
  .default('')
  .transform((v) => v.split(',').map((s) => s.trim()).filter(Boolean));

const envSchema = z
  .object({
    APP_ENV: z.enum(['local', 'dev', 'prod']).default('local'),
    AWS_REGION: z.string().default('ap-south-1'),
    LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),

    DYNAMODB_ENDPOINT: z.string().url().optional(),
    S3_ENDPOINT: z.string().url().optional(),
    LOCAL_AWS_ACCESS_KEY_ID: z.string().optional(),
    LOCAL_AWS_SECRET_ACCESS_KEY: z.string().optional(),

    MEDIA_BUCKET: z.string().min(3),
    IMPORTS_BUCKET: z.string().min(3),
    MEDIA_BASE_URL: z.string().url(),

    AUTH_MODE: z.enum(['local', 'cognito']).default('local'),
    LOCAL_JWT_SECRET: z.string().optional(),
    COGNITO_USER_POOL_ID: z.string().optional(),
    COGNITO_CLIENT_ID: z.string().optional(),

    EMAIL_TRANSPORT: z.enum(['smtp', 'ses', 'log']).default('smtp'),
    SMTP_HOST: z.string().default('localhost'),
    SMTP_PORT: z.coerce.number().int().default(1025),
    EMAIL_FROM: z.string().min(3).default('SmileBox <orders@smilebox.local>'),

    QUEUE_MODE: z.enum(['inprocess', 'sqs']).default('inprocess'),
    NOTIFICATIONS_QUEUE_URL: z.string().optional(),
    IMPORTS_QUEUE_URL: z.string().optional(),

    PUBLIC_SITE_URL: z.string().url().default('http://localhost:3000'),
    ADMIN_SITE_URL: z.string().url().default('http://localhost:5173'),
    CORS_ORIGINS: csv,
    ADMIN_API_PORT: z.coerce.number().int().default(4001),
  })
  .superRefine((env, ctx) => {
    if (env.AUTH_MODE === 'local') {
      if (env.APP_ENV === 'prod') ctx.addIssue({ code: 'custom', message: 'AUTH_MODE=local is not allowed in prod' });
      if (!env.LOCAL_JWT_SECRET || env.LOCAL_JWT_SECRET.length < 32) {
        ctx.addIssue({ code: 'custom', path: ['LOCAL_JWT_SECRET'], message: 'Set LOCAL_JWT_SECRET (>= 32 chars)' });
      }
    }
    if (env.AUTH_MODE === 'cognito' && (!env.COGNITO_USER_POOL_ID || !env.COGNITO_CLIENT_ID)) {
      ctx.addIssue({ code: 'custom', message: 'COGNITO_USER_POOL_ID and COGNITO_CLIENT_ID are required' });
    }
    if (env.QUEUE_MODE === 'sqs' && (!env.NOTIFICATIONS_QUEUE_URL || !env.IMPORTS_QUEUE_URL)) {
      ctx.addIssue({ code: 'custom', message: 'Queue URLs are required when QUEUE_MODE=sqs' });
    }
  });

export type Env = z.infer<typeof envSchema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const details = parsed.error.issues.map((i) => `  - ${i.path.join('.') || '(env)'}: ${i.message}`).join('\n');
    throw new Error(`Invalid admin-api configuration:\n${details}`);
  }
  const env = parsed.data;
  if (env.CORS_ORIGINS.length === 0) env.CORS_ORIGINS = [env.ADMIN_SITE_URL];
  return env;
}
