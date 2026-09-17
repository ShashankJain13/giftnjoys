import {
  CreateTableCommand,
  DynamoDBClient,
  ListTablesCommand,
  UpdateTimeToLiveCommand,
  waitUntilTableExists,
} from '@aws-sdk/client-dynamodb';
import { CreateBucketCommand, HeadBucketCommand, PutBucketPolicyCommand, S3Client } from '@aws-sdk/client-s3';
import { tableDefinitions, tableNames } from '@gnj/core';
import { loadLocalEnv } from './env';

const env = loadLocalEnv();

async function retry<T>(label: string, fn: () => Promise<T>, attempts = 30): Promise<T> {
  for (let i = 1; ; i++) {
    try {
      return await fn();
    } catch (err) {
      if (i >= attempts) throw err;
      if (i === 1) console.log(`… waiting for ${label}`);
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
}

async function setupTables() {
  const ddb = new DynamoDBClient({ region: env.region, endpoint: env.dynamodbEndpoint, credentials: env.credentials });
  const existing = new Set<string>();
  let start: string | undefined;
  do {
    const res = await retry('DynamoDB Local', () => ddb.send(new ListTablesCommand({ ExclusiveStartTableName: start })));
    res.TableNames?.forEach((t) => existing.add(t));
    start = res.LastEvaluatedTableName;
  } while (start);

  const names = tableNames(env.tablePrefix);
  for (const def of tableDefinitions(names)) {
    if (existing.has(def.TableName!)) {
      console.log(`✓ table ${def.TableName} exists`);
      continue;
    }
    await ddb.send(new CreateTableCommand(def));
    await waitUntilTableExists({ client: ddb, maxWaitTime: 60, minDelay: 1, maxDelay: 2 }, { TableName: def.TableName });
    console.log(`+ created table ${def.TableName}`);
  }

  try {
    await ddb.send(
      new UpdateTimeToLiveCommand({
        TableName: names.meta,
        TimeToLiveSpecification: { AttributeName: 'expiresAt', Enabled: true },
      }),
    );
  } catch {
    // Already enabled.
  }
}

async function setupBuckets() {
  const s3 = new S3Client({
    region: env.region,
    endpoint: env.s3Endpoint,
    forcePathStyle: true,
    credentials: env.credentials,
  });
  for (const bucket of [env.mediaBucket, env.importsBucket]) {
    const exists = await retry('MinIO', () =>
      s3.send(new HeadBucketCommand({ Bucket: bucket })).then(
        () => true,
        (err: { $metadata?: { httpStatusCode?: number } }) => {
          if (err.$metadata?.httpStatusCode === 404) return false;
          throw err;
        },
      ),
    );
    if (exists) console.log(`✓ bucket ${bucket} exists`);
    else {
      await s3.send(new CreateBucketCommand({ Bucket: bucket }));
      console.log(`+ created bucket ${bucket}`);
    }
  }
  // Media is publicly readable locally (CloudFront + OAC does this job in AWS). Imports stay private.
  await s3.send(
    new PutBucketPolicyCommand({
      Bucket: env.mediaBucket,
      Policy: JSON.stringify({
        Version: '2012-10-17',
        Statement: [
          {
            Effect: 'Allow',
            Principal: { AWS: ['*'] },
            Action: ['s3:GetObject'],
            Resource: [`arn:aws:s3:::${env.mediaBucket}/*`],
          },
        ],
      }),
    }),
  );
  console.log(`✓ public-read policy on ${env.mediaBucket}`);
}

await setupTables();
await setupBuckets();
console.log('Local setup complete.');
