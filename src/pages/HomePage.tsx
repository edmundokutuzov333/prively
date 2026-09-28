import { ArrowDownRight, Keyhole, LockKey, Sparkle } from '@phosphor-icons/react';
import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { Ficha } from '@/design/Ficha';
import { Botao } from '@/design/Botao';
import { Cordao } from '@/design/Cordao';

export function HomePage() {
  const { t } = useTranslation();
  const reduced = useReducedMotion();
  return <div>
    <section className="relative overflow-hidden border-b border-bone-50/6">
      <div className="mx-auto grid min-h-[calc(100vh-4rem)] max-w-7xl items-end gap-12 px-5 pb-12 pt-20 md:grid-cols-[1.4fr_.6fr] md:px-8 md:pb-16 md:pt-24">
        <div className="relative z-10 max-w-5xl">
          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: reduced ? 0.12 : 0.5 }} className="mb-6 text-sm text-bone-300">{t('brand.tagline')}</motion.p>
          <motion.h1 initial={{ opacity: 0, y: reduced ? 0 : 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: reduced ? 0.12 : 0.55 }} className="max-w-5xl font-display text-[clamp(4.2rem,11vw,10rem)] leading-[0.86] tracking-[-0.04em] text-bone-50">{t('hero.title')}</motion.h1>
          <p className="mt-8 max-w-xl text-base leading-7 text-bone-300">{t('hero.body')}</p>
          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <Link to="/idade" className="no-underline"><Botao><Keyhole size={19} weight="duotone" />{t('hero.clientAction')}</Botao></Link>
            <Link to="/idade" className="no-underline"><Botao variant="outline"><Sparkle size={19} weight="duotone" />{t('hero.creatorAction')}</Botao></Link>
          </div>
        </div>
        <div className="relative hidden min-h-[460px] md:block">
          <div className="absolute left-1/2 top-0 h-[min(70vh,580px)] w-px -translate-x-1/2 bg-crimson-500/40" />
          <motion.div initial={{ scaleY: 0.75, opacity: 0 }} animate={{ scaleY: 1, opacity: 1 }} transition={{ duration: reduced ? 0.12 : 0.9, ease: [0.2, 0.8, 0.2, 1] }} className="absolute left-[calc(50%-1px)] top-1/4 h-56 w-14 origin-top -translate-x-full border-l border-r border-crimson-500/20 bg-gradient-to-r from-wine-900 to-wine-800/20" />
          <div className="absolute bottom-5 right-0 max-w-xs text-right"><p className="font-display text-4xl leading-none text-bone-50">{t('hero.privacyTitle')}</p><p className="mt-4 text-sm leading-6 text-bone-300">{t('hero.privacyBody')}</p></div>
        </div>
      </div>
    </section>
    <section className="mx-auto max-w-7xl px-5 py-20 md:px-8 md:py-28">
      <div className="grid gap-5 md:grid-cols-[1fr_1.2fr]">
        <Ficha variant="focus" className="min-h-64 p-7 md:min-h-80 md:p-10">
          <div className="flex h-full flex-col justify-between"><div className="flex items-center gap-2 text-sm text-bone-300"><LockKey size={18} weight="duotone" />{t('brand.discreet')}</div><p className="max-w-xl font-display text-5xl leading-[.94] text-bone-50 md:text-6xl">{t('hero.privacyTitle')}</p></div>
        </Ficha>
        <Ficha className="min-h-64 p-7 md:min-h-80 md:p-10">
          <div className="flex h-full flex-col justify-between"><div className="flex items-center justify-between text-sm text-bone-500"><span>01</span><ArrowDownRight size={18} weight="duotone" /></div><p className="max-w-2xl text-base leading-7 text-bone-300">{t('hero.privacyBody')}</p><Cordao /></div>
        </Ficha>
      </div>
    </section>
  </div>;
}