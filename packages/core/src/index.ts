export * from './errors';
export * from './util';
export * from './format';
export * from './schemas/index';
export * from './pricing';
export * from './orders/state-machine';
export * from './whatsapp';
export * from './db/client';
export * from './db/errors';
export * from './db/table-definitions';
export * from './repositories/accounts';
export * from './repositories/meta';
export * from './repositories/products';
export * from './repositories/categories';
export * from './repositories/orders';
export * from './repositories/settings';
export * from './repositories/import-jobs';
export * from './services/order-service';

import type { Db } from './db/client';
import { AccountsRepository } from './repositories/accounts';
import { CategoriesRepository } from './repositories/categories';
import { ImportJobsRepository } from './repositories/import-jobs';
import { MetaRepository } from './repositories/meta';
import { OrdersRepository } from './repositories/orders';
import { ProductsRepository } from './repositories/products';
import { SettingsRepository } from './repositories/settings';
import { OrderService } from './services/order-service';

export type Repositories = ReturnType<typeof createRepositories>;

export function createRepositories(db: Db) {
  const products = new ProductsRepository(db);
  const categories = new CategoriesRepository(db);
  const orders = new OrdersRepository(db);
  const settings = new SettingsRepository(db);
  const importJobs = new ImportJobsRepository(db);
  const meta = new MetaRepository(db);
  const accounts = new AccountsRepository(db);
  const orderService = new OrderService({ products, orders, settings, meta });
  return { db, products, categories, orders, settings, importJobs, meta, accounts, orderService };
}
