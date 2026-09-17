import { GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import type { Db } from '../db/client';
import { SETTINGS_SCHEMAS, type SettingsKey, type SettingsMap } from '../schemas/settings';
import { nowIso } from '../util';

export class SettingsRepository {
  constructor(private readonly db: Db) {}

  /** Returns stored settings merged over schema defaults (never throws on stale shapes). */
  async get<K extends SettingsKey>(key: K): Promise<SettingsMap[K]> {
    const res = await this.db.doc.send(new GetCommand({ TableName: this.db.tables.settings, Key: { key } }));
    const schema = SETTINGS_SCHEMAS[key];
    const stored = (res.Item?.value ?? {}) as Record<string, unknown>;
    const parsed = schema.safeParse(stored);
    if (parsed.success) return parsed.data as SettingsMap[K];
    // Keep whichever stored fields are still valid, fall back to defaults for the rest.
    const defaults = schema.parse({}) as Record<string, unknown>;
    const merged: Record<string, unknown> = { ...defaults };
    for (const [field, value] of Object.entries(stored)) {
      const attempt = schema.safeParse({ ...defaults, [field]: value });
      if (attempt.success) merged[field] = (attempt.data as Record<string, unknown>)[field];
    }
    return merged as SettingsMap[K];
  }

  async put<K extends SettingsKey>(key: K, value: unknown): Promise<SettingsMap[K]> {
    const parsed = SETTINGS_SCHEMAS[key].parse(value) as SettingsMap[K];
    await this.db.doc.send(
      new PutCommand({ TableName: this.db.tables.settings, Item: { key, value: parsed, updatedAt: nowIso() } }),
    );
    return parsed;
  }
}
