import { GetCommand, PutCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import type { Db } from '../db/client';
import { GSI } from '../db/table-definitions';
import { notFound } from '../errors';
import type { ImportJob } from '../schemas/import-job';
import { newId, nowIso } from '../util';

export class ImportJobsRepository {
  constructor(private readonly db: Db) {}

  private get table() {
    return this.db.tables.importJobs;
  }

  async create(input: { filename: string; s3Key: string; createdBy: string }): Promise<ImportJob> {
    const now = nowIso();
    const job: ImportJob = {
      id: newId(),
      kind: 'IMPORT',
      filename: input.filename,
      s3Key: input.s3Key,
      status: 'QUEUED',
      createdBy: input.createdBy,
      createdAt: now,
      updatedAt: now,
    };
    await this.db.doc.send(new PutCommand({ TableName: this.table, Item: job }));
    return job;
  }

  async get(id: string): Promise<ImportJob | undefined> {
    const res = await this.db.doc.send(new GetCommand({ TableName: this.table, Key: { id }, ConsistentRead: true }));
    return res.Item as ImportJob | undefined;
  }

  async require(id: string): Promise<ImportJob> {
    const job = await this.get(id);
    if (!job) throw notFound('Import job');
    return job;
  }

  async list(limit = 50): Promise<ImportJob[]> {
    const res = await this.db.doc.send(
      new QueryCommand({
        TableName: this.table,
        IndexName: GSI.importJobsByCreatedAt,
        KeyConditionExpression: 'kind = :kind',
        ExpressionAttributeValues: { ':kind': 'IMPORT' },
        ScanIndexForward: false,
        Limit: limit,
      }),
    );
    return (res.Items ?? []) as ImportJob[];
  }

  async update(id: string, patch: Partial<Omit<ImportJob, 'id' | 'kind' | 'createdAt'>>): Promise<void> {
    const fields = { ...patch, updatedAt: nowIso() };
    const entries = Object.entries(fields).filter(([, v]) => v !== undefined);
    await this.db.doc.send(
      new UpdateCommand({
        TableName: this.table,
        Key: { id },
        UpdateExpression: `SET ${entries.map((_, i) => `#f${i} = :v${i}`).join(', ')}`,
        ExpressionAttributeNames: Object.fromEntries(entries.map(([k], i) => [`#f${i}`, k])),
        ExpressionAttributeValues: Object.fromEntries(entries.map(([, v], i) => [`:v${i}`, v])),
      }),
    );
  }
}
