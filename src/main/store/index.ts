import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { z } from 'zod';

import { advanceNumbering, suggestInvoiceNumber } from '../../shared/numbering';
import {
  customerSchema,
  DEFAULT_SETTINGS,
  productSchema,
  sellerProfileSchema,
  settingsSchema,
  type Customer,
  type Product,
  type SellerProfile,
  type Settings,
} from '../../shared/schema';
import type { NewCustomer, NewProduct } from '../../shared/api';
import { JsonFile } from './json-file';

export type { NewCustomer, NewProduct };

/**
 * The app's master data: seller profile, customers, products and settings, one JSON file each in `dir`.
 * Issued invoices are not stored.
 */
export class MasterDataStore {
  /** Messages about files that were unreadable and moved aside, for the UI */
  readonly warnings: string[] = [];

  readonly seller: JsonFile<SellerProfile | null>;
  readonly customers: JsonFile<Customer[]>;
  readonly products: JsonFile<Product[]>;
  readonly settings: JsonFile<Settings>;

  constructor(readonly dir: string) {
    const onRecovered = (m: string) => this.warnings.push(m);
    this.seller = new JsonFile(path.join(dir, 'seller.json'), {
      schema: sellerProfileSchema.nullable(),
      version: 1,
      fallback: () => null,
      onRecovered,
    });
    this.customers = new JsonFile(path.join(dir, 'customers.json'), {
      schema: z.array(customerSchema),
      version: 1,
      fallback: () => [],
      onRecovered,
    });
    this.products = new JsonFile(path.join(dir, 'products.json'), {
      schema: z.array(productSchema),
      version: 1,
      fallback: () => [],
      onRecovered,
    });
    this.settings = new JsonFile(path.join(dir, 'settings.json'), {
      schema: settingsSchema,
      version: 1,
      fallback: () => structuredClone(DEFAULT_SETTINGS),
      onRecovered,
    });
  }

  async saveCustomer(input: NewCustomer): Promise<Customer> {
    return upsert(this.customers, customerSchema.parse({ ...input, id: input.id ?? randomUUID() }));
  }

  deleteCustomer(id: string): Promise<void> {
    return remove(this.customers, id);
  }

  async saveProduct(input: NewProduct): Promise<Product> {
    return upsert(this.products, productSchema.parse({ ...input, id: input.id ?? randomUUID() }));
  }

  deleteProduct(id: string): Promise<void> {
    return remove(this.products, id);
  }

  async suggestNumber(issueDate: string): Promise<string> {
    return suggestInvoiceNumber((await this.settings.read()).numbering, issueDate);
  }

  /** After a PDF was written: advance the counter if the suggested number was used. */
  async numberUsed(issueDate: string, number: string): Promise<void> {
    await this.settings.update((s) => ({ ...s, numbering: advanceNumbering(s.numbering, issueDate, number) }));
  }
}

async function upsert<T extends { id: string }>(file: JsonFile<T[]>, item: T): Promise<T> {
  await file.update((items) => {
    const index = items.findIndex((i) => i.id === item.id);
    return index < 0 ? [...items, item] : items.map((i, n) => (n === index ? item : i));
  });
  return item;
}

async function remove<T extends { id: string }>(file: JsonFile<T[]>, id: string): Promise<void> {
  await file.update((items) => items.filter((i) => i.id !== id));
}
