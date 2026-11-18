import { EInvoiceModel, Money, TaxCalculation, Totals, VatBreakdown, VatCategory } from './model';
import { fromUnits, normalizeDecimal, percentOf, sum } from './money';

export interface CalculateOptions {
  /**
   * The total the customer was charged (e.g. the sum of the entered gross prices).
   * In `en16931` mode the difference to the calculated total becomes the rounding amount (BT-114).
   */
  expectedTotalWithTax?: Money;
  /**
   * In `items` mode: if the tax of one VAT group differs from the EN 16931 calculation by at least
   * this amount (minor units), the whole invoice falls back to `en16931`. Default: 0.50 currency units.
   */
  fallbackThreshold?: Money;
}

interface GroupItem {
  /** signed contribution to the taxable base (allowances are negative) */
  base: Money;
  /** signed precomputed tax for this item, if known */
  itemTax?: Money;
}

interface Group {
  category: VatCategory;
  items: GroupItem[];
}

export function vatGroupKey(category: Pick<VatCategory, 'code' | 'rate'>): string {
  return `${category.code}|${normalizeDecimal(category.rate)}`;
}

/** Groups all taxable amounts of the invoice by VAT category and rate (BG-23), in order of appearance. */
function groupByVat(model: EInvoiceModel): Group[] {
  const groups = new Map<string, Group>();
  const add = (category: VatCategory | undefined, item: GroupItem, label: string) => {
    if (!category) throw new Error(`${label} has no VAT category`);
    const key = vatGroupKey(category);
    const group = groups.get(key) ?? { category: { ...category, rate: normalizeDecimal(category.rate) }, items: [] };
    group.items.push(item);
    groups.set(key, group);
  };
  for (const line of model.lines) {
    add(line.vat, { base: line.netAmount, itemTax: line.itemTaxAmount }, `Line ${line.id}`);
  }
  for (const charge of model.charges) {
    add(charge.vat, { base: charge.amount, itemTax: charge.itemTaxAmount }, `Charge "${charge.reason}"`);
  }
  for (const allowance of model.allowances) {
    add(
      allowance.vat,
      {
        base: -allowance.amount,
        itemTax: allowance.itemTaxAmount === undefined ? undefined : -allowance.itemTaxAmount,
      },
      `Allowance "${allowance.reason}"`,
    );
  }
  return [...groups.values()];
}

function taxPerGroup(group: Group, mode: TaxCalculation): Money {
  const base = sum(group.items.map((i) => i.base));
  if (mode === 'en16931') {
    return percentOf(base, group.category.rate);
  }
  // items: use the precomputed (per-item rounded) tax where known, compute the rest EN-style
  const known = group.items.filter((i) => i.itemTax !== undefined);
  const unknownBase = sum(group.items.filter((i) => i.itemTax === undefined).map((i) => i.base));
  return sum(known.map((i) => i.itemTax as Money)) + percentOf(unknownBase, group.category.rate);
}

/**
 * Computes the VAT breakdown and document totals (BT-106 … BT-115).
 *
 * - `items` mode (default): tax per VAT group = sum of the per-item taxes, so the invoice matches the
 *   amount the customer paid. EN 16931 tolerates a deviation of up to 1 currency unit per group.
 * - `en16931` mode: tax per group = round(base × rate); the difference to the charged total goes into the
 *   rounding amount BT-114.
 */
export function calculate(model: EInvoiceModel, options: CalculateOptions = {}): Totals {
  const warnings: string[] = [];
  const threshold = options.fallbackThreshold ?? fromUnits(0.5, model.amountDecimals);
  const groups = groupByVat(model);

  let applied: TaxCalculation = model.taxCalculation;
  if (applied === 'items') {
    for (const group of groups) {
      const itemTax = taxPerGroup(group, 'items');
      const enTax = taxPerGroup(group, 'en16931');
      if (Math.abs(itemTax - enTax) >= threshold) {
        applied = 'en16931';
        warnings.push(
          `VAT ${group.category.code} ${group.category.rate} %: item tax ${itemTax} differs from ` +
            `EN 16931 tax ${enTax} by more than the threshold ${threshold}; using EN 16931 calculation`,
        );
        break;
      }
    }
  }

  const vat: VatBreakdown[] = groups.map((group) => ({
    category: group.category,
    basisAmount: sum(group.items.map((i) => i.base)),
    taxAmount: taxPerGroup(group, applied),
  }));

  const lineTotal = sum(model.lines.map((l) => l.netAmount));
  const allowanceTotal = sum(model.allowances.map((a) => a.amount));
  const chargeTotal = sum(model.charges.map((c) => c.amount));
  const taxBasisTotal = lineTotal - allowanceTotal + chargeTotal;
  const taxTotal = sum(vat.map((v) => v.taxAmount));
  const grandTotal = taxBasisTotal + taxTotal;
  const expected = options.expectedTotalWithTax;
  const roundingAmount = applied === 'en16931' && expected !== undefined ? expected - grandTotal : 0;
  const expectedTotalDifference = expected === undefined ? 0 : expected - (grandTotal + roundingAmount);
  const prepaidAmount = model.payment.prepaidAmount;

  return {
    lineTotal,
    allowanceTotal,
    chargeTotal,
    taxBasisTotal,
    taxTotal,
    grandTotal,
    prepaidAmount,
    roundingAmount,
    duePayable: grandTotal + roundingAmount - prepaidAmount,
    vat,
    taxCalculation: applied,
    expectedTotalDifference,
    warnings,
  };
}
