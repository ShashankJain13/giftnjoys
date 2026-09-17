import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { createPresignedPost } from '@aws-sdk/s3-presigned-post';

export type BucketKind = 'media' | 'imports';

export interface StorageConfig {
  region: string;
  mediaBucket: string;
  importsBucket: string;
  /** Public base URL for media objects (CloudFront domain in AWS, MinIO bucket URL locally). */
  mediaBaseUrl: string;
  /** Set only for MinIO / S3-compatible local endpoints. */
  endpoint?: string;
  credentials?: { accessKeyId: string; secretAccessKey: string };
}

export interface PresignedUpload {
  url: string;
  fields: Record<string, string>;
  key: string;
  maxBytes: number;
}

export class S3Storage {
  readonly client: S3Client;

  constructor(private readonly config: StorageConfig) {
    this.client = new S3Client({
      region: config.region,
      ...(config.endpoint ? { endpoint: config.endpoint, forcePathStyle: true } : {}),
      ...(config.credentials ? { credentials: config.credentials } : {}),
    });
  }

  bucket(kind: BucketKind): string {
    return kind === 'media' ? this.config.mediaBucket : this.config.importsBucket;
  }

  publicUrl(key: string): string {
    return `${this.config.mediaBaseUrl.replace(/\/$/, '')}/${key}`;
  }

  /** Browser uploads go straight to S3 with a size- and type-restricted POST policy. */
  async presignPost(input: {
    bucket: BucketKind;
    key: string;
    contentType: string;
    maxBytes: number;
    expiresSeconds?: number;
  }): Promise<PresignedUpload> {
    const { url, fields } = await createPresignedPost(this.client, {
      Bucket: this.bucket(input.bucket),
      Key: input.key,
      Conditions: [
        ['content-length-range', 1, input.maxBytes],
        ['eq', '$Content-Type', input.contentType],
      ],
      Fields: { 'Content-Type': input.contentType },
      Expires: input.expiresSeconds ?? 600,
    });
    return { url, fields, key: input.key, maxBytes: input.maxBytes };
  }

  async putObject(
    bucket: BucketKind,
    key: string,
    body: Uint8Array,
    contentType: string,
    cacheControl = 'public, max-age=31536000, immutable',
  ): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket(bucket),
        Key: key,
        Body: body,
        ContentType: contentType,
        CacheControl: cacheControl,
      }),
    );
  }

  async getObject(bucket: BucketKind, key: string): Promise<Uint8Array> {
    const res = await this.client.send(new GetObjectCommand({ Bucket: this.bucket(bucket), Key: key }));
    if (!res.Body) throw new Error(`Empty object: ${key}`);
    return res.Body.transformToByteArray();
  }

  async headObject(bucket: BucketKind, key: string): Promise<{ size: number; contentType?: string } | undefined> {
    try {
      const res = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket(bucket), Key: key }));
      return { size: res.ContentLength ?? 0, contentType: res.ContentType };
    } catch (err) {
      const status = (err as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
      if (status === 404) return undefined;
      throw err;
    }
  }

  async deleteObject(bucket: BucketKind, key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket(bucket), Key: key }));
  }
}
