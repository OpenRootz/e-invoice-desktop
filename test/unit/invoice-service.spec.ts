import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { invoiceFileName, InvoiceService } from '../../src/main/invoice/service';
import { MasterDataStore } from '../../src/main/store';
import type { InvoiceRequest } from '../../src/shared/invoice';
import type { SellerProfile } from '../../src/shared/schema';
import { extractFacturX } from '../pdf-utils';

/** PDFs written here are validated with Mustang and veraPDF (`pnpm validate test/__output__/app`). */
const OUT = path.join(__dirname, '../__output__/app');

let dir: string;
let store: MasterDataStore;
beforeAll(async () => {
  await fs.mkdir(OUT, { recursive: true });
});
beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'e-invoice-service-'));
  store = new MasterDataStore(dir);
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
    electronicAddress: { scheme: 'EM', value: 'rechnung@example.com' },
    smallBusiness: true,
  },
  bank: { iban: 'DE02120300000000202051' },
  logo: `data:image/svg+xml;base64,${Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="120" height="40"><rect width="120" height="40" fill="#1a5fb4"/></svg>').toString('base64')}`,
  pricesIncludeTax: true,
  paymentTermDays: 14,
  paymentTerms: 'Zahlbar innerhalb von 14 Tagen ohne Abzug.',
  invoiceLanguage: 'de',
};

const request: InvoiceRequest = {
  number: 'RE-2026-0001',
  issueDate: '2026-11-18',
  deliveryDate: '2026-11-18',
  language: 'de',
  buyer: {
    name: 'Erika Mustermann',
    isBusiness: false,
    address: { line1: 'Heidestraße 17', postalCode: '51147', city: 'Köln', countryCode: 'DE' },
  },
  lines: [
    { name: 'Keramiktasse handgemacht', quantity: '2', unitCode: 'H87', unitPrice: 2490, vat: { code: 'S', rate: '19' } },
    { name: 'Töpferkurs', quantity: '1.5', unitCode: 'HUR', unitPrice: 4500, vat: { code: 'S', rate: '19' } },
  ],
  shipping: { amount: 590, vat: { code: 'S', rate: '19' } },
  payment: { method: 'transfer', paid: false },
};

describe('InvoiceService', () => {
  it('writes a ZUGFeRD PDF with the embedded XML and advances the number', async () => {
    await store.seller.write(profile);
    const service = new InvoiceService(store);
    const file = path.join(dir, 'out', invoiceFileName(request.number));
    expect(await service.write(request, file)).toEqual({ status: 'saved', filePath: file });

    const pdf = await fs.readFile(file);
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    const xml = extractFacturX(pdf);
    expect(xml).toContain('<ram:ID>RE-2026-0001</ram:ID>');
    expect(xml).toContain('Gemäß § 19 UStG wird keine Umsatzsteuer berechnet.');
    expect(xml).toContain('<ram:GrandTotalAmount>123.20</ram:GrandTotalAmount>');
    expect(await store.suggestNumber('2026-11-19')).toBe('RE-2026-0002');
    expect((await store.settings.read()).lastOutputDir).toBe(path.dirname(file));

    await fs.copyFile(file, path.join(OUT, 'app-small-business.pdf'));
  });

  it('writes nothing while there are issues', async () => {
    await store.seller.write({ ...profile, seller: { ...profile.seller, identifier: undefined } });
    const file = path.join(dir, 'x.pdf');
    const result = await new InvoiceService(store).write(request, file);
    expect(result.status).toBe('invalid');
    expect(result.status === 'invalid' && result.issues.map((i) => i.code)).toEqual(['SELLER_IDENTIFIER_MISSING']);
    await expect(fs.access(file)).rejects.toThrow();
    expect(await store.suggestNumber('2026-11-19')).toBe('RE-2026-0001');
  });

  it('asks for the seller profile first', async () => {
    const result = await new InvoiceService(store).write(request, path.join(dir, 'x.pdf'));
    expect(result).toEqual({ status: 'invalid', issues: [expect.objectContaining({ code: 'SELLER_PROFILE_MISSING' })] });
  });

  it('renders a preview even with issues', async () => {
    await store.seller.write({ ...profile, seller: { ...profile.seller, identifier: undefined } });
    const { pdf, issues } = await new InvoiceService(store).preview(request);
    expect(pdf!.length).toBeGreaterThan(1000);
    expect(issues).toHaveLength(1);
  });

  it('writes a standard VAT invoice for a business buyer', async () => {
    await store.seller.write({
      ...profile,
      seller: { ...profile.seller, smallBusiness: undefined, vatId: 'DE123456789' },
      pricesIncludeTax: false,
    });
    const file = path.join(dir, 'b2b.pdf');
    const b2b: InvoiceRequest = {
      ...request,
      buyer: {
        name: 'Beispiel Handel GmbH',
        isBusiness: true,
        vatId: 'DE987654321',
        address: { line1: 'Kundenweg 7', postalCode: '80331', city: 'München', countryCode: 'DE' },
      },
      lines: [
        { ...request.lines[0], vat: { code: 'S', rate: '19' } },
        { ...request.lines[1], vat: { code: 'S', rate: '7' } },
      ],
    };
    expect((await new InvoiceService(store).write(b2b, file)).status).toBe('saved');
    await fs.copyFile(file, path.join(OUT, 'app-b2b-net.pdf'));
  });
});

describe('invoiceFileName', () => {
  it('replaces characters Windows does not allow', () => {
    expect(invoiceFileName('RE/2026:01')).toBe('RE_2026_01.pdf');
    expect(invoiceFileName('RE-1. ')).toBe('RE-1.pdf');
  });
});
