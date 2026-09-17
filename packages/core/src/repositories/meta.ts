import { GetCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import type { Db } from '../db/client';
import { istDateKey, nowIso } from '../util';

export interface AdminUserRecord {
  pk: string;
  email: string;
  name: string;
  passwordHash: string;
  createdAt: string;
}

export const metaKeys = {
  productSlug: (slug: string) => `SLUG#PRODUCT#${slug}`,
  orderCounter: (dateKey: string) => `COUNTER#ORDER#${dateKey}`,
  idempotency: (key: string) => `IDEMPOTENCY#${key}`,
  adminUser: (email: string) => `ADMIN#${email.toLowerCase()}`,
};

const IDEMPOTENCY_TTL_SECONDS = 24 * 60 * 60;

export class MetaRepository {
  constructor(private readonly db: Db) {}

  /** Atomic per-day counter → GNJ-YYMMDD-0001. */
  async nextOrderNumber(now = new Date()): Promise<string> {
    const dateKey = istDateKey(now);
    const res = await this.db.doc.send(
      new UpdateCommand({
        TableName: this.db.tables.meta,
        Key: { pk: metaKeys.orderCounter(dateKey) },
        UpdateExpression: 'ADD #seq :one SET #expiresAt = if_not_exists(#expiresAt, :exp)',
        ExpressionAttributeNames: { '#seq': 'seq', '#expiresAt': 'expiresAt' },
        ExpressionAttributeValues: { ':one': 1, ':exp': Math.floor(now.getTime() / 1000) + 3 * 24 * 3600 },
        ReturnValues: 'UPDATED_NEW',
      }),
    );
    const seq = Number(res.Attributes?.seq ?? 0);
    return `GNJ-${dateKey}-${String(seq).padStart(4, '0')}`;
  }

  async getIdempotentOrderNumber(key: string): Promise<string | undefined> {
    const res = await this.db.doc.send(
      new GetCommand({
        TableName: this.db.tables.meta,
        Key: { pk: metaKeys.idempotency(key) },
        ConsistentRead: true,
      }),
    );
    return res.Item?.orderNumber as string | undefined;
  }

  idempotencyPutItem(key: string, orderNumber: string) {
    return {
      Put: {
        TableName: this.db.tables.meta,
        Item: {
          pk: metaKeys.idempotency(key),
          orderNumber,
          createdAt: nowIso(),
          expiresAt: Math.floor(Date.now() / 1000) + IDEMPOTENCY_TTL_SECONDS,
        },
        ConditionExpression: 'attribute_not_exists(pk)',
      },
    };
  }

  async getAdminUser(email: string): Promise<AdminUserRecord | undefined> {
    const res = await this.db.doc.send(
      new GetCommand({ TableName: this.db.tables.meta, Key: { pk: metaKeys.adminUser(email) }, ConsistentRead: true }),
    );
    return res.Item as AdminUserRecord | undefined;
  }

  /** Creates or replaces a local-mode admin user. */
  async putAdminUser(user: { email: string; name: string; passwordHash: string }): Promise<void> {
    await this.db.doc.send(
      new PutCommand({
        TableName: this.db.tables.meta,
        Item: {
          pk: metaKeys.adminUser(user.email),
          email: user.email.toLowerCase(),
          name: user.name,
          passwordHash: user.passwordHash,
          createdAt: nowIso(),
        } satisfies AdminUserRecord,
      }),
    );
  }

  async productIdForSlug(slug: string): Promise<string | undefined> {
    const res = await this.db.doc.send(
      new GetCommand({ TableName: this.db.tables.meta, Key: { pk: metaKeys.productSlug(slug) }, ConsistentRead: true }),
    );
    return res.Item?.productId as string | undefined;
  }
}
