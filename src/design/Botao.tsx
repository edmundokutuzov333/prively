import type { ButtonHTMLAttributes, PropsWithChildren } from 'react';

type BotaoProps = PropsWithChildren<ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' | 'outline' | 'danger'; loading?: boolean }>;

export function Botao({ children, variant = 'primary', loading = false, className = '', disabled, ...props }: BotaoProps) {
  const styles = {
    primary: 'border border-crimson-400/40 bg-crimson-500 text-white shadow-[0_0_32px_hsl(var(--wine-600)/.30)] hover:bg-crimson-400',
    ghost: 'border border-transparent bg-transparent text-bone-50 hover:bg-ink-800',
    outline: 'border border-bone-50/15 bg-transparent text-bone-50 hover:border-crimson-500/40 hover:bg-wine-900/30',
    danger: 'border border-danger/70 bg-transparent text-bone-50 hover:bg-danger/10'
  } as const;

  return <button {...props} disabled={disabled || loading} className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-[2px] px-4 py-3 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${styles[variant]} ${className}`}>
    {loading ? <span className="inline-flex items-center gap-2"><span className="h-px w-8 overflow-hidden bg-crimson-400/30"><span className="block h-full w-3 animate-pulse bg-crimson-400" /></span>{children}</span> : children}
  </button>;
}