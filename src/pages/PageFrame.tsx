import type { ElementType, ReactNode } from 'react';
import { ArrowUpRight } from '@phosphor-icons/react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { EstadoVazio } from '@/design/EstadoVazio';

type PageFrameProps = {
  icon?: ElementType<{ size?: number; weight?: 'duotone' | 'regular' | 'bold' }>;
  eyebrow?: string;
  title: string;
  intro: string;
  detail?: string;
  actionHref?: string;
  actionLabel?: string;
  children?: ReactNode;
};

export function PageFrame({ icon: Icon, eyebrow, title, intro, detail, actionHref, actionLabel, children }: PageFrameProps) {
  const { t } = useTranslation();
  return <section>
    <div className="max-w-3xl">
      <div className="flex items-center gap-3 text-sm text-bone-500">
        {Icon ? <Icon size={19} weight="duotone" /> : null}
        <span>{eyebrow ?? intro}</span>
      </div>
      <h1 className="mt-4 font-display text-[clamp(3.2rem,7vw,6rem)] leading-[.88] text-bone-50">{title}</h1>
      {detail || (Icon ? intro : null) ? <p className="mt-6 max-w-2xl text-base leading-7 text-bone-300">{detail ?? intro}</p> : null}
    </div>
    <div className="mt-10">
      {children ?? <EstadoVazio title={title} action={actionHref && actionLabel ? undefined : t('experience.pages.emptyAction')} />}
      {actionHref && actionLabel ? <Link to={actionHref} className="mt-4 inline-flex items-center gap-2 text-sm text-bone-50 underline decoration-bone-50/20 underline-offset-4">{actionLabel}<ArrowUpRight size={16} weight="duotone" /></Link> : null}
    </div>
  </section>;
}
