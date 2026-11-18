import type { Numbering } from './schema';

const pad = (n: number, width: number) => String(n).padStart(width, '0');

/** Counter to use on `date`: starts at 1 again in a new year if the yearly reset is on. */
export function counterFor(numbering: Numbering, date: string): number {
  const year = Number(date.slice(0, 4));
  return numbering.resetYearly && numbering.year !== undefined && numbering.year !== year ? 1 : numbering.next;
}

/** Formats an invoice number: `{YYYY}`, `{YY}`, `{MM}`, `{DD}`, `{N…}` (counter, zero-padded to the number of Ns). */
export function formatInvoiceNumber(pattern: string, counter: number, date: string): string {
  const [yyyy, mm, dd] = date.split('-');
  return pattern
    .replace(/\{YYYY\}/g, yyyy)
    .replace(/\{YY\}/g, yyyy.slice(2))
    .replace(/\{MM\}/g, mm)
    .replace(/\{DD\}/g, dd)
    .replace(/\{(N+)\}/g, (_, ns: string) => pad(counter, ns.length));
}

/** The number the app suggests for an invoice dated `date` (a suggestion; the user may change it). */
export function suggestInvoiceNumber(numbering: Numbering, date: string): string {
  return formatInvoiceNumber(numbering.pattern, counterFor(numbering, date), date);
}

/**
 * The numbering after an invoice was written. The counter only advances when the suggested number was used;
 * a number the user typed in leaves it unchanged.
 */
export function advanceNumbering(numbering: Numbering, date: string, usedNumber: string): Numbering {
  if (usedNumber !== suggestInvoiceNumber(numbering, date)) return numbering;
  return { ...numbering, next: counterFor(numbering, date) + 1, year: Number(date.slice(0, 4)) };
}
