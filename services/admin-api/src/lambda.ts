import type { NotificationEvent } from '@gnj/notifications';
import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm';
import type { SQSBatchResponse, SQSEvent } from 'aws-lambda';
import { handle } from 'hono/aws-lambda';
import { createApp } from './app';
import { createContext, type ImportJobMessage } from './context';
import { loadEnv } from './env';
import { processImportJob } from './workers/import-worker';

// Secrets live in SSM Parameter Store, not in Lambda environment variables. Loaded once per cold start.
async function loadSecret(ssmParamEnvVar: string, targetEnvVar: string): Promise<void> {
  const paramName = process.env[ssmParamEnvVar];
  if (!paramName || process.env[targetEnvVar]) return;
  const res = await new SSMClient({}).send(new GetParameterCommand({ Name: paramName, WithDecryption: true }));
  process.env[targetEnvVar] = res.Parameter?.Value;
}

await loadSecret('LOCAL_JWT_SECRET_SSM_PARAM', 'LOCAL_JWT_SECRET');
await loadSecret('WHATSAPP_ACCESS_TOKEN_SSM_PARAM', 'WHATSAPP_ACCESS_TOKEN');
await loadSecret('WHATSAPP_APP_SECRET_SSM_PARAM', 'WHATSAPP_APP_SECRET');
await loadSecret('WHATSAPP_VERIFY_TOKEN_SSM_PARAM', 'WHATSAPP_VERIFY_TOKEN');

// Created once per Lambda container and reused across invocations.
const ctx = createContext(loadEnv());

/** API Gateway (HTTP API) → Hono */
export const handler = handle(createApp(ctx));

async function eachRecord<T>(event: SQSEvent, fn: (message: T) => Promise<void>): Promise<SQSBatchResponse> {
  const batchItemFailures: SQSBatchResponse['batchItemFailures'] = [];
  for (const record of event.Records) {
    try {
      await fn(JSON.parse(record.body) as T);
    } catch (err) {
      ctx.log.error('sqs.record_failed', { messageId: record.messageId, error: String(err) });
      batchItemFailures.push({ itemIdentifier: record.messageId });
    }
  }
  return { batchItemFailures };
}

/** SQS imports queue → WhatsApp import worker */
export const importWorker = (event: SQSEvent) =>
  eachRecord<ImportJobMessage>(event, (m) => processImportJob(ctx, m.jobId));

/** SQS notifications queue → email notifier (shared by public-api and admin-api) */
export const notifier = (event: SQSEvent) => eachRecord<NotificationEvent>(event, ctx.handleNotification);
