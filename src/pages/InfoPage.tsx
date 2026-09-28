import { FileText, Lifebuoy, Question, ShieldCheck } from '@phosphor-icons/react';
import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Ficha } from '@/design/Ficha';
import { PageFrame } from '@/pages/PageFrame';

const legalKey = (path: string) => path.split('/').filter(Boolean).at(-1) ?? 'termos';

export function InfoPage() {
  const { pathname } = useLocation();
  const { t } = useTranslation();
  const key = pathname.startsWith('/ajuda') ? 'help' : pathname.startsWith('/sobre') ? 'about' : `legal.${legalKey(pathname)}`;
  const Icon = pathname.startsWith('/ajuda') ? Lifebuoy : pathname.startsWith('/sobre') ? Question : ShieldCheck;
  return <section className="mx-auto max-w-5xl px-5 py-12 md:px-8 md:py-16">
    <PageFrame icon={Icon} title={t(`experience.pages.${key}.title`)} intro={t(`experience.pages.${key}.intro`)} detail={t(`experience.pages.${key}.detail`)} />
    <Ficha className="mt-5 p-6 text-sm leading-7 text-bone-300"><div className="flex items-center gap-2 text-bone-500"><FileText size={18} weight="duotone" /><span>{t('experience.pages.info.note')}</span></div></Ficha>
  </section>;
}