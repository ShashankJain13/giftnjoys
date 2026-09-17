import { resolve } from 'node:path';

const repoRoot = resolve(import.meta.dirname, '../..');

try {
  process.loadEnvFile(resolve(repoRoot, '.env.local'));
} catch {
  // Optional: values may come from the shell instead.
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}. Copy .env.example to .env.local first.`);
  return value;
}

function assertLocalUrl(name: string, value: string): string {
  const host = new URL(value).hostname;
  if (!['localhost', '127.0.0.1', '0.0.0.0'].includes(host)) {
    throw new Error(`${name}=${value} is not local. These scripts only run against the local Docker stack.`);
  }
  return value;
}

/** Local-only configuration; refuses to run against anything that is not localhost. */
export function loadLocalEnv() {
  if (required('APP_ENV') !== 'local') throw new Error('APP_ENV must be "local" for setup/seed scripts');
  const credentials = {
    accessKeyId: required('LOCAL_AWS_ACCESS_KEY_ID'),
    secretAccessKey: required('LOCAL_AWS_SECRET_ACCESS_KEY'),
  };
  return {
    region: required('AWS_REGION'),
    tablePrefix: `gnj-${required('APP_ENV')}`,
    dynamodbEndpoint: assertLocalUrl('DYNAMODB_ENDPOINT', required('DYNAMODB_ENDPOINT')),
    s3Endpoint: assertLocalUrl('S3_ENDPOINT', required('S3_ENDPOINT')),
    credentials,
    mediaBucket: required('MEDIA_BUCKET'),
    importsBucket: required('IMPORTS_BUCKET'),
    mediaBaseUrl: required('MEDIA_BASE_URL'),
    adminEmail: required('ADMIN_EMAIL'),
    adminPassword: required('ADMIN_PASSWORD'),
  };
}
