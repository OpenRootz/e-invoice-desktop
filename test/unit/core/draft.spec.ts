import { describe, expect, it } from 'vitest';

import { buildInvoice, checkModel, InvoiceDraft, multiply, sum } from '../../../src/core';
import { VAT_19, VAT_7 } from '../../fixtures/model-builders';

function draft(overrides: Partial<InvoiceDraft> = {}): InvoiceDraft {
  return {
    number: 'RE-2026-0001',
    issueDate: '2026-11-18',
    deliveryDate: '2026-11-18',
    language: 'de',
    pricesIncludeTax: true,
    seller: {
      name: 'Laden Beispiel',
      address: { line1: 'Hauptstraße 1', postalCode: '10115', city: 'Berlin', countryCode: 'DE' },
      vatId: 'DE123456789',
      contact: { name: 'Lena Laden', phone: '+49 30 123456', email: 'lena@example.com' },
      electronicAddress: { scheme: 'EM', value: 'lena@example.com' },
    },
    buyer: {
      name: 'Erika Mustermann',
      isBusiness: false,
      address: { line1: 'Heidestraße 17', postalCode: '51147', city: 'Köln', countryCode: 'DE' },
    },
    lines: [
      { name: 'Notizbuch A5', quantity: '3', unitCode: 'H87', unitPrice: 399, vat: VAT_19 },
      { name: 'Fachbuch', quantity: '1', unitCode: 'H87', unitPrice: 2490, vat: VAT_7 },
    ],
    shipping: { amount: 490, vat: VAT_19 },
    payment: { means: [{ code: '58', iban: 'DE02120300000000202051' }], terms: 'Zahlbar innerhalb von 14 Tagen.', paid: false },
    ...overrides,
  };
}

/** BT-131 = quantity × BT-146 − allowances + charges, for every line */
function lineInvariantHolds(model: ReturnType<typeof buildInvoice>) {
  return model.lines.every(
    (l) =>
      multiply(l.netUnitPrice, l.quantity) - sum(l.allowances.map((a) => a.amount)) + sum(l.charges.map((c) => c.amount)) === l.netAmount,
  );
}

describe('buildInvoice', () => {
  it('turns gross prices into a model whose total is the sum of the entered gross amounts', () => {
    const m = buildInvoice(draft());
    // 3 × 3.99 + 24.90 + 4.90 = 41.77
    expect(m.totals!.grandTotal).toBe(4177);
    expect(m.totals!.roundingAmount).toBe(0);
    expect(m.totals!.duePayable).toBe(4177);
    expect(m.totals!.taxCalculation).toBe('en16931');
    expect(lineInvariantHolds(m)).toBe(true);
    expect(m.meta).toEqual({ pricesIncludeTax: true, priceDisplay: 'gross' });
    expect(m.lines[0].display).toEqual({ grossUnitPrice: 399, grossAmount: 1197 });
    expect(m.charges[0]).toMatchObject({ amount: 412, itemTaxAmount: 78, reason: 'Versand', reasonCode: 'FC' });
    expect(checkModel(m, ['zugferd'])).toEqual([]);
  });

  it('rounds the tax per line and books the unit price rounding as a hidden allowance or charge', () => {
    const m = buildInvoice(
      draft({ lines: [{ name: 'Stift', quantity: '7', unitCode: 'H87', unitPrice: 99, vat: VAT_19 }], shipping: undefined }),
    );
    // 7 × 0.99 = 6.93 gross; tax 1.11; net 5.82; net unit price 0.83 → 7 × 0.83 = 5.81 → +0.01 rounding charge
    expect(m.lines[0]).toMatchObject({ netUnitPrice: 83, netAmount: 582, itemTaxAmount: 111 });
    expect(m.lines[0].charges).toEqual([{ amount: 1, reason: 'Rundungsdifferenz', rounding: true }]);
    expect(m.totals!.grandTotal).toBe(693);
    expect(checkModel(m, ['zugferd'])).toEqual([]);
  });

  it('keeps the total exact when the per-line taxes fall back to the EN 16931 calculation', () => {
    const lines = Array.from({ length: 250 }, (_, i) => ({
      name: `Artikel ${i}`,
      quantity: '1',
      unitCode: 'H87',
      unitPrice: 99,
      vat: VAT_19,
    }));
    const m = buildInvoice(draft({ lines, shipping: undefined }));
    expect(m.totals!.taxCalculation).toBe('en16931');
    expect(m.totals!.grandTotal + m.totals!.roundingAmount).toBe(250 * 99);
    expect(m.totals!.duePayable).toBe(250 * 99);
    expect(checkModel(m, ['zugferd'])).toEqual([]);
  });

  it('applies a gross line discount', () => {
    const m = buildInvoice(
      draft({
        lines: [
          { name: 'Tasse', quantity: '2', unitCode: 'H87', unitPrice: 1190, discount: { amount: 238, reason: 'Rabatt 10 %' }, vat: VAT_19 },
        ],
        shipping: undefined,
      }),
    );
    // 23.80 − 2.38 = 21.42 gross; net 18.00
    expect(m.lines[0]).toMatchObject({ netUnitPrice: 1000, netAmount: 1800 });
    expect(m.lines[0].allowances).toEqual([{ amount: 200, reason: 'Rabatt 10 %' }]);
    expect(m.totals!.grandTotal).toBe(2142);
    expect(lineInvariantHolds(m)).toBe(true);
  });

  it('takes net prices as they are and shows net prices to business buyers', () => {
    const m = buildInvoice(
      draft({
        pricesIncludeTax: false,
        buyer: { ...draft().buyer, name: 'Kunde GmbH', isBusiness: true, vatId: 'DE987654321' },
        lines: [{ name: 'Beratung', quantity: '2.5', unitCode: 'HUR', unitPrice: 8000, vat: VAT_19 }],
        shipping: undefined,
      }),
    );
    expect(m.lines[0]).toMatchObject({ netUnitPrice: 8000, netAmount: 20000 });
    expect(m.lines[0].itemTaxAmount).toBeUndefined();
    expect(m.meta.priceDisplay).toBe('net');
    expect(m.totals!.taxTotal).toBe(3800);
    expect(m.totals!.grandTotal).toBe(23800);
  });

  it('charges no VAT for small businesses, also when prices are entered as gross', () => {
    const m = buildInvoice(
      draft({
        seller: {
          ...draft().seller,
          vatId: undefined,
          taxNumber: '231/456/78901',
          identifier: { id: 'DE123456789-00001' },
          smallBusiness: true,
        },
      }),
    );
    expect(m.totals!.taxTotal).toBe(0);
    // the entered prices are the final amounts
    expect(m.totals!.grandTotal).toBe(4177);
    expect([...m.lines.map((l) => l.vat), ...m.charges.map((c) => c.vat)].every((v) => v?.code === 'E')).toBe(true);
    expect(checkModel(m, ['zugferd'])).toEqual([]);
  });

  it('books a paid invoice as prepaid, without payment terms', () => {
    const m = buildInvoice(draft({ payment: { means: [{ code: '10', text: 'Bar' }], terms: 'Zahlbar sofort', paid: true } }));
    expect(m.payment.prepaidAmount).toBe(4177);
    expect(m.payment.terms).toBeUndefined();
    expect(m.totals!.duePayable).toBe(0);
    expect(checkModel(m, ['zugferd'])).toEqual([]);
  });
});
