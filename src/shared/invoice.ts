import { z } from 'zod';

import { checkModel, checkSeller, type InvoiceIssue } from '../core/checks';
import { buildInvoice, type InvoiceDraft } from '../core/draft';
import type { EInvoiceModel, IsoDate, Money, PaymentMeans, VatCategory } from '../core/model';
import { netFromGross, percentOf } from '../core/money';
import { normalizeCode } from '../core/seller-format';
import {
  addressSchema,
  buyerSchema,
  decimalSchema,
  isoDateSchema,
  moneySchema,
  vatCategorySchema,
  type Product,
  type SellerProfile,
} from './schema';

/** How the buyer pays; mapped to UNTDID 4461 payment means. */
export const PAYMENT_METHODS = ['transfer', 'cash', 'card', 'paypal', 'other'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

const lineSchema = z.object({
  name: z.string().trim().min(1).max(500),
  description: z.string().trim().max(1000).optional(),
  sellerItemId: z.string().trim().max(100).optional(),
  quantity: decimalSchema,
  unitCode: z.string().regex(/^[A-Z0-9]{2,3}$/),
  /** In the price basis of the seller profile (`pricesIncludeTax`) */
  unitPrice: moneySchema,
  discount: z.object({ amount: moneySchema, reason: z.string().trim().min(1).max(200) }).optional(),
  vat: vatCategorySchema,
});

/**
 * What the invoice page sends to main. The seller data is not part of it: main takes it from the stored profile,
 * so an invoice always shows the current, checked seller data.
 */
export const invoiceRequestSchema = z.object({
  number: z.string().trim().min(1).max(100),
  issueDate: isoDateSchema,
  deliveryDate: isoDateSchema.optional(),
  language: z.enum(['de', 'en']),
  buyer: buyerSchema,
  delivery: z.object({ name: z.string().trim().max(500).optional(), address: addressSchema }).optional(),
  buyerReference: z.string().trim().max(200).optional(),
  orderReference: z.string().trim().max(200).optional(),
  notes: z.string().trim().max(4000).optional(),
  lines: z.array(lineSchema).max(500),
  shipping: z.object({ amount: moneySchema, vat: vatCategorySchema }).optional(),
  payment: z.object({ method: z.enum(PAYMENT_METHODS), paid: z.boolean() }),
});
export type InvoiceRequest = z.infer<typeof invoiceRequestSchema>;
export type InvoiceRequestLine = InvoiceRequest['lines'][number];

export function addDays(date: IsoDate, days: number): IsoDate {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const PAYMENT_TEXTS: Record<'de' | 'en', Record<PaymentMethod, string>> = {
  de: { transfer: 'Überweisung', cash: 'Barzahlung', card: 'Kartenzahlung', paypal: 'PayPal', other: 'Sonstige Zahlungsart' },
  en: { transfer: 'Bank transfer', cash: 'Cash', card: 'Card payment', paypal: 'PayPal', other: 'Other payment method' },
};

function paymentMeans(method: PaymentMethod, profile: SellerProfile, language: 'de' | 'en'): PaymentMeans {
  const text = PAYMENT_TEXTS[language][method];
  switch (method) {
    case 'transfer':
      return {
        code: '58',
        iban: normalizeCode(profile.bank?.iban ?? ''),
        bic: profile.bank?.bic && normalizeCode(profile.bank.bic),
        accountName: profile.bank?.accountName,
        text,
      };
    case 'cash':
      return { code: '10', text };
    case 'card':
      return { code: '48', text };
    case 'paypal':
      // 68 = online payment service
      return { code: '68', text };
    case 'other':
      return { code: 'ZZZ', text };
  }
}

/** The core draft: seller data and defaults from the profile, everything else from the request. */
export function toDraft(request: InvoiceRequest, profile: SellerProfile): InvoiceDraft {
  const due =
    !request.payment.paid && profile.paymentTermDays !== undefined ? addDays(request.issueDate, profile.paymentTermDays) : undefined;
  const notes = request.notes ? request.notes.split(/\n{2,}/).map((n) => n.trim()) : [];
  return {
    number: request.number,
    issueDate: request.issueDate,
    deliveryDate: request.deliveryDate,
    language: request.language,
    pricesIncludeTax: profile.pricesIncludeTax,
    seller: profile.seller,
    buyer: request.buyer,
    delivery: request.delivery,
    buyerReference: request.buyerReference,
    orderReference: request.orderReference,
    notes: notes.filter(Boolean),
    lines: request.lines,
    shipping: request.shipping,
    payment: {
      means: [paymentMeans(request.payment.method, profile, request.language)],
      terms: profile.paymentTerms,
      dueDate: due,
      paid: request.payment.paid,
    },
  };
}

export interface PreparedInvoice {
  model: EInvoiceModel;
  /** Blocking problems; an invoice with issues is never written */
  issues: InvoiceIssue[];
}

/** Builds and checks the invoice exactly as it would be written. */
export function prepareInvoice(request: InvoiceRequest, profile: SellerProfile): PreparedInvoice {
  const model = buildInvoice(toDraft(request, profile));
  const issues = [...checkSeller(model.seller), ...checkModel(model, ['zugferd'])];
  if (request.lines.length === 0) issues.push({ code: 'EMPTY_INVOICE', message: 'The invoice has no lines', path: 'lines' });
  return { model, issues: dedupe(issues) };
}

function dedupe(issues: InvoiceIssue[]): InvoiceIssue[] {
  const seen = new Set<string>();
  return issues.filter((i) => {
    const key = `${i.code}|${i.path ?? ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Net amount plus its VAT, rounded half up. */
function grossFromNet(net: Money, vat: VatCategory): Money {
  return net + percentOf(net, vat.rate);
}

/**
 * A product's unit price in the invoice's price basis. Products keep their own basis, so a gross product on
 * a net invoice (or the other way round) is converted. Small businesses charge no VAT: the price is used as it is.
 */
export function productUnitPrice(product: Product, pricesIncludeTax: boolean, smallBusiness: boolean): Money {
  if (smallBusiness || product.priceIncludesTax === pricesIncludeTax) return product.price;
  return pricesIncludeTax ? grossFromNet(product.price, product.vat) : netFromGross(product.price, product.vat.rate);
}
