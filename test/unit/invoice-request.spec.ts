import { describe, expect, it } from 'vitest';

import { invoiceRequestSchema, prepareInvoice, productUnitPrice, type InvoiceRequest } from '../../src/shared/invoice';
import type { SellerProfile } from '../../src/shared/schema';

const profile = (overrides: Partial<SellerProfile['seller']> = {}): SellerProfile => ({
  seller: {
    name: 'Laden Beispiel',
    address: { line1: 'Hauptstraße 1', postalCode: '10115', city: 'Berlin', countryCode: 'DE' },
    vatId: 'DE123456789',
    contact: { name: 'Lena Laden', phone: '+49 30 123456', email: 'lena@example.com' },
    electronicAddress: { scheme: 'EM', value: 'lena@example.com' },
    ...overrides,
  },
  bank: { iban: 'DE02120300000000202051' },
  pricesIncludeTax: true,
  paymentTermDays: 14,
  invoiceLanguage: 'de',
});

const request = (overrides: Partial<InvoiceRequest> = {}): InvoiceRequest => ({
  number: 'RE-2026-0001',
  issueDate: '2026-11-18',
  deliveryDate: '2026-11-18',
  language: 'de',
  buyer: {
    name: 'Erika Mustermann',
    isBusiness: false,
    address: { line1: 'Heidestraße 17', postalCode: '51147', city: 'Köln', countryCode: 'DE' },
  },
  lines: [{ name: 'Keramiktasse', quantity: '2', unitCode: 'H87', unitPrice: 2490, vat: { code: 'S', rate: '19' } }],
  payment: { method: 'transfer', paid: false },
  ...overrides,
});

describe('prepareInvoice', () => {
  it('builds a conformant invoice with the seller data from the profile and a due date', () => {
    const { model, issues } = prepareInvoice(request(), profile());
    expect(issues).toEqual([]);
    expect(model.seller.name).toBe('Laden Beispiel');
    expect(model.totals!.duePayable).toBe(4980);
    expect(model.payment.dueDate).toBe('2026-12-02');
    expect(model.payment.means).toEqual([{ code: '58', iban: 'DE02120300000000202051', text: 'Überweisung' }]);
  });

  it('needs no due date when paid in cash', () => {
    const { model, issues } = prepareInvoice(request({ payment: { method: 'cash', paid: true } }), profile());
    expect(issues).toEqual([]);
    expect(model.payment.dueDate).toBeUndefined();
    expect(model.totals!.duePayable).toBe(0);
  });

  it('reports a missing IBAN for bank transfers and an empty invoice', () => {
    const p = profile();
    delete p.bank;
    const codes = prepareInvoice(request({ lines: [] }), p).issues.map((i) => i.code);
    expect(codes).toContain('PAYMENT_ACCOUNT_MISSING');
    expect(codes).toContain('EMPTY_INVOICE');
  });

  it('reports seller problems, e.g. BR-CO-26', () => {
    const codes = prepareInvoice(request(), profile({ vatId: undefined, taxNumber: '27/123/45678' })).issues.map((i) => i.code);
    expect(codes).toEqual(['SELLER_IDENTIFIER_MISSING']);
  });

  it('charges no VAT for a small business', () => {
    const { model, issues } = prepareInvoice(
      request(),
      profile({ vatId: undefined, taxNumber: '27/123/45678', identifier: { id: 'DE123456789-00001' }, smallBusiness: true }),
    );
    expect(issues).toEqual([]);
    expect(model.totals!.taxTotal).toBe(0);
    expect(model.totals!.grandTotal).toBe(4980);
  });

  it('validates requests from the renderer', () => {
    expect(invoiceRequestSchema.safeParse(request()).success).toBe(true);
    expect(invoiceRequestSchema.safeParse({ ...request(), lines: [{ ...request().lines[0], unitPrice: 1.5 }] }).success).toBe(false);
  });
});

describe('productUnitPrice', () => {
  const product = { id: '00000000-0000-4000-8000-000000000000', name: 'X', unitCode: 'H87', vat: { code: 'S' as const, rate: '19' } };
  it('converts between gross and net', () => {
    expect(productUnitPrice({ ...product, price: 1190, priceIncludesTax: true }, false, false)).toBe(1000);
    expect(productUnitPrice({ ...product, price: 1000, priceIncludesTax: false }, true, false)).toBe(1190);
    expect(productUnitPrice({ ...product, price: 1190, priceIncludesTax: true }, true, false)).toBe(1190);
  });
  it('keeps the price for small businesses', () => {
    expect(productUnitPrice({ ...product, price: 1190, priceIncludesTax: true }, false, true)).toBe(1190);
  });
});
