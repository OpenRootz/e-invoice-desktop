import {
  applySmallBusiness,
  buildCreditNote,
  buildInvoice,
  calculate,
  CreditNoteRequest,
  EInvoiceFormat,
  EInvoiceModel,
  InvoiceLine,
  Money,
  VatCategory,
} from '../../src/core';
import { mappingLabels } from '../../src/core/labels';
import { model, VAT_19, VAT_7 } from './model-builders';

/**
 * Invoice scenarios covering the mapping decisions. Each one is serialized to every format,
 * compared with the golden files in `test/golden/` and validated with KoSIT in CI.
 */
export interface Scenario {
  name: string;
  description: string;
  model: EInvoiceModel;
  /** What the customer was charged (e.g. sum of the gross prices), if relevant */
  expectedTotalWithTax?: Money;
  formats: EInvoiceFormat[];
}

const ALL_FORMATS: EInvoiceFormat[] = ['zugferd', 'xrechnung-cii', 'xrechnung-ubl'];

interface LineInput {
  name: string;
  sku?: string;
  qty?: string;
  price: Money;
  vat?: VatCategory;
  tax?: Money;
  allowance?: { amount: Money; reason: string };
  gtin?: string;
  description?: string;
}

function lines(inputs: LineInput[]): InvoiceLine[] {
  return inputs.map((l, i) => {
    const qty = l.qty ?? '1';
    const gross = l.price * Number(qty);
    return {
      id: String(i + 1),
      name: l.name,
      sellerItemId: l.sku,
      gtin: l.gtin,
      description: l.description,
      quantity: qty,
      unitCode: 'H87',
      netUnitPrice: l.price,
      allowances: l.allowance ? [{ amount: l.allowance.amount, reason: l.allowance.reason }] : [],
      charges: [],
      netAmount: gross - (l.allowance?.amount ?? 0),
      vat: l.vat ?? VAT_19,
      itemTaxAmount: l.tax,
    };
  });
}

function scenario(s: Omit<Scenario, 'formats'> & { formats?: EInvoiceFormat[] }): Scenario {
  s.model.totals = calculate(s.model, { expectedTotalWithTax: s.expectedTotalWithTax });
  return { formats: ALL_FORMATS, ...s };
}

const b2bBuyer = () => ({
  name: 'Beispiel Kunde AG',
  isBusiness: true,
  vatId: 'DE987654321',
  address: { line1: 'Kundenweg 7', postalCode: '80331', city: 'München', countryCode: 'DE' },
  electronicAddress: { scheme: 'EM', value: 'einkauf@example.org' },
  contact: { name: 'Max Einkauf', email: 'einkauf@example.org' },
});

