import { assertEquals, assertThrows } from 'jsr:@std/assert';
import { providerAmountToCentavos as amount } from './money.ts';

Deno.test('major amounts are explicit', () => {
  assertEquals(amount('100', 'major'), 10000);
  assertEquals(amount(100.5, 'major'), 10050);
  assertEquals(amount('0,99', 'major'), 99);
});
Deno.test('minor amounts are explicit', () => assertEquals(amount(10000, 'minor'), 10000));
Deno.test('minor rejects decimals and invalid values', () => {
  assertThrows(() => amount('100.50', 'minor'));
  assertThrows(() => amount('-1', 'major'));
  assertThrows(() => amount('abc', 'major'));
});
