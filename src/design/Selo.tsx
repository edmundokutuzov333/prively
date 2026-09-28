import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

type SeloProps = { source?: 'earned' | 'purchased'; size?: 'sm' | 'md' | 'lg'; children?: ReactNode };

export function Selo({ source = 'earned', size = 'md', children }: SeloProps) {
  const { t } = useTranslation();
  const sizes = { sm: 'h-5 min-w-5 text-[10px]', md: 'h-7 min-w-7 text-xs', lg: 'h-9 min-w-9 text-sm' } as const;
  const purchase = source === 'purchased' ? 'border-tier-ouro/70 text-tier-ouro' : 'border-crimson-400/50 text-bone-50';
  return <span className={`inline-flex items-center justify-center rounded-full border bg-wine-900/60 px-2 font-semibold tracking-tight ${sizes[size]} ${purchase}`} title={t('brand.badge')}>{children ?? 'P'}</span>;
}