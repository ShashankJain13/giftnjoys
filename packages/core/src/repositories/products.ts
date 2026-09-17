import {
  BatchGetCommand,
  type BatchGetCommandOutput,
  GetCommand,
  PutCommand,
  QueryCommand,
  TransactWriteCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import type { Db } from '../db/client';
import { cancellationCodes, isConditionalCheckFailed, isTransactionCanceled } from '../db/errors';
import { GSI } from '../db/table-definitions';
import { badRequest, conflict, notFound } from '../errors';
import {
  publishProblems,
  type Product,
  type ProductCreateInput,
  type ProductSource,
  type ProductStatus,
  type ProductUpdateInput,
} from '../schemas/product';
import { chunk, decodeCursor, encodeCursor, generateSku, newId, nowIso, slugify } from '../util';
import { metaKeys } from './meta';

export interface Page<T> {
  items: T[];
  cursor?: string;
}

export interface ImportedFields {
  source?: ProductSource;
  importJobId?: string;
  sourceHash?: string;
  parseConfidence?: number;
  parseWarnings?: string[];
  rawSourceText?: string;
}

/** Removes null/undefined so optional attributes (and sparse GSI keys) are simply absent. */
function compact<T extends object>(obj: T): T {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== null && v !== undefined)) as T;
}

export class ProductsRepository {
  constructor(private readonly db: Db) {}

  private get table() {
    return this.db.tables.products;
  }

  async get(id: string): Promise<Product | undefined> {
    const res = await this.db.doc.send(new GetCommand({ TableName: this.table, Key: { id }, ConsistentRead: true }));
    return res.Item as Product | undefined;
  }

  async require(id: string): Promise<Product> {
    const product = await this.get(id);
    if (!product) throw notFound('Product');
    return product;
  }

  async getBySlug(slug: string): Promise<Product | undefined> {
    const res = await this.db.doc.send(
      new GetCommand({ TableName: this.db.tables.meta, Key: { pk: metaKeys.productSlug(slug) } }),
    );
    const id = res.Item?.productId as string | undefined;
    return id ? this.get(id) : undefined;
  }

  async getMany(ids: string[]): Promise<Product[]> {
    const unique = [...new Set(ids)];
    const out: Product[] = [];
    for (const batch of chunk(unique, 100)) {
      let keys: Array<Record<string, unknown>> | undefined = batch.map((id) => ({ id }));
      for (let attempt = 0; keys && keys.length > 0 && attempt < 5; attempt++) {
        const res: BatchGetCommandOutput = await this.db.doc.send(
          new BatchGetCommand({ RequestItems: { [this.table]: { Keys: keys, ConsistentRead: true } } }),
        );
        out.push(...((res.Responses?.[this.table] ?? []) as Product[]));
        keys = res.UnprocessedKeys?.[this.table]?.Keys;
        if (keys?.length) await new Promise((r) => setTimeout(r, 50 * 2 ** attempt));
      }
    }
    return out;
  }

  async listByStatus(status: ProductStatus, opts: { limit?: number; cursor?: string } = {}): Promise<Page<Product>> {
    const res = await this.db.doc.send(
      new QueryCommand({
        TableName: this.table,
        IndexName: GSI.productsByStatus,
        KeyConditionExpression: '#status = :status',
        ExpressionAttributeNames: { '#status': 'status' },
        ExpressionAttributeValues: { ':status': status },
        ScanIndexForward: false,
        Limit: Math.min(opts.limit ?? 50, 200),
        ExclusiveStartKey: decodeCursor(opts.cursor),
      }),
    );
    return { items: (res.Items ?? []) as Product[], cursor: encodeCursor(res.LastEvaluatedKey) };
  }

  async listAllByStatus(status: ProductStatus): Promise<Product[]> {
    const items: Product[] = [];
    let cursor: string | undefined;
    do {
      const page = await this.listByStatus(status, { limit: 200, cursor });
      items.push(...page.items);
      cursor = page.cursor;
    } while (cursor);
    return items;
  }

  async countByStatus(status: ProductStatus): Promise<number> {
    let count = 0;
    let startKey: Record<string, unknown> | undefined;
    do {
      const res = await this.db.doc.send(
        new QueryCommand({
          TableName: this.table,
          IndexName: GSI.productsByStatus,
          KeyConditionExpression: '#status = :status',
          ExpressionAttributeNames: { '#status': 'status' },
          ExpressionAttributeValues: { ':status': status },
          Select: 'COUNT',
          ExclusiveStartKey: startKey,
        }),
      );
      count += res.Count ?? 0;
      startKey = res.LastEvaluatedKey;
    } while (startKey);
    return count;
  }

