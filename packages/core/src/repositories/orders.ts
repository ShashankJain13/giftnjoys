import { GetCommand, QueryCommand, TransactWriteCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import type { TransactWriteCommandInput } from '@aws-sdk/lib-dynamodb';
import type { Db } from '../db/client';
import { GSI } from '../db/table-definitions';
import { notFound } from '../errors';
import type { Order, OrderStatus, OrderStatusChange } from '../schemas/order';
import { decodeCursor, encodeCursor, nowIso } from '../util';
import type { Page } from './products';

export type TransactItem = NonNullable<TransactWriteCommandInput['TransactItems']>[number];

export class OrdersRepository {
  constructor(private readonly db: Db) {}

  get table() {
    return this.db.tables.orders;
  }

  async get(orderNumber: string): Promise<Order | undefined> {
    const res = await this.db.doc.send(
      new GetCommand({ TableName: this.table, Key: { orderNumber }, ConsistentRead: true }),
    );
    return res.Item as Order | undefined;
  }

  async require(orderNumber: string): Promise<Order> {
    const order = await this.get(orderNumber);
    if (!order) throw notFound('Order');
    return order;
  }

  /** Writes a new order, optionally together with other items (e.g. idempotency marker) atomically. */
  async create(order: Order, extra: TransactItem[] = []): Promise<void> {
    await this.db.doc.send(
      new TransactWriteCommand({
        TransactItems: [
          { Put: { TableName: this.table, Item: order, ConditionExpression: 'attribute_not_exists(orderNumber)' } },
          ...extra,
        ],
      }),
    );
  }

  async listByStatus(status: OrderStatus, opts: { limit?: number; cursor?: string } = {}): Promise<Page<Order>> {
    const res = await this.db.doc.send(
      new QueryCommand({
        TableName: this.table,
        IndexName: GSI.ordersByStatus,
        KeyConditionExpression: '#status = :status',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: { ':status': status },
        ScanIndexForward: false,
        Limit: Math.min(opts.limit ?? 50, 200),
        ExclusiveStartKey: decodeCursor(opts.cursor),
      }),
    );
    return { items: (res.Items ?? []) as Order[], cursor: encodeCursor(res.LastEvaluatedKey) };
  }

  async listByPhone(phone: string, limit = 20): Promise<Order[]> {
    const res = await this.db.doc.send(
      new QueryCommand({
        TableName: this.table,
        IndexName: GSI.ordersByPhone,
        KeyConditionExpression: 'customerPhone = :p',
        ExpressionAttributeValues: { ':p': phone },
        ScanIndexForward: false,
        Limit: limit,
      }),
    );
    return (res.Items ?? []) as Order[];
  }

  async listByAccount(accountId: string, limit = 20): Promise<Order[]> {
    const res = await this.db.doc.send(
      new QueryCommand({
        TableName: this.table,
        IndexName: GSI.ordersByAccount,
        KeyConditionExpression: 'accountId = :a',
        ExpressionAttributeValues: { ':a': accountId },
        ScanIndexForward: false,
        Limit: limit,
      }),
    );
    return (res.Items ?? []) as Order[];
  }

  async countByStatus(status: OrderStatus, sinceIso?: string): Promise<number> {
    let count = 0;
    let startKey: Record<string, unknown> | undefined;
    do {
      const res = await this.db.doc.send(
        new QueryCommand({
          TableName: this.table,
          IndexName: GSI.ordersByStatus,
          KeyConditionExpression: sinceIso ? '#status = :status AND createdAt >= :since' : '#status = :status',
          ExpressionAttributeNames: { '#status': 'status' },
          ExpressionAttributeValues: { ':status': status, ...(sinceIso ? { ':since': sinceIso } : {}) },
          Select: 'COUNT',
          ExclusiveStartKey: startKey,
        }),
      );
      count += res.Count ?? 0;
      startKey = res.LastEvaluatedKey;
    } while (startKey);
    return count;
  }

  /**
   * Builds the transaction item that moves an order from its current status to `change.to`,
   * guarded by a condition on the status we read (optimistic concurrency).
   */
  transitionItem(order: Order, change: OrderStatusChange, extra: Record<string, unknown> = {}): TransactItem {
    const names: Record<string, string> = { '#status': 'status', '#updatedAt': 'updatedAt', '#history': 'statusHistory' };
    const values: Record<string, unknown> = {
      ':from': order.status,
      ':to': change.to,
      ':now': change.at,
      ':change': [change],
    };
    const sets = ['#status = :to', '#updatedAt = :now', '#history = list_append(#history, :change)'];
    Object.entries(extra)
      .filter(([, v]) => v !== undefined)
      .forEach(([key, value], i) => {
        names[`#x${i}`] = key;
        values[`:x${i}`] = value;
        sets.push(`#x${i} = :x${i}`);
      });
    return {
      Update: {
        TableName: this.table,
        Key: { orderNumber: order.orderNumber },
        UpdateExpression: `SET ${sets.join(', ')}`,
        ConditionExpression: '#status = :from',
        ExpressionAttributeNames: names,
        ExpressionAttributeValues: values,
      },
    };
  }

  async transact(items: TransactItem[]): Promise<void> {
    await this.db.doc.send(new TransactWriteCommand({ TransactItems: items }));
  }

  async updateNotes(orderNumber: string, adminNotes: string): Promise<Order> {
    const res = await this.db.doc.send(
      new UpdateCommand({
        TableName: this.table,
        Key: { orderNumber },
        UpdateExpression: 'SET adminNotes = :n, updatedAt = :now',
        ConditionExpression: 'attribute_exists(orderNumber)',
        ExpressionAttributeValues: { ':n': adminNotes, ':now': nowIso() },
        ReturnValues: 'ALL_NEW',
      }),
    ).catch((err: unknown) => {
      if ((err as { name?: string }).name === 'ConditionalCheckFailedException') throw notFound('Order');
      throw err;
    });
    return res.Attributes as Order;
  }
}
