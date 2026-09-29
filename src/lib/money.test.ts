import { describe, expect, it } from 'vitest';
import { formatMznFromCents } from './money';

describe('formatMznFromCents', () => {
  it('formats zero and integer MZN values', () => {
    expect(formatMznFromCents(0)).toBe('0 MT');
    expect(formatMznFromCents(6500)).toBe('65 MT');
    expect(formatMznFromCents(3200000)).toBe('32.000 MT');
  });

  it('formats fractional values using pt-MZ conventions', () => {
    expect(formatMznFromCents(65)).toBe('0,65 MT');
    expect(formatMznFromCents(1005)).toBe('10,05 MT');
    expect(formatMznFromCents(125050)).toBe('1.250,5 MT');
  });

  it('handles values above one million MZN', () => {
    expect(formatMznFromCents(123456789)).toBe('1.234.567,89 MT');
  });

  it('rejects negative or non-integer input', () => {
    expect(() => formatMznFromCents(-1)).toThrow(RangeError);
    expect(() => formatMznFromCents(1.5)).toThrow(RangeError);
    expect(() => formatMznFromCents(Number.NaN)).toThrow(RangeError);
  });
});