  async listByImportJob(importJobId: string): Promise<Product[]> {
    const items: Product[] = [];
    let startKey: Record<string, unknown> | undefined;
    do {
      const res = await this.db.doc.send(
        new QueryCommand({
          TableName: this.table,
          IndexName: GSI.productsByImportJob,
          KeyConditionExpression: 'importJobId = :job',
          ExpressionAttributeValues: { ':job': importJobId },
          ExclusiveStartKey: startKey,
        }),
      );
      items.push(...((res.Items ?? []) as Product[]));
      startKey = res.LastEvaluatedKey;
    } while (startKey);
    return items;
  }

  async existsBySourceHash(sourceHash: string): Promise<boolean> {
    const res = await this.db.doc.send(
      new QueryCommand({
        TableName: this.table,
        IndexName: GSI.productsBySourceHash,
        KeyConditionExpression: 'sourceHash = :h',
        ExpressionAttributeValues: { ':h': sourceHash },
        Limit: 1,
      }),
    );
    return (res.Count ?? 0) > 0;
  }

  async create(input: ProductCreateInput, imported: ImportedFields = {}): Promise<Product> {
    const now = nowIso();
    const id = newId();
    const product: Product = compact({
      id,
      slug: '',
      name: input.name,
      description: input.description ?? '',
      categoryId: input.categoryId ?? undefined,
      price: input.price,
      mrp: input.mrp ?? undefined,
      stockQty: input.stockQty ?? 0,
      // Every product gets a visible, unique code even if the admin never sets one, so it's easy
      // to reference (e.g. when spotting possible duplicates from a WhatsApp import).
      sku: input.sku ?? generateSku(id),
      moq: input.moq ?? undefined,
      color: input.color ?? undefined,
      size: input.size ?? undefined,
      style: input.style ?? undefined,
      images: input.images ?? [],
      videos: input.videos ?? [],
      tags: input.tags ?? [],
      occasions: input.occasions ?? [],
      isFeatured: input.isFeatured ?? false,
      isBestseller: input.isBestseller ?? false,
      status: 'DRAFT' as const,
      source: imported.source ?? 'MANUAL',
      importJobId: imported.importJobId,
      sourceHash: imported.sourceHash,
      parseConfidence: imported.parseConfidence,
      parseWarnings: imported.parseWarnings,
      rawSourceText: imported.rawSourceText,
      createdAt: now,
      updatedAt: now,
    });
    if (product.mrp !== undefined && product.mrp < product.price) {
      throw badRequest('MRP must be greater than or equal to price');
    }

    const explicit = Boolean(input.slug);
    const base = input.slug ?? slugify(input.name);
    const candidates = explicit
      ? [base]
      : [base, `${base}-2`, `${base}-3`, `${base}-4`, `${base}-${product.id.slice(-6).toLowerCase()}`];

    for (const slug of candidates) {
      product.slug = slug;
      try {
        await this.db.doc.send(
          new TransactWriteCommand({
            TransactItems: [
              {
                Put: {
                  TableName: this.db.tables.meta,
                  Item: { pk: metaKeys.productSlug(slug), productId: product.id },
                  ConditionExpression: 'attribute_not_exists(pk)',
                },
              },
              { Put: { TableName: this.table, Item: product, ConditionExpression: 'attribute_not_exists(id)' } },
            ],
          }),
        );
        return product;
      } catch (err) {
        if (isTransactionCanceled(err) && cancellationCodes(err)[0] === 'ConditionalCheckFailed') {
          if (explicit) throw conflict(`The URL slug "${slug}" is already used by another product`);
          continue;
        }
        throw err;
      }
    }
    throw conflict('Could not allocate a unique slug, please set one manually');
  }

