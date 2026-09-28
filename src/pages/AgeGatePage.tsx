import { WarningCircle } from '@phosphor-icons/react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Ficha } from '@/design/Ficha';
import { Botao } from '@/design/Botao';

export function AgeGatePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  return <section className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-xl items-center px-5 py-12 md:px-8">
    <Ficha variant="focus" className="w-full p-7 md:p-10">
      <div className="flex items-start gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-crimson-400/30 bg-wine-900/60 text-crimson-400"><WarningCircle size={24} weight="duotone" /></div>
        <div><p className="mb-3 text-sm text-bone-300">{t('ageGate.eyebrow')}</p><h1 className="font-display text-5xl leading-[.92] text-bone-50">{t('ageGate.title')}</h1><p className="mt-5 text-sm leading-6 text-bone-300">{t('ageGate.body')}</p></div>
      </div>
      <div className="mt-8 grid gap-3">
        <Botao onClick={() => navigate('/entrar')}><WarningCircle size={19} weight="duotone" />{t('ageGate.confirm')}</Botao>
        <Link to="/" className="no-underline"><Botao variant="outline" className="w-full">{t('ageGate.leave')}</Botao></Link>
      </div>
      <p className="mt-6 text-xs leading-5 text-bone-500">{t('ageGate.policy')}</p>
    </Ficha>
  </section>;
}