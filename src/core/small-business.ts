import type { AllowanceCharge, EInvoiceModel, InvoiceLine, VatCategory } from './model';

/** VAT category of every item of a small business (Kleinunternehmer, § 19 UStG): exempt (`E`), 0 %, with the note. */
export function smallBusinessVat(exemptionReason: string): VatCategory {
  return { code: 'E', rate: '0', exemptionReason };
}

/**
 * Turns an invoice into one of a small business (§ 19 UStG): every line, charge and allowance gets VAT category `E`
 * with 0 % and the exemption note (BT-120), and no tax. Prices are final amounts, so net and gross display are the same.
 * Returns a new model; run `calculate()` afterwards.
 */
export function applySmallBusiness(model: EInvoiceModel, exemptionReason: string): EInvoiceModel {
  const vat = smallBusinessVat(exemptionReason);
  const item = <T extends AllowanceCharge>(ac: T): T => ({ ...ac, vat, itemTaxAmount: 0 });
  const line = (l: InvoiceLine): InvoiceLine => ({ ...l, vat, itemTaxAmount: 0, display: undefined });
  return {
    ...model,
    seller: { ...model.seller, smallBusiness: true },
    lines: model.lines.map(line),
    charges: model.charges.map(item),
    allowances: model.allowances.map(item),
    meta: { ...model.meta, pricesIncludeTax: false, priceDisplay: 'net' },
    totals: undefined,
  };
}
