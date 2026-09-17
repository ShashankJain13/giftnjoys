import {
  createLogger,
  InProcessQueue,
  LogEmailSender,
  S3Storage,
  SesEmailSender,
  SmtpEmailSender,
  SqsQueue,
  type EmailSender,
  type JobQueue,
  type Logger,
} from '@gnj/adapters';
import { createDb, createRepositories, type Repositories } from '@gnj/core';
import { createNotificationHandler, type NotificationEvent } from '@gnj/notifications';
import { createAuthenticator, type Authenticator } from './auth';
import type { Env } from './env';
import { processImportJob } from './workers/import-worker';

export interface ImportJobMessage {
  jobId: string;
}

export interface AppContext {
  env: Env;
  log: Logger;
  repos: Repositories;
  storage: S3Storage;
  email: EmailSender;
  auth: Authenticator;
  notifications: JobQueue<NotificationEvent>;
  imports: JobQueue<ImportJobMessage>;
  handleNotification: (event: NotificationEvent) => Promise<void>;
}

export function createContext(env: Env): AppContext {
  const log = createLogger('admin-api', env.LOG_LEVEL);
  const localCredentials =
    env.LOCAL_AWS_ACCESS_KEY_ID && env.LOCAL_AWS_SECRET_ACCESS_KEY
      ? { accessKeyId: env.LOCAL_AWS_ACCESS_KEY_ID, secretAccessKey: env.LOCAL_AWS_SECRET_ACCESS_KEY }
      : undefined;

  const db = createDb({
    region: env.AWS_REGION,
    tablePrefix: `gnj-${env.APP_ENV}`,
    ...(env.DYNAMODB_ENDPOINT ? { endpoint: env.DYNAMODB_ENDPOINT, credentials: localCredentials } : {}),
  });
  const repos = createRepositories(db);

  const storage = new S3Storage({
    region: env.AWS_REGION,
    mediaBucket: env.MEDIA_BUCKET,
    importsBucket: env.IMPORTS_BUCKET,
    mediaBaseUrl: env.MEDIA_BASE_URL,
    ...(env.S3_ENDPOINT ? { endpoint: env.S3_ENDPOINT, credentials: localCredentials } : {}),
  });

  const email: EmailSender =
    env.EMAIL_TRANSPORT === 'ses'
      ? new SesEmailSender({ region: env.AWS_REGION, from: env.EMAIL_FROM })
      : env.EMAIL_TRANSPORT === 'smtp'
        ? new SmtpEmailSender({ host: env.SMTP_HOST, port: env.SMTP_PORT, from: env.EMAIL_FROM })
        : new LogEmailSender(log);

  const handleNotification = createNotificationHandler({
    orders: repos.orders,
    settings: repos.settings,
    email,
    siteUrl: env.PUBLIC_SITE_URL,
    adminUrl: env.ADMIN_SITE_URL,
    mediaUrl: (key) => storage.publicUrl(key),
    log,
  });

  const ctx: AppContext = {
    env,
    log,
    repos,
    storage,
    email,
    auth: createAuthenticator(env, repos.meta),
    handleNotification,
    notifications: undefined as unknown as JobQueue<NotificationEvent>,
    imports: undefined as unknown as JobQueue<ImportJobMessage>,
  };

  if (env.QUEUE_MODE === 'sqs') {
    ctx.notifications = new SqsQueue({ queueUrl: env.NOTIFICATIONS_QUEUE_URL!, region: env.AWS_REGION });
    ctx.imports = new SqsQueue({ queueUrl: env.IMPORTS_QUEUE_URL!, region: env.AWS_REGION });
  } else {
    ctx.notifications = new InProcessQueue('notifications', handleNotification, log);
    ctx.imports = new InProcessQueue('imports', (m: ImportJobMessage) => processImportJob(ctx, m.jobId), log);
  }
  return ctx;
}
