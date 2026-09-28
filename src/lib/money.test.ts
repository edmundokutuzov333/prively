import { describe, expect, it } from 'vitest';
import { formatMznFromCents } from './money';

describe('formatMznFromCents', () => {
  it('formats zero', () => expect(formatMznFromCents(0)).toBe('0 MT'));
  it('formats a common value', () => expect(formatMznFromCents(125000)).toBe('1.250 MT'));
  it('formats a small value without fractional cents', () => expect(formatMznFromCents(65)).toBe('0,65 MT'));
  it('rejects negative values', () => expect(() => formatMznFromCents(-1)).toThrow(RangeError));
  it('rejects non integers', () => expect(() => formatMznFromCents(10.5)).toThrow(RangeError));
});