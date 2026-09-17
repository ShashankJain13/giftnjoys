import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm';
import { GetCallerIdentityCommand, STSClient } from '@aws-sdk/client-sts';
import { execFileSync } from 'node:child_process';
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

export interface SeedTarget {
  kind: 'local' | 'aws';
  region: string;
  tablePrefix: string;
  dynamodbEndpoint?: string;
  s3Endpoint?: string;
  credentials?: { accessKeyId: string; secretAccessKey: string };
  mediaBucket: string;
  importsBucket: string;
  mediaBaseUrl: string;
  adminEmail: string;
  adminPassword: string;
}

/** Local-only configuration; refuses to run against anything that is not localhost. */
export function loadLocalEnv(): SeedTarget {
  if (required('APP_ENV') !== 'local') throw new Error('APP_ENV must be "local" for setup/seed scripts');
  return {
    kind: 'local',
    region: required('AWS_REGION'),
    tablePrefix: `gnj-${required('APP_ENV')}`,
    dynamodbEndpoint: assertLocalUrl('DYNAMODB_ENDPOINT', required('DYNAMODB_ENDPOINT')),
    s3Endpoint: assertLocalUrl('S3_ENDPOINT', required('S3_ENDPOINT')),
    credentials: {
      accessKeyId: required('LOCAL_AWS_ACCESS_KEY_ID'),
      secretAccessKey: required('LOCAL_AWS_SECRET_ACCESS_KEY'),
    },
    mediaBucket: required('MEDIA_BUCKET'),
    importsBucket: required('IMPORTS_BUCKET'),
    mediaBaseUrl: required('MEDIA_BASE_URL'),
    adminEmail: required('ADMIN_EMAIL'),
    adminPassword: required('ADMIN_PASSWORD'),
  };
}

/**
 * AWS configuration read from Terraform outputs of infra/terraform/envs/<env>.
 * Requires AWS_PROFILE and verifies the caller is in the account Terraform manages.
 */
export async function loadAwsTarget(envName = 'dev'): Promise<SeedTarget> {
  if (!process.env.AWS_PROFILE) throw new Error('Set AWS_PROFILE (e.g. AWS_PROFILE=giftnjoys-dev) for --aws');
  const tfDir = resolve(repoRoot, 'infra/terraform/envs', envName);
  const raw = execFileSync('terraform', [`-chdir=${tfDir}`, 'output', '-json'], { encoding: 'utf8' });
  const outputs = JSON.parse(raw) as Record<string, { value: string }>;
  const out = (key: string) => {
    const v = outputs[key]?.value;
    if (!v) throw new Error(`Terraform output "${key}" missing in ${tfDir} — apply the stack first`);
    return v;
  };

  const region = out('region');
  const identity = await new STSClient({ region }).send(new GetCallerIdentityCommand({}));
  if (identity.Account !== out('account_id')) {
    throw new Error(`AWS_PROFILE account ${identity.Account} does not match Terraform account ${out('account_id')}`);
  }
  const password = await new SSMClient({ region }).send(
    new GetParameterCommand({ Name: out('admin_initial_password_parameter'), WithDecryption: true }),
  );

  return {
    kind: 'aws',
    region,
    tablePrefix: out('table_prefix'),
    mediaBucket: out('media_bucket_name'),
    importsBucket: out('imports_bucket_name'),
    mediaBaseUrl: out('cdn_url'),
    adminEmail: out('admin_email'),
    adminPassword: password.Parameter!.Value!,
  };
}
