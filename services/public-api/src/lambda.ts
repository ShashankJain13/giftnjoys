import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm';
import { handle } from 'hono/aws-lambda';
import { createApp } from './app';
import { createContext } from './context';
import { loadEnv } from './env';

// Secrets live in SSM Parameter Store, not in Lambda environment variables. Loaded once per cold start.
async function loadSecret(ssmParamEnvVar: string, targetEnvVar: string): Promise<void> {
  const paramName = process.env[ssmParamEnvVar];
  if (!paramName || process.env[targetEnvVar]) return;
  const res = await new SSMClient({}).send(new GetParameterCommand({ Name: paramName, WithDecryption: true }));
  process.env[targetEnvVar] = res.Parameter?.Value;
}

await loadSecret('CUSTOMER_JWT_SECRET_SSM_PARAM', 'CUSTOMER_JWT_SECRET');
await loadSecret('INTERNAL_API_SECRET_SSM_PARAM', 'INTERNAL_API_SECRET');

// Created once per Lambda container; the catalog cache lives across warm invocations.
export const handler = handle(createApp(createContext(loadEnv())));
