import { formatMznFromCents } from '@/lib/money';

export function Dinheiro({ cents, approximate = false }: { cents: number; approximate?: boolean }) {
  return <span className="font-display tabular-nums text-2xl leading-none text-bone-50">{approximate ? '≈ ' : ''}{formatMznFromCents(cents)}</span>;
}