import { calculate } from './calculate';
import { mappingLabels } from './labels';
import type {
  Address,
  AllowanceCharge,
  Buyer,
  Decimal,
  EInvoiceModel,
  InvoiceLine,
  IsoDate,
  Money,
  PaymentMeans,
  Seller,
  VatCategory,
} from './model';
import { multiply, netFromGross, sum } from './money';
import { applySmallBusiness } from './small-business';

/**
 * An invoice as the user enters it: prices as they think of them (gross or net), VAT per item, no derived values.
 * {@link buildInvoice} turns it into a calculated {@link EInvoiceModel}.
 */
export interface InvoiceDraft {
  /** BT-1 */
  number: string;
  /** BT-2 */
  issueDate: IsoDate;
  /** BT-72 */
  deliveryDate?: IsoDate;
  /** BT-5, default `EUR` */
  currencyCode?: string;
  /** Language of the PDF labels and generated texts, e.g. `de` */
  language: string;
  /** Prices in this draft include VAT (typical for consumers). Ignored for small businesses: there is no VAT. */
  pricesIncludeTax: boolean;
  seller: Seller;
  buyer: Buyer;
  /** BG-13 / BG-15 deliver-to party, only if different from the buyer address */
  delivery?: { name?: string; address: Address };
  /** BT-10 */
  buyerReference?: string;
  /** BT-13 */
  orderReference?: string;
  /** BT-22 */
  notes?: string[];
  lines: DraftLine[];
  /** Shipping costs, a document-level charge (`FC`) */
  shipping?: DraftCharge;
  payment: {
    means: PaymentMeans[];
    /** BT-20 */
    terms?: string;
    /** BT-9 */
    dueDate?: IsoDate;
    /** The whole amount has already been paid (e.g. cash, PayPal); nothing is due */
    paid: boolean;
  };
}

export interface DraftLine {
  /** BT-153 */
  name: string;
  /** BT-154 */
  description?: string;
  /** BT-155 */
  sellerItemId?: string;
  /** BT-129 */
  quantity: Decimal;
  /** BT-130, UN/ECE Recommendation 20, e.g. `H87` (piece), `HUR` (hour) */
  unitCode: string;
  /** Unit price, gross or net as {@link InvoiceDraft.pricesIncludeTax} says */
  unitPrice: Money;
  /** Discount on the whole line, in the same price basis as the unit price */
  discount?: { amount: Money; reason: string };
  vat: VatCategory;
}

export interface DraftCharge {
  /** Gross or net as {@link InvoiceDraft.pricesIncludeTax} says */
  amount: Money;
  vat: VatCategory;
  /** Default: the localized "Shipping" */
  reason?: string;
}

/** Tax contained in a gross amount: `gross × rate / (100 + rate)`, rounded half up. */
function taxInGross(gross: Money, vat: VatCategory): Money {
  return gross - netFromGross(gross, vat.rate);
}

/**
 * Builds the calculated invoice model from what the user entered.
 *
 * Gross prices are converted like a shop with gross prices does it, so the invoice total equals the sum of the entered
 * gross amounts:
 * - line gross = quantity × gross unit price − discount; line tax = the tax contained in it, rounded per line;
 *   BT-131 line net amount = line gross − line tax
 * - BT-146 net unit price = gross unit price × 100 / (100 + rate), rounded; the difference between
 *   quantity × net unit price − net discount and BT-131 becomes a technical rounding allowance or charge on the line
 * - VAT per rate is the sum of the line taxes (`taxCalculation: 'items'`)
 *
 * Small businesses (§ 19 UStG): prices are final amounts without VAT; every item gets category `E` with the note.
 * The price display follows the buyer: net for businesses, gross for consumers.
 */
