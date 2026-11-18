import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { JsonFile, NewerFileVersionError } from '../../src/main/store/json-file';
import { MasterDataStore, type NewCustomer, type NewProduct } from '../../src/main/store';
import type { SellerProfile } from '../../src/shared/schema';

let dir: string;
beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'e-invoice-store-'));
});
afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

const profile: SellerProfile = {
  seller: {
    name: 'Töpferei Beispiel',
    address: { line1: 'Am Markt 3', postalCode: '04109', city: 'Leipzig', countryCode: 'DE' },
    taxNumber: '231/456/78901',
    identifier: { id: 'DE123456789-00001' },
    contact: { name: 'Jana Beispiel', phone: '+49 341 987654', email: 'jana@example.com' },
    electronicAddress: { scheme: 'EM', value: 'jana@example.com' },
    smallBusiness: true,
  },
  bank: { iban: 'DE02120300000000202051' },
  pricesIncludeTax: true,
  paymentTermDays: 14,
  invoiceLanguage: 'de',
};

const customer: NewCustomer = {
  buyer: {
    name: 'Erika Mustermann',
    isBusiness: false,
    address: { line1: 'Heidestraße 17', postalCode: '51147', city: 'Köln', countryCode: 'DE' },
  },
};

const product: NewProduct = { name: 'Keramiktasse', unitCode: 'H87', price: 2400, priceIncludesTax: true, vat: { code: 'S', rate: '19' } };

describe('MasterDataStore', () => {
  it('starts empty with default settings', async () => {
    const store = new MasterDataStore(dir);
    expect(await store.seller.read()).toBeNull();
    expect(await store.customers.read()).toEqual([]);
    expect((await store.settings.read()).numbering.pattern).toBe('RE-{YYYY}-{NNNN}');
  });

  it('persists the seller profile, customers and products across instances', async () => {
    const a = new MasterDataStore(dir);
    await a.seller.write(profile);
    const c = await a.saveCustomer(customer);
    const p = await a.saveProduct(product);
    expect(c.id).toMatch(/^[0-9a-f-]{36}$/);

    const b = new MasterDataStore(dir);
    expect(await b.seller.read()).toEqual(profile);
    expect(await b.customers.read()).toEqual([c]);
    expect(await b.products.read()).toEqual([p]);
    const file = JSON.parse(await fs.readFile(path.join(dir, 'customers.json'), 'utf8'));
    expect(file.schemaVersion).toBe(1);
  });

  it('updates and deletes by id', async () => {
    const store = new MasterDataStore(dir);
    const c = await store.saveCustomer(customer);
    await store.saveCustomer({ ...c, number: 'K-1' });
    expect(await store.customers.read()).toEqual([{ ...c, number: 'K-1' }]);
    await store.deleteCustomer(c.id);
    expect(await store.customers.read()).toEqual([]);
  });

  it('drops blank optional texts', async () => {
    const store = new MasterDataStore(dir);
    await store.saveCustomer({ ...customer, number: '   ', notes: '' });
    const [stored] = await new MasterDataStore(dir).customers.read();
    expect(stored).not.toHaveProperty('number');
    expect(stored).not.toHaveProperty('notes');
  });

  it('keeps concurrent saves', async () => {
    const store = new MasterDataStore(dir);
    await Promise.all(Array.from({ length: 20 }, (_, i) => store.saveProduct({ ...product, name: `P${i}` })));
    expect(await new MasterDataStore(dir).products.read()).toHaveLength(20);
  });

  it('rejects invalid data without writing', async () => {
    const store = new MasterDataStore(dir);
    await expect(store.saveProduct({ ...product, price: 1.5 })).rejects.toThrow();
    await expect(
      store.saveCustomer({ ...customer, buyer: { ...customer.buyer, address: { ...customer.buyer.address, countryCode: 'de' } } }),
    ).rejects.toThrow();
    await expect(fs.access(path.join(dir, 'products.json'))).rejects.toThrow();
  });

  it('suggests numbers and advances the counter only for the suggested one', async () => {
    const store = new MasterDataStore(dir);
    expect(await store.suggestNumber('2026-11-18')).toBe('RE-2026-0001');
    await store.numberUsed('2026-11-18', 'RE-2026-0001');
    await store.numberUsed('2026-11-18', 'EIGENE-7');
    expect(await new MasterDataStore(dir).suggestNumber('2026-11-19')).toBe('RE-2026-0002');
  });

  it('moves an unreadable file aside and reports it', async () => {
    await fs.writeFile(path.join(dir, 'customers.json'), '{ broken');
    const store = new MasterDataStore(dir);
    expect(await store.customers.read()).toEqual([]);
    expect(store.warnings[0]).toMatch(/customers\.json: not valid JSON.*moved to customers\.corrupt-/);
    const files = await fs.readdir(dir);
    expect(files.some((f) => f.startsWith('customers.corrupt-'))).toBe(true);
  });

  it('moves a file with invalid data aside', async () => {
    await fs.writeFile(path.join(dir, 'products.json'), JSON.stringify({ schemaVersion: 1, data: [{ name: 'no id' }] }));
    const store = new MasterDataStore(dir);
    expect(await store.products.read()).toEqual([]);
    expect(store.warnings[0]).toMatch(/products\.json: invalid data/);
  });

  it('leaves no temp files behind', async () => {
    const store = new MasterDataStore(dir);
    await store.seller.write(profile);
    await store.saveProduct(product);
    expect((await fs.readdir(dir)).filter((f) => f.endsWith('.tmp'))).toEqual([]);
  });
});

describe('JsonFile', () => {
  it('migrates old schema versions on read', async () => {
    const file = path.join(dir, 'x.json');
    await fs.writeFile(file, JSON.stringify({ schemaVersion: 1, data: { n: 1 } }));
    const json = new JsonFile(file, {
      schema: z.object({ count: z.number() }),
      version: 2,
      migrations: { 1: (d) => ({ count: (d as { n: number }).n }) },
      fallback: () => ({ count: 0 }),
    });
    expect(await json.read()).toEqual({ count: 1 });
  });

  it('never overwrites a file of a newer app version', async () => {
    const file = path.join(dir, 'x.json');
    await fs.writeFile(file, JSON.stringify({ schemaVersion: 9, data: {} }));
    const json = new JsonFile(file, { schema: z.object({}), version: 1, fallback: () => ({}) });
    await expect(json.read()).rejects.toThrow(NewerFileVersionError);
    expect(JSON.parse(await fs.readFile(file, 'utf8')).schemaVersion).toBe(9);
  });
});
