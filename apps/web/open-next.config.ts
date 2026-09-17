import type { OpenNextConfig } from '@opennextjs/aws/types/open-next.js';

/**
 * Lean OpenNext setup for AWS Lambda + CloudFront:
 * - ISR/fetch cache in S3 (lite client, no extra SDK weight)
 * - revalidation through a FIFO SQS queue
 * - no DynamoDB tag cache (the app doesn't use revalidateTag/revalidatePath)
 * - no image optimization Lambda (images are served directly from the media CDN)
 */
const config = {
  default: {
    override: {
      wrapper: 'aws-lambda',
      converter: 'aws-apigw-v2',
      incrementalCache: 's3-lite',
      tagCache: 'dummy',
      queue: 'sqs-lite',
    },
  },
  dangerous: {
    disableTagCache: true,
  },
} satisfies OpenNextConfig;

export default config;