  async update(id: string, patch: ProductUpdateInput): Promise<Product> {
    const existing = await this.require(id);
    const next: Product = { ...existing };
    for (const [key, value] of Object.entries(patch)) {
      if (key === 'slug') continue;
      if (value === null) delete (next as unknown as Record<string, unknown>)[key];
      else if (value !== undefined) (next as unknown as Record<string, unknown>)[key] = value;
    }
    if (next.mrp !== undefined && next.mrp < next.price) throw badRequest('MRP must be greater than or equal to price');
    if (next.status === 'PUBLISHED') {
      const problems = publishProblems(next);
      if (problems.length) throw badRequest(problems.join('. '));
    }
    next.updatedAt = nowIso();

    const newSlug = patch.slug && patch.slug !== existing.slug ? patch.slug : undefined;
    const putProduct = {
      Put: {
        TableName: this.table,
        Item: compact({ ...next, slug: newSlug ?? existing.slug }),
        ConditionExpression: 'updatedAt = :prev',
        ExpressionAttributeValues: { ':prev': existing.updatedAt },
      },
    };

    try {
      if (!newSlug) {
        await this.db.doc.send(new PutCommand(putProduct.Put));
      } else {
        await this.db.doc.send(
          new TransactWriteCommand({
            TransactItems: [
              putProduct,
              {
                Put: {
                  TableName: this.db.tables.meta,
                  Item: { pk: metaKeys.productSlug(newSlug), productId: id },
                  ConditionExpression: 'attribute_not_exists(pk)',
                },
              },
              { Delete: { TableName: this.db.tables.meta, Key: { pk: metaKeys.productSlug(existing.slug) } } },
            ],
          }),
        );
      }
    } catch (err) {
      if (isConditionalCheckFailed(err)) throw conflict('This product was changed by someone else. Reload and try again.');
      if (isTransactionCanceled(err)) {
        const codes = cancellationCodes(err);
        if (codes[1] === 'ConditionalCheckFailed') throw conflict(`The URL slug "${newSlug}" is already in use`);
        throw conflict('This product was changed by someone else. Reload and try again.');
      }
      throw err;
    }
    return (await this.get(id)) as Product;
  }

  async setStatus(id: string, status: ProductStatus): Promise<Product> {
    const existing = await this.require(id);
    if (existing.status === status) return existing;
    if (status === 'PUBLISHED') {
      const problems = publishProblems(existing);
      if (problems.length) throw badRequest(`Cannot publish "${existing.name}": ${problems.join('. ')}`);
    }
    const now = nowIso();
    try {
      const res = await this.db.doc.send(
        new UpdateCommand({
          TableName: this.table,
          Key: { id },
          UpdateExpression:
            status === 'PUBLISHED'
              ? 'SET #status = :status, updatedAt = :now, publishedAt = if_not_exists(publishedAt, :now)'
              : 'SET #status = :status, updatedAt = :now',
          ConditionExpression: 'attribute_exists(id)',
          ExpressionAttributeNames: { '#status': 'status' },
          ExpressionAttributeValues: { ':status': status, ':now': now },
          ReturnValues: 'ALL_NEW',
        }),
      );
      return res.Attributes as Product;
    } catch (err) {
      if (isConditionalCheckFailed(err)) throw notFound('Product');
      throw err;
    }
  }

  async adjustStock(id: string, change: { set?: number; delta?: number }): Promise<Product> {
    const now = nowIso();
    try {
      const res = await this.db.doc.send(
        new UpdateCommand({
          TableName: this.table,
          Key: { id },
          UpdateExpression:
            change.set !== undefined ? 'SET stockQty = :v, updatedAt = :now' : 'SET stockQty = stockQty + :v, updatedAt = :now',
          ConditionExpression:
            change.set !== undefined ? 'attribute_exists(id)' : 'attribute_exists(id) AND stockQty >= :min',
          ExpressionAttributeValues: {
            ':v': change.set ?? change.delta ?? 0,
            ':now': now,
            ...(change.set === undefined ? { ':min': Math.max(0, -(change.delta ?? 0)) } : {}),
          },
          ReturnValues: 'ALL_NEW',
        }),
      );
      return res.Attributes as Product;
    } catch (err) {
      if (isConditionalCheckFailed(err)) {
        const exists = await this.get(id);
        throw exists ? badRequest('Stock cannot go below 0') : notFound('Product');
      }
      throw err;
    }
  }

  /** Transaction item: deduct stock, failing if the product is missing or has too little. */
  stockDecrementItem(id: string, qty: number, at: string) {
    return {
      Update: {
        TableName: this.table,
        Key: { id },
        UpdateExpression: 'SET stockQty = stockQty - :q, updatedAt = :now',
        ConditionExpression: 'attribute_exists(id) AND stockQty >= :q',
        ExpressionAttributeValues: { ':q': qty, ':now': at },
      },
    };
  }

  /** Transaction item: return stock to an existing product. */
  stockIncrementItem(id: string, qty: number, at: string) {
    return {
      Update: {
        TableName: this.table,
        Key: { id },
        UpdateExpression: 'SET stockQty = stockQty + :q, updatedAt = :now',
        ConditionExpression: 'attribute_exists(id)',
        ExpressionAttributeValues: { ':q': qty, ':now': at },
      },
    };
  }

  async delete(id: string): Promise<void> {
    const existing = await this.require(id);
    await this.db.doc.send(
      new TransactWriteCommand({
        TransactItems: [
          { Delete: { TableName: this.table, Key: { id } } },
          { Delete: { TableName: this.db.tables.meta, Key: { pk: metaKeys.productSlug(existing.slug) } } },
        ],
      }),
    );
  }
}
