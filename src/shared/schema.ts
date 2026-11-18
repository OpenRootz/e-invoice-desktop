import { z } from 'zod';

import type { Address, Buyer, ElectronicAddress, PaymentMeans, Seller, VatCategory } from '../core/model';

/**
 * Schemas of the master data the app stores. They validate the JSON files on load and every IPC input in
 * main. The core types stay the source of truth; `satisfies` keeps the schemas in line with them.
 */

const text = (max = 500) => z.string().trim().max(max);
/** Optional text; an empty or blank input counts as not given */
const optionalText = (max = 500) =>
  z.preprocess((v) => (typeof v === 'string' && v.trim() === '' ? undefined : v), z.string().trim().max(max).optional());

/** Decimal string, e.g. `19`, `5.5`, `2.25` (never a float) */
export const decimalSchema = z.string().regex(/^\d{1,9}(\.\d{1,6})?$/, 'Decimal number expected');
/** Integer amount in minor units */
export const moneySchema = z.number().int().min(0).max(1e12);
export const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date YYYY-MM-DD expected');

export const addressSchema = z.object({
  line1: text(),
  line2: optionalText(),
  line3: optionalText(),
  postalCode: text(20),
  city: text(),
  countryCode: z.string().regex(/^[A-Z]{2}$/, 'ISO 3166-1 alpha-2 country code expected'),
  subdivision: optionalText(),
}) satisfies z.ZodType<Address, unknown>;

export const electronicAddressSchema = z.object({ scheme: text(10), value: text(320) }) satisfies z.ZodType<ElectronicAddress, unknown>;

export const contactSchema = z.object({ name: optionalText(), phone: optionalText(50), email: optionalText(320) });

export const vatCategorySchema = z.object({
  code: z.enum(['S', 'Z', 'E', 'AE', 'K', 'G', 'O', 'L', 'M']),
  rate: decimalSchema,
  exemptionReason: optionalText(),
  exemptionReasonCode: optionalText(30),
}) satisfies z.ZodType<VatCategory, unknown>;

export const sellerSchema = z.object({
  name: text(),
  tradingName: optionalText(),
  address: addressSchema,
  vatId: optionalText(30),
  electronicAddress: electronicAddressSchema.optional(),
  identifier: z.object({ id: text(100), scheme: optionalText(10) }).optional(),
  taxNumber: optionalText(30),
  legalRegistration: z.object({ id: text(100), scheme: optionalText(10) }).optional(),
  legalInfo: optionalText(1000),
  contact: contactSchema,
  smallBusiness: z.boolean().optional(),
}) satisfies z.ZodType<Seller, unknown>;

export const buyerSchema = z.object({
  name: text(),
  tradingName: optionalText(),
  address: addressSchema,
  vatId: optionalText(30),
  electronicAddress: electronicAddressSchema.optional(),
  isBusiness: z.boolean(),
  contact: contactSchema.optional(),
}) satisfies z.ZodType<Buyer, unknown>;

export const bankAccountSchema = z.object({
  iban: text(34),
  bic: optionalText(11),
  accountName: optionalText(),
});

/** The user's own business: seller data plus defaults for new invoices. */
export const sellerProfileSchema = z.object({
  seller: sellerSchema,
  bank: bankAccountSchema.optional(),
  /** Logo as a data URL (PNG, JPEG or SVG); never a remote URL */
  logo: z
    .string()
    .max(2_000_000)
    .regex(/^data:image\/(png|jpeg|svg\+xml);base64,/, 'Logo must be a PNG, JPEG or SVG data URL')
    .optional(),
  /** Prices are entered including VAT */
  pricesIncludeTax: z.boolean(),
  /** Default payment term in days; `undefined` = no due date */
  paymentTermDays: z.number().int().min(0).max(365).optional(),
  /** Default payment terms text (BT-20) */
  paymentTerms: optionalText(1000),
  /** Default invoice language */
  invoiceLanguage: z.enum(['de', 'en']),
});
export type SellerProfile = z.infer<typeof sellerProfileSchema>;

export const customerSchema = z.object({
  id: z.uuid(),
  /** Customer number (own, free text) */
  number: optionalText(50),
  buyer: buyerSchema,
  delivery: z.object({ name: optionalText(), address: addressSchema }).optional(),
  /** BT-10, e.g. a Leitweg-ID or the buyer's reference */
  buyerReference: optionalText(200),
  /** Invoice language for this customer; default from the seller profile */
  invoiceLanguage: z.enum(['de', 'en']).optional(),
  notes: optionalText(2000),
});
export type Customer = z.infer<typeof customerSchema>;

export const productSchema = z.object({
  id: z.uuid(),
  name: text(),
  description: optionalText(1000),
  /** BT-155 */
  sellerItemId: optionalText(100),
  /** UN/ECE Rec. 20, e.g. H87 (piece), HUR (hour), KGM (kg) */
  unitCode: z.string().regex(/^[A-Z0-9]{2,3}$/),
  /** Price per unit in minor units */
  price: moneySchema,
  /** Whether {@link price} includes VAT; stored per product so changing the seller default never reinterprets it */
  priceIncludesTax: z.boolean(),
  vat: vatCategorySchema,
});
export type Product = z.infer<typeof productSchema>;

export const numberingSchema = z.object({
  /** Tokens: `{YYYY}`, `{YY}`, `{MM}`, `{DD}` and `{N}` (counter; `{NNNN}` = zero-padded to 4 digits) */
  pattern: z
    .string()
    .trim()
    .min(1)
    .max(60)
    .refine((p) => /\{N+\}/.test(p), 'The pattern needs a counter token like {NNNN}'),
  /** Counter for the next invoice */
  next: z.number().int().min(1).max(1e9),
  /** Start again at 1 in a new year */
  resetYearly: z.boolean(),
  /** Year of the last issued number (for the yearly reset) */
  year: z.number().int().min(2000).max(9999).optional(),
});
export type Numbering = z.infer<typeof numberingSchema>;

export const settingsSchema = z.object({
  uiLanguage: z.enum(['de', 'en']),
  numbering: numberingSchema,
  /** Layout of the PDF (core `PdfLayout`), validated by the core's layout checks */
  layout: z.record(z.string(), z.unknown()).optional(),
  /** Folder of the last export, suggested in the save dialog */
  lastOutputDir: z.string().max(4096).optional(),
});
export type Settings = z.infer<typeof settingsSchema>;

export const DEFAULT_SETTINGS: Settings = {
  uiLanguage: 'de',
  numbering: { pattern: 'RE-{YYYY}-{NNNN}', next: 1, resetYearly: true },
};

/** Payment means the app offers (subset of UNTDID 4461). */
export const paymentMeansSchema = z.union([
  z.object({ code: z.literal('58'), iban: text(34), bic: optionalText(11), accountName: optionalText(), text: optionalText() }),
  z.object({ code: z.enum(['10', '30', '48', '54', '55', '68', 'ZZZ']), text: optionalText() }),
]) satisfies z.ZodType<PaymentMeans, unknown>;
