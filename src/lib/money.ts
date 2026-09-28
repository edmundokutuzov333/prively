export function formatMznFromCents(cents: number): string {
  if (!Number.isInteger(cents) || cents < 0) {
    throw new RangeError('cents must be a non-negative integer');
  }

  const value = cents / 100;
  const formatted = new Intl.NumberFormat('pt-PT', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
    useGrouping: true
  }).format(value);

  return `${formatted.replace(/\u00A0/g, ' ')} MT`;
}