export function buildInvoice(draft: InvoiceDraft): EInvoiceModel {
  const labels = mappingLabels(draft.language);
  const smallBusiness = !!draft.seller.smallBusiness;
  const gross = draft.pricesIncludeTax && !smallBusiness;

  const lines = draft.lines.map((l, i) => (gross ? grossLine(l, i, labels.rounding) : netLine(l, i)));
  const charges: AllowanceCharge[] = [];
  if (draft.shipping && draft.shipping.amount > 0) {
    const { amount, vat } = draft.shipping;
    const tax = gross ? taxInGross(amount, vat) : undefined;
    charges.push({
      amount: tax === undefined ? amount : amount - tax,
      reason: draft.shipping.reason || labels.shipping,
      reasonCode: 'FC',
      vat,
      itemTaxAmount: tax,
    });
  }

  let model: EInvoiceModel = {
    schemaVersion: 1,
    type: 'invoice',
    number: draft.number,
    issueDate: draft.issueDate,
    currencyCode: draft.currencyCode ?? 'EUR',
    amountDecimals: 2,
    language: draft.language,
    buyerReference: draft.buyerReference ?? '',
    orderReference: draft.orderReference,
    precedingInvoices: [],
    deliveryDate: draft.deliveryDate,
    notes: draft.notes ?? [],
    seller: draft.seller,
    buyer: draft.buyer,
    delivery: draft.delivery,
    lines,
    allowances: [],
    charges,
    payment: {
      means: draft.payment.means,
      terms: draft.payment.paid ? undefined : draft.payment.terms,
      dueDate: draft.payment.paid ? undefined : draft.payment.dueDate,
      prepaidAmount: 0,
      reference: draft.payment.paid ? undefined : draft.number,
    },
    taxCalculation: 'items',
    meta: {
      pricesIncludeTax: gross,
      priceDisplay: draft.buyer.isBusiness ? 'net' : 'gross',
    },
  };
  if (smallBusiness) model = applySmallBusiness(model, labels.smallBusiness);

  const expectedTotalWithTax = gross ? sum([...lines.map((l) => l.display!.grossAmount!), draft.shipping?.amount ?? 0]) : undefined;
  model.totals = calculate(model, { expectedTotalWithTax });
  if (draft.payment.paid) {
    model.payment.prepaidAmount = model.totals.grandTotal + model.totals.roundingAmount;
    model.totals = calculate(model, { expectedTotalWithTax });
  }
  return model;
}

function netLine(l: DraftLine, index: number): InvoiceLine {
  const discount = l.discount && l.discount.amount > 0 ? l.discount : undefined;
  return {
    id: String(index + 1),
    name: l.name,
    description: l.description,
    sellerItemId: l.sellerItemId,
    quantity: l.quantity,
    unitCode: l.unitCode,
    netUnitPrice: l.unitPrice,
    allowances: discount ? [{ amount: discount.amount, reason: discount.reason }] : [],
    charges: [],
    netAmount: multiply(l.unitPrice, l.quantity) - (discount?.amount ?? 0),
    vat: l.vat,
  };
}

function grossLine(l: DraftLine, index: number, roundingReason: string): InvoiceLine {
  const discount = l.discount && l.discount.amount > 0 ? l.discount : undefined;
  const grossAmount = multiply(l.unitPrice, l.quantity) - (discount?.amount ?? 0);
  const tax = taxInGross(grossAmount, l.vat);
  const netAmount = grossAmount - tax;
  const netUnitPrice = l.unitPrice - taxInGross(l.unitPrice, l.vat);

  const allowances: AllowanceCharge[] = [];
  const charges: AllowanceCharge[] = [];
  if (discount) {
    allowances.push({ amount: discount.amount - taxInGross(discount.amount, l.vat), reason: discount.reason });
  }
  // BT-131 = quantity × BT-146 − allowances + charges must hold exactly
  const rounding = multiply(netUnitPrice, l.quantity) - sum(allowances.map((a) => a.amount)) - netAmount;
  if (rounding > 0) allowances.push({ amount: rounding, reason: roundingReason, rounding: true });
  else if (rounding < 0) charges.push({ amount: -rounding, reason: roundingReason, rounding: true });

  return {
    id: String(index + 1),
    name: l.name,
    description: l.description,
    sellerItemId: l.sellerItemId,
    quantity: l.quantity,
    unitCode: l.unitCode,
    netUnitPrice,
    allowances,
    charges,
    netAmount,
    vat: l.vat,
    itemTaxAmount: tax,
    display: { grossUnitPrice: l.unitPrice, grossAmount },
  };
}
