import type { Money } from '../../../core/model';

/** 2490 → "24,90 €" in the UI language */
export function formatMoney(amount: Money, language: string, currency = 'EUR'): string {
  return new Intl.NumberFormat(language, { style: 'currency', currency }).format(amount / 100);
}
