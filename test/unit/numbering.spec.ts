import { describe, expect, it } from 'vitest';

import { advanceNumbering, formatInvoiceNumber, suggestInvoiceNumber } from '../../src/shared/numbering';
import { numberingSchema, type Numbering } from '../../src/shared/schema';

const numbering = (n: Partial<Numbering> = {}): Numbering => ({
  pattern: 'RE-{YYYY}-{NNNN}',
  next: 42,
  resetYearly: true,
  year: 2026,
  ...n,
});

describe('invoice numbering', () => {
  it('formats date tokens and pads the counter', () => {
    expect(formatInvoiceNumber('RE-{YYYY}-{NNNN}', 42, '2026-11-18')).toBe('RE-2026-0042');
    expect(formatInvoiceNumber('{YY}{MM}{DD}-{N}', 7, '2026-03-05')).toBe('260305-7');
    expect(formatInvoiceNumber('R{NN}', 123, '2026-01-01')).toBe('R123');
  });

  it('suggests the next number and restarts at 1 in a new year', () => {
    expect(suggestInvoiceNumber(numbering(), '2026-12-31')).toBe('RE-2026-0042');
    expect(suggestInvoiceNumber(numbering(), '2027-01-02')).toBe('RE-2027-0001');
    expect(suggestInvoiceNumber(numbering({ resetYearly: false }), '2027-01-02')).toBe('RE-2027-0042');
    expect(suggestInvoiceNumber(numbering({ year: undefined }), '2027-01-02')).toBe('RE-2027-0042');
  });

  it('advances only when the suggested number was used', () => {
    expect(advanceNumbering(numbering(), '2026-11-18', 'RE-2026-0042')).toMatchObject({ next: 43, year: 2026 });
    expect(advanceNumbering(numbering(), '2027-01-02', 'RE-2027-0001')).toMatchObject({ next: 2, year: 2027 });
    expect(advanceNumbering(numbering(), '2026-11-18', 'SONDER-1')).toEqual(numbering());
  });

  it('requires a counter token in the pattern', () => {
    expect(numberingSchema.safeParse(numbering({ pattern: 'RE-{YYYY}' })).success).toBe(false);
  });
});
