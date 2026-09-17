import { DeleteCommand, GetCommand, PutCommand, ScanCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import type { Db } from '../db/client';
import { badRequest, conflict, notFound } from '../errors';
import type { Category, CategoryCreateInput, CategoryUpdateInput } from '../schemas/category';
import { newId, nowIso, slugify } from '../util';

export class CategoriesRepository {
  constructor(private readonly db: Db) {}

  private get table() {
    return this.db.tables.categories;
  }

  async list(): Promise<Category[]> {
    const items: Category[] = [];
    let startKey: Record<string, unknown> | undefined;
    do {
      const res = await this.db.doc.send(new ScanCommand({ TableName: this.table, ExclusiveStartKey: startKey }));
      items.push(...((res.Items ?? []) as Category[]));
      startKey = res.LastEvaluatedKey;
    } while (startKey);
    return items.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
  }

  async get(id: string): Promise<Category | undefined> {
    const res = await this.db.doc.send(new GetCommand({ TableName: this.table, Key: { id }, ConsistentRead: true }));
    return res.Item as Category | undefined;
  }

  async getBySlug(slug: string): Promise<Category | undefined> {
    return (await this.list()).find((c) => c.slug === slug);
  }

  async create(input: CategoryCreateInput): Promise<Category> {
    const all = await this.list();
    const slug = input.slug ?? slugify(input.name);
    if (all.some((c) => c.slug === slug)) throw conflict(`Category slug "${slug}" already exists`);
    if (input.parentId && !all.some((c) => c.id === input.parentId)) throw badRequest('Parent category not found');
    const now = nowIso();
    const category: Category = {
      id: newId(),
      slug,
      name: input.name,
      ...(input.description ? { description: input.description } : {}),
      ...(input.parentId ? { parentId: input.parentId } : {}),
      ...(input.imageKey ? { imageKey: input.imageKey } : {}),
      sortOrder: input.sortOrder ?? all.length,
      isActive: input.isActive ?? true,
      createdAt: now,
      updatedAt: now,
    };
    await this.db.doc.send(
      new PutCommand({ TableName: this.table, Item: category, ConditionExpression: 'attribute_not_exists(id)' }),
    );
    return category;
  }

  async update(id: string, patch: CategoryUpdateInput): Promise<Category> {
    const all = await this.list();
    const existing = all.find((c) => c.id === id);
    if (!existing) throw notFound('Category');
    if (patch.slug && patch.slug !== existing.slug && all.some((c) => c.slug === patch.slug)) {
      throw conflict(`Category slug "${patch.slug}" already exists`);
    }
    if (patch.parentId) {
      if (patch.parentId === id) throw badRequest('A category cannot be its own parent');
      if (!all.some((c) => c.id === patch.parentId)) throw badRequest('Parent category not found');
      // Prevent cycles: walk up from the new parent.
      let cursor = all.find((c) => c.id === patch.parentId);
      while (cursor?.parentId) {
        if (cursor.parentId === id) throw badRequest('That would create a category loop');
        cursor = all.find((c) => c.id === cursor?.parentId);
      }
    }
    const next: Record<string, unknown> = { ...existing };
    for (const [key, value] of Object.entries(patch)) {
      if (value === null || value === '') delete next[key];
      else if (value !== undefined) next[key] = value;
    }
    next.updatedAt = nowIso();
    await this.db.doc.send(new PutCommand({ TableName: this.table, Item: next }));
    return next as unknown as Category;
  }

  async delete(id: string): Promise<void> {
    const all = await this.list();
    if (!all.some((c) => c.id === id)) throw notFound('Category');
    if (all.some((c) => c.parentId === id)) throw conflict('Move or delete the sub-categories first');
    await this.db.doc.send(new DeleteCommand({ TableName: this.table, Key: { id } }));
  }

  async reorder(ids: string[]): Promise<void> {
    const now = nowIso();
    await Promise.all(
      ids.map((id, index) =>
        this.db.doc.send(
          new UpdateCommand({
            TableName: this.table,
            Key: { id },
            UpdateExpression: 'SET sortOrder = :i, updatedAt = :now',
            ConditionExpression: 'attribute_exists(id)',
            ExpressionAttributeValues: { ':i': index, ':now': now },
          }),
        ).catch(() => undefined),
      ),
    );
  }
}

/** Returns the category plus all of its descendants' ids. */
export function descendantIds(categories: Category[], rootId: string): string[] {
  const out = [rootId];
  for (let i = 0; i < out.length; i++) {
    for (const c of categories) if (c.parentId === out[i] && !out.includes(c.id)) out.push(c.id);
  }
  return out;
}
