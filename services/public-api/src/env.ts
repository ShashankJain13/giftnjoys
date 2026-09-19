import { z } from 'zod';

const envSchema = z
  .object({
    APP_ENV: z.enum(['local', 'dev', 'prod']).default('local'),
    AWS_REGION: z.string().default('ap-south-1'),
    LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),

    DYNAMODB_ENDPOINT: z.string().url().optional(),
    LOCAL_AWS_ACCESS_KEY_ID: z.string().optional(),
    LOCAL_AWS_SECRET_ACCESS_KEY: z.string().optional(),
    MEDIA_BASE_URL: z.string().url(),

    EMAIL_TRANSPORT: z.enum(['smtp', 'ses', 'log']).default('smtp'),
    SMTP_HOST: z.string().default('localhost'),
    SMTP_PORT: z.coerce.number().int().default(1025),
    EMAIL_FROM: z.string().min(3).default('SmileBox <orders@smilebox.local>'),

    QUEUE_MODE: z.enum(['inprocess', 'sqs']).default('inprocess'),
    NOTIFICATIONS_QUEUE_URL: z.string().optional(),

    // Optional: only needed to enable storefront account (OAuth) endpoints.
    CUSTOMER_JWT_SECRET: z.string().optional(),
    /** Shared secret the storefront's own server sends when upserting an account after OAuth sign-in. */
    INTERNAL_API_SECRET: z.string().optional(),

    PUBLIC_SITE_URL: z.string().url().default('http://localhost:3000'),
    ADMIN_SITE_URL: z.string().url().default('http://localhost:5173'),
    CORS_ORIGINS: z
      .string()
      .default('')
      .transform((v) => v.split(',').map((s) => s.trim()).filter(Boolean)),
    PUBLIC_API_PORT: z.coerce.number().int().default(4000),
    CATALOG_TTL_SECONDS: z.coerce.number().int().min(0).max(3600).optional(),
    ORDER_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(1).default(10),
  })
  .superRefine((env, ctx) => {
    if (env.QUEUE_MODE === 'sqs' && !env.NOTIFICATIONS_QUEUE_URL) {
      ctx.addIssue({ code: 'custom', message: 'NOTIFICATIONS_QUEUE_URL is required when QUEUE_MODE=sqs' });
    }
  });

export type Env = z.infer<typeof envSchema> & { CATALOG_TTL_SECONDS: number };

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const details = parsed.error.issues.map((i) => `  - ${i.path.join('.') || '(env)'}: ${i.message}`).join('\n');
    throw new Error(`Invalid public-api configuration:\n${details}`);
  }
  const env = parsed.data;
  return {
    ...env,
    CORS_ORIGINS: env.CORS_ORIGINS.length ? env.CORS_ORIGINS : [env.PUBLIC_SITE_URL],
    CATALOG_TTL_SECONDS: env.CATALOG_TTL_SECONDS ?? (env.APP_ENV === 'local' ? 5 : 60),
  };
}
