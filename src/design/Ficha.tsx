import type { PropsWithChildren } from 'react';

type FichaProps = PropsWithChildren<{
  variant?: 'default' | 'focus' | 'flat';
  className?: string;
}>;

export function Ficha({ children, variant = 'default', className = '' }: FichaProps) {
  const tone = variant === 'focus'
    ? 'border-crimson-500/30 shadow-[0_0_48px_hsl(var(--wine-600)/.24)]'
    : variant === 'flat'
      ? 'bg-ink-900/50'
      : 'bg-ink-900';

  return <section className={`ficha relative ${tone} ${className}`}><span className="ficha-corner" aria-hidden="true" />{children}</section>;
}