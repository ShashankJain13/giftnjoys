import type { CreateTableCommandInput } from '@aws-sdk/client-dynamodb';
import type { TableNames } from './client';

/**
 * Source of truth for table/GSI shapes. Used by the local setup script;
 * infra/terraform/modules/dynamodb-tables mirrors these definitions.
 */
export const GSI = {
  productsByStatus: 'byStatus',
  productsByImportJob: 'byImportJob',
  productsBySourceHash: 'bySourceHash',
  ordersByStatus: 'byStatus',
  ordersByPhone: 'byPhone',
  ordersByAccount: 'byAccount',
  importJobsByCreatedAt: 'byCreatedAt',
  accountsByEmail: 'byEmail',
} as const;

const S = 'S' as const;

const gsi = (name: string, hash: string, range?: string) => ({
  IndexName: name,
  KeySchema: [
    { AttributeName: hash, KeyType: 'HASH' as const },
    ...(range ? [{ AttributeName: range, KeyType: 'RANGE' as const }] : []),
  ],
  Projection: { ProjectionType: 'ALL' as const },
});

export function tableDefinitions(t: TableNames): CreateTableCommandInput[] {
  return [
    {
      TableName: t.products,
      BillingMode: 'PAY_PER_REQUEST',
      KeySchema: [{ AttributeName: 'id', KeyType: 'HASH' }],
      AttributeDefinitions: ['id', 'status', 'updatedAt', 'importJobId', 'createdAt', 'sourceHash'].map((n) => ({
        AttributeName: n,
        AttributeType: S,
      })),
      GlobalSecondaryIndexes: [
        gsi(GSI.productsByStatus, 'status', 'updatedAt'),
        gsi(GSI.productsByImportJob, 'importJobId', 'createdAt'),
        gsi(GSI.productsBySourceHash, 'sourceHash'),
      ],
    },
    {
      TableName: t.categories,
      BillingMode: 'PAY_PER_REQUEST',
      KeySchema: [{ AttributeName: 'id', KeyType: 'HASH' }],
      AttributeDefinitions: [{ AttributeName: 'id', AttributeType: S }],
    },
    {
      TableName: t.orders,
      BillingMode: 'PAY_PER_REQUEST',
      KeySchema: [{ AttributeName: 'orderNumber', KeyType: 'HASH' }],
      AttributeDefinitions: ['orderNumber', 'status', 'createdAt', 'customerPhone', 'accountId'].map((n) => ({
        AttributeName: n,
        AttributeType: S,
      })),
      GlobalSecondaryIndexes: [
        gsi(GSI.ordersByStatus, 'status', 'createdAt'),
        gsi(GSI.ordersByPhone, 'customerPhone', 'createdAt'),
        gsi(GSI.ordersByAccount, 'accountId', 'createdAt'),
      ],
    },
    {
      TableName: t.importJobs,
      BillingMode: 'PAY_PER_REQUEST',
      KeySchema: [{ AttributeName: 'id', KeyType: 'HASH' }],
      AttributeDefinitions: ['id', 'kind', 'createdAt'].map((n) => ({ AttributeName: n, AttributeType: S })),
      GlobalSecondaryIndexes: [gsi(GSI.importJobsByCreatedAt, 'kind', 'createdAt')],
    },
    {
      TableName: t.settings,
      BillingMode: 'PAY_PER_REQUEST',
      KeySchema: [{ AttributeName: 'key', KeyType: 'HASH' }],
      AttributeDefinitions: [{ AttributeName: 'key', AttributeType: S }],
    },
    {
      // Counters, idempotency markers, slug reservations, local admin users. TTL attribute: expiresAt
      TableName: t.meta,
      BillingMode: 'PAY_PER_REQUEST',
      KeySchema: [{ AttributeName: 'pk', KeyType: 'HASH' }],
      AttributeDefinitions: [{ AttributeName: 'pk', AttributeType: S }],
    },
    {
      // Storefront shopper accounts (Google/Facebook sign-in). Separate from admin users (meta table).
      TableName: t.accounts,
      BillingMode: 'PAY_PER_REQUEST',
      KeySchema: [{ AttributeName: 'id', KeyType: 'HASH' }],
      AttributeDefinitions: ['id', 'email'].map((n) => ({ AttributeName: n, AttributeType: S })),
      GlobalSecondaryIndexes: [gsi(GSI.accountsByEmail, 'email')],
    },
  ];
}
