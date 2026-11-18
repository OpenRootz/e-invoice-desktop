import { describe, expect, it } from 'vitest';

import { formatMoneyInput, parseMoneyInput, parseQuantityInput } from '../../src/shared/input';

describe('parseMoneyInput', () => {
  it.each([
    ['24,90', 2490],
    ['24.90', 2490],
    ['24', 2400],
    ['24,9', 2490],
    ['0,99', 99],
    ['1.234,50', 123450],
    ['1,234.50', 123450],
    ['1.234.567', 123456700],
    ['12 € ', 1200],
    ['0', 0],
  ])('%s → %i', (input, expected) => {
    expect(parseMoneyInput(input)).toBe(expected);
  });

  it.each(['', 'abc', '-5', '1,234', '1.234', '24,999', '1.2.3,4', '12,', ',5,5'])('rejects %j', (input) => {
    expect(parseMoneyInput(input)).toBeUndefined();
  });

  it('formats for the input field', () => {
    expect(formatMoneyInput(123450, 'de')).toBe('1234,50');
    expect(formatMoneyInput(99, 'en')).toBe('0.99');
  });
});

describe('parseQuantityInput', () => {
  it.each([
    ['2,5', '2.5'],
    ['3', '3'],
    ['0.25', '0.25'],
    ['1,500', '1.5'],
    ['007', '7'],
  ])('%s → %s', (input, expected) => {
    expect(parseQuantityInput(input)).toBe(expected);
  });

  it.each(['', '0', '0,00', '-1', '1,23456', 'x'])('rejects %j', (input) => {
    expect(parseQuantityInput(input)).toBeUndefined();
  });
});
