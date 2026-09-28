export function formatMznFromCents(cents: number): string {
  if (!Number.isInteger(cents) || cents < 0) {
    throw new RangeError('cents must be a non-negative integer');
  }

  const [whole, decimal] = (cents / 100).toFixed(2).split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const suffix = decimal === '00' ? '' : `,${decimal.replace(/0+$/, '')}`;

  return `${grouped}${suffix} MT`;
}
