import type { Decimal, Money, VatCategory } from '../core/model';

/**
 * Parses an amount as the user types it ("24,90", "24.90", "1.234,50", "1,234.50", "24") into minor units, without
 * floats. With both separators the last one is the decimal separator; a single separator followed by exactly three
 * digits ("1.234") is ambiguous and rejected. Returns `undefined` for anything that is not a non-negative amount with
 * at most two decimals.
 */
export function parseMoneyInput(input: string): Money | undefined {
  const s = input.trim().replace(/\s|€/g, '');
  if (!/^[\d.,]+$/.test(s)) return undefined;
  const separators = s.replace(/\d/g, '');
  let whole = s;
  let fraction = '';
  const last = Math.max(s.lastIndexOf(','), s.lastIndexOf('.'));
  const mixed = separators.includes(',') && separators.includes('.');
  if (last >= 0 && (mixed || separators.length === 1)) {
    fraction = s.slice(last + 1);
    whole = s.slice(0, last);
    if (!mixed && fraction.length === 3) return undefined;
    if (fraction.length < 1 || fraction.length > 2) return undefined;
  }
  // Remaining separators group thousands: groups of exactly three digits
  if (!/^\d{1,3}([.,]\d{3})*$|^\d+$/.test(whole)) return undefined;
  const digits = whole.replace(/[.,]/g, '');
  if (digits.length > 10) return undefined;
  return Number(digits) * 100 + Number(fraction.padEnd(2, '0'));
}

/** Minor units → "24,90" (German) or "24.90" (English), without currency sign and grouping. */
export function formatMoneyInput(amount: Money, language: string): string {
  const units = Math.floor(amount / 100);
  const cents = String(amount % 100).padStart(2, '0');
  return `${units}${language === 'de' ? ',' : '.'}${cents}`;
}

/** Parses a quantity ("2,5", "3", "0.25") into a decimal string with at most 4 decimals; `undefined` if invalid or 0. */
export function parseQuantityInput(input: string): Decimal | undefined {
  const s = input.trim().replace(',', '.');
  if (!/^\d{1,7}(\.\d{1,4})?$/.test(s)) return undefined;
  const normalized = s.includes('.') ? s.replace(/\.?0+$/, '') : s.replace(/^0+(?=\d)/, '');
  return /^0*(\.0*)?$/.test(normalized) ? undefined : normalized;
}

export function formatQuantityInput(quantity: Decimal, language: string): string {
  return language === 'de' ? quantity.replace('.', ',') : quantity;
}

/** UN/ECE Recommendation 20 unit codes the app offers. */
export const UNIT_CODES = ['H87', 'C62', 'HUR', 'DAY', 'MON', 'KGM', 'GRM', 'LTR', 'MTR', 'MTK', 'SET', 'PR', 'LS'] as const;

/** VAT categories the app offers for products and shipping (standard and reduced German rates, zero rate). */
export const VAT_PRESETS: { key: 'S19' | 'S7' | 'Z0'; vat: VatCategory }[] = [
  { key: 'S19', vat: { code: 'S', rate: '19' } },
  { key: 'S7', vat: { code: 'S', rate: '7' } },
  { key: 'Z0', vat: { code: 'Z', rate: '0' } },
];

export function vatPresetKey(vat: VatCategory): (typeof VAT_PRESETS)[number]['key'] | undefined {
  return VAT_PRESETS.find((p) => p.vat.code === vat.code && p.vat.rate === vat.rate)?.key;
}
