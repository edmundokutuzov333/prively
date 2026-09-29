export type AmountUnit = 'major' | 'minor';

export function amountUnit(): AmountUnit {
  const value = Deno.env.get('PAYSUITE_AMOUNT_UNIT');
  if (value !== 'major' && value !== 'minor') throw new Error('missing_env:PAYSUITE_AMOUNT_UNIT');
  return value;
}

export function providerAmountToCentavos(value: unknown, unit: AmountUnit): number {
  const text = typeof value === 'number' ? String(value) : typeof value === 'string' ? value.trim().replace(',', '.') : '';
  if (!/^\d+(\.\d{1,2})?$/.test(text)) throw new Error('invalid_amount_format');
  let centavos: number;
  if (unit === 'minor') {
    if (text.includes('.')) throw new Error('invalid_amount_format');
    centavos = Number(text);
  } else {
    const [whole, fraction = ''] = text.split('.');
    centavos = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  }
  if (!Number.isSafeInteger(centavos) || centavos <= 0) throw new Error('invalid_amount');
  return centavos;
}

export function centavosToProviderAmount(centavos: number, unit: AmountUnit): number | string {
  if (!Number.isSafeInteger(centavos) || centavos <= 0) throw new Error('invalid_amount');
  return unit === 'minor' ? centavos : (centavos / 100).toFixed(2);
}
