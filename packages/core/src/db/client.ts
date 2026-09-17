import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

export interface TableNames {
  products: string;
  categories: string;
  orders: string;
  importJobs: string;
  settings: string;
  meta: string;
}

export interface Db {
  doc: DynamoDBDocumentClient;
  tables: TableNames;
}

export interface DbConfig {
  region: string;
  /** e.g. gnj-local, gnj-dev, gnj-prod */
  tablePrefix: string;
  /** Set only for DynamoDB Local. */
  endpoint?: string;
  credentials?: { accessKeyId: string; secretAccessKey: string };
}

export function tableNames(prefix: string): TableNames {
  return {
    products: `${prefix}-products`,
    categories: `${prefix}-categories`,
    orders: `${prefix}-orders`,
    importJobs: `${prefix}-import-jobs`,
    settings: `${prefix}-settings`,
    meta: `${prefix}-meta`,
  };
}

export function createDb(config: DbConfig): Db {
  const client = new DynamoDBClient({
    region: config.region,
    ...(config.endpoint ? { endpoint: config.endpoint } : {}),
    ...(config.credentials ? { credentials: config.credentials } : {}),
  });
  const doc = DynamoDBDocumentClient.from(client, {
    marshallOptions: { removeUndefinedValues: true },
  });
  return { doc, tables: tableNames(config.tablePrefix) };
}
