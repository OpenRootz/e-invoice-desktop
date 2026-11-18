import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { defaultLayout, type PdfLayoutV2 } from '../../src/core';
import { InvoiceService } from '../../src/main/invoice/service';
import { LayoutService } from '../../src/main/layout/service';
import { MasterDataStore } from '../../src/main/store';
import type { SellerProfile } from '../../src/shared/schema';

let dir: string;
let store: MasterDataStore;
beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'e-invoice-layout-'));
  store = new MasterDataStore(dir);
});
afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

const profile: SellerProfile = {
  seller: {
    name: 'Töpferei Beispiel',
    address: { line1: 'Am Markt 3', postalCode: '04109', city: 'Leipzig', countryCode: 'DE' },
    taxNumber: '231/456/78901',
    identifier: { id: 'DE123456789-00001' },
    contact: { name: 'Jana Beispiel', phone: '+49 341 987654', email: 'jana@example.com' },
    electronicAddress: { scheme: 'EM', value: 'rechnung@example.com' },
    smallBusiness: true,
  },
  bank: { iban: 'DE02120300000000202051' },
  pricesIncludeTax: true,
  paymentTermDays: 14,
  invoiceLanguage: 'de',
};

const withImage = (): PdfLayoutV2 => {
  const layout = defaultLayout();
  layout.blocks.push({
    key: 'image1',
    type: 'image',
    visible: true,
    pages: 'first',
    overflow: 'fixed',
    frame: { x: 1500, y: 300, w: 300, h: 150 },
    props: { assetId: 'stamp' },
  });
  return layout;
};

describe('LayoutService', () => {
  it('returns the default layout until one is saved', async () => {
    const { document, images } = await new LayoutService(store).current();
    expect(document).toEqual(defaultLayout());
    expect(images).toEqual({});
  });

  it('previews a draft with the user’s seller data and measured blocks', async () => {
    await store.seller.write(profile);
    const result = await new LayoutService(store).preview({ document: defaultLayout(), images: {}, sample: 'many-lines', language: 'de' });
    expect(result.pdf!.length).toBeGreaterThan(1000);
    expect(result.pageCount).toBeGreaterThan(1);
    expect(result.blocks.some((b) => b.key === 'lines' && b.page === 2)).toBe(true);
    expect(result.layoutIssues.filter((i) => i.level === 'error')).toEqual([]);
    expect(result.issues).toEqual([]);
  });

  it('uses placeholder seller data without a profile and says so', async () => {
    const result = await new LayoutService(store).preview({ document: defaultLayout(), images: {}, sample: 'b2b-net', language: 'en' });
    expect(result.pdf).toBeDefined();
    expect(result.issues.map((i) => i.code)).toEqual(['SAMPLE_SELLER']);
  });

  it('rejects a structurally invalid document without rendering', async () => {
    const result = await new LayoutService(store).preview({ document: { version: 1 }, images: {}, sample: 'b2b-net', language: 'de' });
    expect(result.pdf).toBeUndefined();
    expect(result.layoutIssues[0].level).toBe('error');
  });

  it('refuses to save a layout that hides mandatory content (§ 14 UStG)', async () => {
    await store.seller.write(profile);
    const layout = defaultLayout();
    for (const b of layout.blocks) if (b.type === 'totals') b.visible = false;
    const result = await new LayoutService(store).save({ document: layout, images: {} });
    expect(result.status).toBe('invalid');
    expect(await new LayoutService(store).current()).toMatchObject({ document: defaultLayout() });
  });

  it('saves a layout with an image block and keeps only used images', async () => {
    await store.seller.write(profile);
    const service = new LayoutService(store);
    expect(await service.save({ document: withImage(), images: { stamp: PNG, unused: PNG } })).toEqual({ status: 'saved' });
    const current = await service.current();
    expect(current.document.blocks.some((b) => b.key === 'image1')).toBe(true);
    expect(current.images).toEqual({ stamp: PNG });
  });

  it('requires the image of a visible image block', async () => {
    const result = await new LayoutService(store).save({ document: withImage(), images: {} });
    expect(result).toEqual({ status: 'invalid', issues: [expect.objectContaining({ code: 'IMAGE_MISSING', blockKey: 'image1' })] });
  });

  it('renders invoices with the saved layout and its images', async () => {
    await store.seller.write(profile);
    await new LayoutService(store).save({ document: withImage(), images: { stamp: PNG } });
    const file = path.join(dir, 'r.pdf');
    const result = await new InvoiceService(store).write(
      {
        number: 'RE-1',
        issueDate: '2026-11-18',
        language: 'de',
        buyer: {
          name: 'Erika Mustermann',
          isBusiness: false,
          address: { line1: 'Heidestraße 17', postalCode: '51147', city: 'Köln', countryCode: 'DE' },
        },
        lines: [{ name: 'Tasse', quantity: '1', unitCode: 'H87', unitPrice: 2490, vat: { code: 'S', rate: '19' } }],
        payment: { method: 'cash', paid: true },
      },
      file,
    );
    expect(result.status).toBe('saved');
    // the PNG is embedded as an image XObject
    expect((await fs.readFile(file)).includes(Buffer.from('/Subtype /Image'))).toBe(true);
  });

  it('offers the presets', () => {
    const din = new LayoutService(store).preset('din5008B');
    expect(din.version).toBe(2);
    expect(din).not.toEqual(defaultLayout());
  });
});
