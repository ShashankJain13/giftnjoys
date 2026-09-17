import {
  createLogger,
  InProcessQueue,
  LogEmailSender,
  SesEmailSender,
  SmtpEmailSender,
  SqsQueue,
  type EmailSender,
  type JobQueue,
  type Logger,
} from '@gnj/adapters';
import { createDb, createRepositories, type Repositories } from '@gnj/core';
import { createNotificationHandler, type NotificationEvent } from '@gnj/notifications';
import { CatalogCache } from './catalog';
import type { Env } from './env';

export interface AppContext {
  env: Env;
  log: Logger;
  repos: Repositories;
  catalog: CatalogCache;
  notifications: JobQueue<NotificationEvent>;
  mediaUrl: (key: string) => string;
}

export function createContext(env: Env): AppContext {
  const log = createLogger('public-api', env.LOG_LEVEL);
  const db = createDb({
    region: env.AWS_REGION,
    tablePrefix: `gnj-${env.APP_ENV}`,
    ...(env.DYNAMODB_ENDPOINT
      ? {
          endpoint: env.DYNAMODB_ENDPOINT,
          credentials: {
            accessKeyId: env.LOCAL_AWS_ACCESS_KEY_ID ?? 'local',
            secretAccessKey: env.LOCAL_AWS_SECRET_ACCESS_KEY ?? 'local',
          },
        }
      : {}),
  });
  const repos = createRepositories(db);
  const base = env.MEDIA_BASE_URL.replace(/\/$/, '');
  const mediaUrl = (key: string) => `${base}/${key}`;

  let notifications: JobQueue<NotificationEvent>;
  if (env.QUEUE_MODE === 'sqs') {
    notifications = new SqsQueue({ queueUrl: env.NOTIFICATIONS_QUEUE_URL!, region: env.AWS_REGION });
  } else {
    const email: EmailSender =
      env.EMAIL_TRANSPORT === 'ses'
        ? new SesEmailSender({ region: env.AWS_REGION, from: env.EMAIL_FROM })
        : env.EMAIL_TRANSPORT === 'smtp'
          ? new SmtpEmailSender({ host: env.SMTP_HOST, port: env.SMTP_PORT, from: env.EMAIL_FROM })
          : new LogEmailSender(log);
    const handler = createNotificationHandler({
      orders: repos.orders,
      settings: repos.settings,
      email,
      siteUrl: env.PUBLIC_SITE_URL,
      adminUrl: env.ADMIN_SITE_URL,
      mediaUrl,
      log,
    });
    notifications = new InProcessQueue('notifications', handler, log);
  }

  return {
    env,
    log,
    repos,
    catalog: new CatalogCache(repos, mediaUrl, env.CATALOG_TTL_SECONDS * 1000, log),
    notifications,
    mediaUrl,
  };
}
