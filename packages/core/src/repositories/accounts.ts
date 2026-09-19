import { GetCommand, PutCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import type { Db } from '../db/client';
import { GSI } from '../db/table-definitions';
import { notFound } from '../errors';
import type { Account, OAuthUpsertInput, SavedAddress } from '../schemas/account';
import { newId, nowIso } from '../util';

/** Removes undefined so optional attributes are simply absent. */
function compact<T extends object>(obj: T): T {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as T;
}

export class AccountsRepository {
  constructor(private readonly db: Db) {}

  private get table() {
    return this.db.tables.accounts;
  }

  async get(id: string): Promise<Account | undefined> {
    const res = await this.db.doc.send(new GetCommand({ TableName: this.table, Key: { id } }));
    return res.Item as Account | undefined;
  }

  async findByEmail(email: string): Promise<Account | undefined> {
    const res = await this.db.doc.send(
      new QueryCommand({
        TableName: this.table,
        IndexName: GSI.accountsByEmail,
        KeyConditionExpression: 'email = :email',
        ExpressionAttributeValues: { ':email': email.trim().toLowerCase() },
        Limit: 1,
      }),
    );
    return res.Items?.[0] as Account | undefined;
  }

  /** Creates the account on first sign-in, or refreshes name/avatar/provider on return visits. */
  async upsertByEmail(input: OAuthUpsertInput): Promise<Account> {
    const email = input.email.trim().toLowerCase();
    const existing = await this.findByEmail(email);
    const now = nowIso();
    const account: Account = compact({
      id: existing?.id ?? newId(),
      email,
      name: input.name,
      avatarUrl: input.avatarUrl,
      provider: input.provider,
      savedAddress: existing?.savedAddress,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    });
    await this.db.doc.send(new PutCommand({ TableName: this.table, Item: account }));
    return account;
  }

  async updateSavedAddress(id: string, savedAddress: SavedAddress): Promise<Account> {
    const res = await this.db.doc.send(
      new UpdateCommand({
        TableName: this.table,
        Key: { id },
        UpdateExpression: 'SET savedAddress = :addr, updatedAt = :now',
        ConditionExpression: 'attribute_exists(id)',
        ExpressionAttributeValues: { ':addr': savedAddress, ':now': nowIso() },
        ReturnValues: 'ALL_NEW',
      }),
    ).catch((err: unknown) => {
      if ((err as { name?: string }).name === 'ConditionalCheckFailedException') throw notFound('Account');
      throw err;
    });
    return res.Attributes as Account;
  }
}
