import { UserCircle } from '@phosphor-icons/react';

export function Avatar({ label, compact = false }: { label: string; compact?: boolean }) {
  return <div className={`flex shrink-0 items-center justify-center rounded-full border border-bone-50/10 bg-ink-800 text-bone-300 ${compact ? 'h-9 w-9' : 'h-12 w-12'}`} aria-label={label} title={label}>
    <UserCircle size={compact ? 20 : 26} weight="duotone" />
  </div>;
}