/**
 * Copies every object from the local MinIO media bucket to an AWS S3 media bucket.
 * Used when switching local development to real S3 + CloudFront for images.
 *
 *   AWS_PROFILE=giftnjoys-dev pnpm --filter @gnj/scripts run sync-media -- --bucket giftnjoys-dev-media-637423417590
 *
 * Existing objects in S3 are skipped, so it is safe to re-run.
 */
import { GetObjectCommand, HeadObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { GetCallerIdentityCommand, STSClient } from '@aws-sdk/client-sts';
import { resolve } from 'node:path';

try {
  process.loadEnvFile(resolve(import.meta.dirname, '../../.env.local'));
} catch {
  /* optional */
}

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

const target = arg('bucket');
const sourceBucket = arg('source') ?? 'gnj-local-media';
const minioEndpoint = arg('minio') ?? 'http://localhost:9000';
const region = process.env.AWS_REGION ?? 'ap-south-1';
if (!target || !/^giftnjoys-[a-z0-9-]+-media-\d{12}$/.test(target)) {
  console.error('Usage: --bucket giftnjoys-<env>-media-<account-id> [--source gnj-local-media]');
  process.exit(1);
}

const minio = new S3Client({
  region,
  endpoint: minioEndpoint,
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.LOCAL_AWS_ACCESS_KEY_ID ?? 'minioadmin',
    secretAccessKey: process.env.LOCAL_AWS_SECRET_ACCESS_KEY ?? 'minioadmin',
  },
});
const aws = new S3Client({ region });

const identity = await new STSClient({ region }).send(new GetCallerIdentityCommand({}));
if (!target.endsWith(identity.Account!)) {
  console.error(`Refusing: bucket ${target} does not belong to the current AWS account ${identity.Account}`);
  process.exit(1);
}
console.log(`Copying s3://${sourceBucket} (MinIO) → s3://${target} as ${identity.Arn}`);

let copied = 0;
let skipped = 0;
let token: string | undefined;
do {
  const page = await minio.send(new ListObjectsV2Command({ Bucket: sourceBucket, ContinuationToken: token }));
  for (const obj of page.Contents ?? []) {
    const key = obj.Key!;
    const exists = await aws.send(new HeadObjectCommand({ Bucket: target, Key: key })).then(
      () => true,
      () => false,
    );
    if (exists) {
      skipped++;
      continue;
    }
    const src = await minio.send(new GetObjectCommand({ Bucket: sourceBucket, Key: key }));
    await aws.send(
      new PutObjectCommand({
        Bucket: target,
        Key: key,
        Body: await src.Body!.transformToByteArray(),
        ContentType: src.ContentType,
        CacheControl: src.CacheControl ?? 'public, max-age=31536000, immutable',
      }),
    );
    copied++;
  }
  token = page.NextContinuationToken;
} while (token);

console.log(`Done: ${copied} copied, ${skipped} already present.`);
