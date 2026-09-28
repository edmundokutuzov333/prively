import { CheckCircle, CircleNotch, XCircle } from '@phosphor-icons/react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Botao } from '@/design/Botao';
import { Cortina } from '@/design/Cortina';
import { Cordao } from '@/design/Cordao';
import { Dinheiro } from '@/design/Dinheiro';
import { Escudo } from '@/design/Escudo';
import { EstadoVazio } from '@/design/EstadoVazio';
import { Ficha } from '@/design/Ficha';
import { Nivel } from '@/design/Nivel';
import { PinPad } from '@/design/PinPad';
import { Selo } from '@/design/Selo';
import { formatMznFromCents } from '@/lib/money';

export function DesignSystemPage() {
  const { t } = useTranslation();
  const [curtainState, setCurtainState] = useState<'locked' | 'unlocking' | 'unlocked'>('locked');
  const [pinConfirmed, setPinConfirmed] = useState(false);

  return <section className="mx-auto max-w-7xl px-5 py-12 md:px-8 md:py-16">
    <div className="max-w-3xl"><p className="mb-3 text-sm text-bone-500">{t('system.foundations')}</p><h1 className="font-display text-[clamp(3.5rem,8vw,7rem)] leading-[.88] text-bone-50">{t('system.title')}</h1><p className="mt-6 max-w-2xl text-base leading-7 text-bone-300">{t('system.intro')}</p></div>

    <div className="mt-12 grid gap-4 md:grid-cols-2">
      <Ficha className="p-6 md:p-8"><h2 className="font-display text-4xl text-bone-50">{t('system.typography')}</h2><p className="mt-6 text-sm text-bone-500">Hanken Grotesk</p><p className="text-3xl text-bone-50">{t('system.sampleSans')}</p><p className="mt-6 text-sm text-bone-500">Instrument Serif</p><p className="font-display text-5xl text-bone-50">{t('system.sampleSerif')}</p></Ficha>
      <Ficha className="p-6 md:p-8"><h2 className="font-display text-4xl text-bone-50">{t('system.colors')}</h2><div className="mt-6 grid grid-cols-2 gap-3">{['--ink-950','--ink-900','--ink-800','--wine-900','--wine-700','--crimson-500','--rose-300','--bone-50'].map((token) => <div key={token} style={{ background: `hsl(var(${token}))` }} className="h-20 rounded border border-bone-50/10" />)}</div></Ficha>
    </div>

    <div className="mt-4 grid gap-4 md:grid-cols-2">
      <Ficha className="p-6 md:p-8"><h2 className="font-display text-4xl text-bone-50">{t('system.buttons')}</h2><div className="mt-6 flex flex-wrap gap-3"><Botao>{t('common.primary')}</Botao><Botao variant="outline">{t('common.secondary')}</Botao><Botao variant="ghost">{t('common.close')}</Botao><Botao variant="danger"><XCircle size={18} weight="duotone" />{t('common.error')}</Botao><Botao loading>{t('common.loading')}</Botao></div></Ficha>
      <Ficha className="p-6 md:p-8"><h2 className="font-display text-4xl text-bone-50">{t('system.levels')}</h2><div className="mt-6 flex flex-wrap gap-2"><Nivel level="Bronze" /><Nivel level="Prata" /><Nivel level="Ouro" /><Nivel level="VIP" /></div><div className="mt-7 flex gap-2"><Selo /><Selo source="purchased" /></div></Ficha>
    </div>

    <div className="mt-4 grid gap-4 lg:grid-cols-[1.1fr_.9fr]">
      <Ficha className="overflow-hidden"><div className="p-6"><h2 className="font-display text-4xl text-bone-50">{t('system.cortina')}</h2><p className="mt-3 text-sm text-bone-300">{t('hero.body')}</p></div><Cortina priceLabel={formatMznFromCents(25000)} state={curtainState} onUnlock={() => { setCurtainState('unlocking'); window.setTimeout(() => setCurtainState('unlocked'), 250); }} /></Ficha>
      <div className="space-y-4"><Ficha className="p-6"><h2 className="font-display text-4xl text-bone-50">{t('system.money')}</h2><div className="mt-6 space-y-4"><Dinheiro cents={65000} /><Dinheiro cents={125000} approximate /><Cordao /></div></Ficha><Ficha className="p-6"><h2 className="font-display text-4xl text-bone-50">{t('system.cordao')}</h2><div className="mt-8"><Cordao /></div></Ficha></div>
    </div>

    <div className="mt-4 grid gap-4 lg:grid-cols-2">
      <Ficha className="p-6"><h2 className="font-display text-4xl text-bone-50">{t('system.states')}</h2><div className="mt-6 grid gap-3 text-sm"><div className="flex items-center gap-3 text-bone-300"><CheckCircle size={20} className="text-crimson-400" />{t('common.success')}</div><div className="flex items-center gap-3 text-bone-300"><CircleNotch size={20} className="animate-spin text-crimson-400" />{t('common.loading')}</div><div className="flex items-center gap-3 text-bone-300"><XCircle size={20} className="text-danger" />{t('common.error')}</div></div><div className="mt-7"><EstadoVazio title={t('system.empty')} action={t('common.primary')} /></div></Ficha>
      <div className="space-y-4"><Ficha className="p-6"><h2 className="font-display text-4xl text-bone-50">{t('system.shield')}</h2><div className="mt-5"><Escudo text={t('privacy.notice')} /></div></Ficha><Ficha className="flex justify-center p-6"><div><h2 className="mb-6 font-display text-4xl text-bone-50">{t('system.pin')}</h2><PinPad onComplete={() => setPinConfirmed(true)} />{pinConfirmed ? <p className="mt-4 text-sm text-ok">{t('common.success')}</p> : null}</div></Ficha></div>
    </div>
  </section>;
}