export const scenarios: Scenario[] = [
  scenario({
    name: 'b2b-net',
    description: 'B2B net channel: line allowance, shipping as document charge, SEPA credit transfer with due date',
    expectedTotalWithTax: 3320,
    model: model({
      buyer: b2bBuyer(),
      orderReference: 'PO-4711',
      lines: lines([
        {
          name: 'Bio-Kaffee 500g',
          sku: 'KAF-500',
          gtin: '4012345678901',
          qty: '2',
          price: 1000,
          tax: 342,
          allowance: { amount: 200, reason: 'Promotion: 10 % Herbstrabatt' },
        },
        { name: 'Teefilter (100 Stk.)', sku: 'TF-100', price: 500, tax: 95 },
      ]),
      charges: [{ amount: 490, reason: 'DHL Paket', reasonCode: 'FC', vat: VAT_19, itemTaxAmount: 93 }],
      payment: {
        means: [{ code: '58', iban: 'DE02120300000000202051', bic: 'BYLADEM1001', accountName: 'Demo Shop GmbH' }],
        terms: 'Zahlbar innerhalb von 14 Tagen ohne Abzug.',
        dueDate: '2026-11-23',
        prepaidAmount: 0,
        reference: 'RE-2026-00001',
      },
    }),
  }),

  scenario({
    name: 'b2c-gross-item-tax',
    description: 'B2C gross channel, card payment; VAT = sum of the per-line taxes (default), no rounding amount',
    expectedTotalWithTax: 1497,
    model: model({
      buyer: {
        name: 'Erika Mustermann',
        isBusiness: false,
        address: { line1: 'Hauptstraße 3', postalCode: '50667', city: 'Köln', countryCode: 'DE' },
        electronicAddress: { scheme: 'EM', value: 'erika@example.net' },
      },
      lines: lines([
        { name: 'Notizbuch A5', sku: 'NB-A5', price: 335, tax: 64 },
        { name: 'Kugelschreiber Set', sku: 'KS-3', price: 419, tax: 80 },
        { name: 'Textmarker 4er', sku: 'TM-4', price: 503, tax: 96 },
      ]),
      payment: { means: [{ code: '48', cardLast4: '1234', cardNetwork: 'VISA' }], prepaidAmount: 1497 },
      meta: { pricesIncludeTax: true, priceDisplay: 'gross' },
    }),
  }),

  scenario({
    name: 'b2c-gross-en16931-rounding',
    description: 'Same order with taxCalculation en16931: VAT on the sum plus rounding amount BT-114',
    expectedTotalWithTax: 1497,
    model: model({
      taxCalculation: 'en16931',
      buyer: {
        name: 'Erika Mustermann',
        isBusiness: false,
        address: { line1: 'Hauptstraße 3', postalCode: '50667', city: 'Köln', countryCode: 'DE' },
        electronicAddress: { scheme: 'EM', value: 'erika@example.net' },
      },
      lines: lines([
        { name: 'Notizbuch A5', sku: 'NB-A5', price: 335, tax: 64 },
        { name: 'Kugelschreiber Set', sku: 'KS-3', price: 419, tax: 80 },
        { name: 'Textmarker 4er', sku: 'TM-4', price: 503, tax: 96 },
      ]),
      payment: { means: [{ code: '48', cardLast4: '1234', cardNetwork: 'VISA' }], prepaidAmount: 1497 },
    }),
  }),

  scenario({
    name: 'mixed-rates',
    description: '19 % + 7 % + zero rated, notes, separate delivery address, online payment service',
    model: model({
      buyer: b2bBuyer(),
      notes: ['Vielen Dank für Ihren Einkauf!'],
      delivery: {
        name: 'Beispiel Kunde AG – Lager',
        address: { line1: 'Lagerstraße 12', line2: 'Tor 3', postalCode: '85748', city: 'Garching', countryCode: 'DE' },
      },
      lines: lines([
        { name: 'Bio-Kaffee 500g', sku: 'KAF-500', price: 1000, tax: 190 },
        { name: 'Fachbuch E-Rechnung', sku: 'BOOK-1', price: 1869, vat: VAT_7, tax: 131, description: 'Gebundene Ausgabe' },
        { name: 'Solarmodul 400 W', sku: 'PV-400', price: 18900, vat: { code: 'Z', rate: '0' }, tax: 0 },
      ]),
      charges: [{ amount: 490, reason: 'DHL Paket', reasonCode: 'FC', vat: VAT_19, itemTaxAmount: 93 }],
      payment: { means: [{ code: '68', text: 'PayPal' }], prepaidAmount: 22673 },
    }),
  }),

  scenario({
    name: 'reverse-charge-ae',
    description: 'Service to an EU business customer: reverse charge (AE), SEPA direct debit',
    model: model({
      buyer: {
        name: 'Exemple SARL',
        isBusiness: true,
        vatId: 'FR40303265045',
        address: { line1: '12 Rue de la Paix', postalCode: '75002', city: 'Paris', countryCode: 'FR' },
        electronicAddress: { scheme: 'EM', value: 'compta@example.fr' },
      },
      lines: lines([
        {
          name: 'Beratung E-Rechnung (Stunden)',
          sku: 'CONSULT',
          qty: '3',
          price: 12000,
          vat: {
            code: 'AE',
            rate: '0',
            exemptionReason: 'Steuerschuldnerschaft des Leistungsempfängers',
            exemptionReasonCode: 'VATEX-EU-AE',
          },
          tax: 0,
        },
      ]),
      payment: {
        means: [
          { code: '59', mandateReference: 'MANDATE-0815', creditorId: 'DE98ZZZ09999999999', debtorIban: 'FR7630006000011234567890189' },
        ],
        terms: 'Der Betrag wird am Fälligkeitstag per SEPA-Lastschrift eingezogen.',
        dueDate: '2026-11-16',
        prepaidAmount: 0,
      },
    }),
  }),

  scenario({
    name: 'intra-community-k',
    description: 'Goods delivered to an Austrian business customer: intra-community supply (K)',
    model: model({
      buyer: {
        name: 'Beispiel Handel GmbH',
        isBusiness: true,
        vatId: 'ATU12345678',
        address: { line1: 'Ringstraße 1', postalCode: '1010', city: 'Wien', countryCode: 'AT' },
        electronicAddress: { scheme: 'EM', value: 'buchhaltung@example.at' },
      },
      delivery: {
        name: 'Beispiel Handel GmbH',
        address: { line1: 'Ringstraße 1', postalCode: '1010', city: 'Wien', countryCode: 'AT' },
      },
      lines: lines([
        {
          name: 'Bio-Kaffee 500g',
          sku: 'KAF-500',
          qty: '24',
          price: 1000,
          vat: {
            code: 'K',
            rate: '0',
            exemptionReason: 'Steuerfreie innergemeinschaftliche Lieferung',
            exemptionReasonCode: 'VATEX-EU-IC',
          },
          tax: 0,
        },
      ]),
      payment: { means: [{ code: '58', iban: 'DE02120300000000202051' }], terms: '30 Tage netto', dueDate: '2026-12-09', prepaidAmount: 0 },
    }),
  }),

  scenario({
    name: 'export-g',
    description: 'Export to Switzerland (G)',
    model: model({
      buyer: {
        name: 'Muster AG',
        isBusiness: true,
        address: { line1: 'Bahnhofstrasse 1', postalCode: '8001', city: 'Zürich', countryCode: 'CH' },
        electronicAddress: { scheme: 'EM', value: 'rechnungen@example.ch' },
      },
      lines: lines([
        {
          name: 'Bio-Kaffee 500g',
          sku: 'KAF-500',
          qty: '10',
          price: 1000,
          vat: { code: 'G', rate: '0', exemptionReason: 'Steuerfreie Ausfuhrlieferung', exemptionReasonCode: 'VATEX-EU-G' },
          tax: 0,
        },
      ]),
      payment: { means: [{ code: '58', iban: 'DE02120300000000202051' }], terms: '30 Tage netto', prepaidAmount: 0 },
    }),
  }),

  scenario({
    name: 'credit-note-partial',
    description: 'Partial credit note (381): one returned line plus a goodwill allowance, refunded to the card',
    model: model({
      type: 'credit_note',
      number: 'GS-2026-00001',
      issueDate: '2026-11-20',
      precedingInvoices: [{ number: 'RE-2026-00001', issueDate: '2026-11-09' }],
      buyer: b2bBuyer(),
      lines: lines([{ name: 'Teefilter (100 Stk.)', sku: 'TF-100', price: 500, tax: 95 }]),
      allowances: [{ amount: 300, reason: 'Kulanz', reasonCode: '95', vat: VAT_19 }],
      payment: { means: [{ code: '48', cardLast4: '1234', cardNetwork: 'VISA' }], prepaidAmount: 238 },
    }),
  }),

  scenario({
    name: 'seller-tax-number',
    description: 'Small business with tax number instead of VAT ID, commercial register and legal info',
    model: model({
      seller: {
        name: 'Kleiner Laden UG (haftungsbeschränkt)',
        tradingName: 'Kleiner Laden',
        address: { line1: 'Marktplatz 5', postalCode: '01067', city: 'Dresden', countryCode: 'DE' },
        taxNumber: '201/123/45678',
        legalRegistration: { id: 'HRB 12345' },
        legalInfo: 'Geschäftsführerin: Anna Beispiel · Amtsgericht Dresden HRB 12345',
        contact: { name: 'Anna Beispiel', phone: '+49 351 123456', email: 'anna@example.com' },
        electronicAddress: { scheme: 'EM', value: 'rechnung@example.com' },
      },
      buyer: b2bBuyer(),
      lines: lines([{ name: 'Geschenkbox', sku: 'BOX-1', price: 2521, tax: 479 }]),
      payment: { means: [{ code: '58', iban: 'DE02120300000000202051' }], terms: 'Zahlbar sofort ohne Abzug.', prepaidAmount: 0 },
    }),
  }),

  scenario({
    name: 'small-business-19',
    description: 'Small business (§ 19 UStG): tax number + Wirtschafts-IdNr. (BT-29), every item exempt (E) with the note, consumer buyer',
    model: applySmallBusiness(
      model({
        seller: {
          name: 'Töpferei Beispiel',
          address: { line1: 'Am Markt 3', postalCode: '04109', city: 'Leipzig', countryCode: 'DE' },
          taxNumber: '231/456/78901',
          identifier: { id: 'DE123456789-00001' },
          contact: { name: 'Jana Beispiel', phone: '+49 341 987654', email: 'jana@example.com' },
          electronicAddress: { scheme: 'EM', value: 'jana@example.com' },
        },
        buyer: {
          name: 'Erika Mustermann',
          isBusiness: false,
          address: { line1: 'Heidestraße 17', postalCode: '51147', city: 'Köln', countryCode: 'DE' },
          electronicAddress: { scheme: 'EM', value: 'erika@example.com' },
        },
        lines: lines([
          { name: 'Keramiktasse handgemacht', sku: 'TAS-1', qty: '2', price: 2400 },
          { name: 'Servierschale', sku: 'SCH-2', price: 4500 },
        ]),
        charges: [{ amount: 590, reason: 'Versand', reasonCode: 'FC', vat: VAT_19 }],
        payment: { means: [{ code: '58', iban: 'DE02120300000000202051' }], terms: 'Zahlbar innerhalb von 14 Tagen.', prepaidAmount: 0 },
      }),
      mappingLabels('de').smallBusiness,
    ),
  }),

  scenario({
    name: 'draft-gross-paid',
    description: 'Built from a draft with gross prices: line discount, unit price rounding, shipping, already paid',
    // The app only produces ZUGFeRD; XRechnung would need a buyer reference (BT-10)
    formats: ['zugferd'],
    model: buildInvoice({
      number: 'RE-2026-0042',
      issueDate: '2026-11-18',
      deliveryDate: '2026-11-17',
      language: 'de',
      pricesIncludeTax: true,
      seller: {
        name: 'Laden Beispiel e.K.',
        address: { line1: 'Hauptstraße 1', postalCode: '10115', city: 'Berlin', countryCode: 'DE' },
        vatId: 'DE123456789',
        taxNumber: '27/123/45678',
        contact: { name: 'Lena Laden', phone: '+49 30 123456', email: 'lena@example.com' },
        electronicAddress: { scheme: 'EM', value: 'lena@example.com' },
      },
      buyer: {
        name: 'Erika Mustermann',
        isBusiness: false,
        address: { line1: 'Heidestraße 17', postalCode: '51147', city: 'Köln', countryCode: 'DE' },
        electronicAddress: { scheme: 'EM', value: 'erika@example.com' },
      },
      lines: [
        { name: 'Kugelschreiber', sellerItemId: 'KS-1', quantity: '7', unitCode: 'H87', unitPrice: 99, vat: VAT_19 },
        {
          name: 'Keramiktasse',
          sellerItemId: 'TAS-1',
          quantity: '2',
          unitCode: 'H87',
          unitPrice: 1190,
          discount: { amount: 238, reason: 'Rabatt 10 %' },
          vat: VAT_19,
        },
        { name: 'Kochbuch', sellerItemId: 'BUCH-1', quantity: '1', unitCode: 'H87', unitPrice: 2490, vat: VAT_7 },
      ],
      shipping: { amount: 490, vat: VAT_19 },
      payment: { means: [{ code: '10', text: 'Barzahlung' }], paid: true },
    }),
  }),
];

/** Credit notes built from the scenarios above, the same way the plugin builds them from an invoice snapshot. */
function creditScenario(name: string, description: string, invoiceName: string, request: CreditNoteRequest, number: string): Scenario {
  const invoice = scenarios.find((s) => s.name === invoiceName)!.model;
  const credit = buildCreditNote(invoice, [], request, { issueDate: '2026-11-20', texts: mappingLabels('de').creditNote });
  credit.number = number;
  return scenario({ name, description, model: credit });
}

scenarios.push(
  creditScenario(
    'credit-note-goodwill',
    'Amount-only refund split proportionally across 19 %, 7 % and zero rated (Q5)',
    'mixed-rates',
    { amount: 5000, note: 'Kulanz wegen Lieferverzug' },
    'GS-2026-00002',
  ),
  creditScenario(
    'credit-note-return',
    'Return of one of two discounted items plus shipping; the SEPA transfer of the invoice becomes ZZZ',
    'b2b-net',
    { lines: [{ lineId: '1', quantity: '1' }], charges: true },
    'GS-2026-00003',
  ),
);
