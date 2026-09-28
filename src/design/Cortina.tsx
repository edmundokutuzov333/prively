import { LockKey } from '@phosphor-icons/react';
import { motion, useReducedMotion } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { Botao } from '@/design/Botao';

export function Cortina({ priceLabel, state = 'locked', onUnlock }: { priceLabel: string; state?: 'locked' | 'unlocking' | 'unlocked'; onUnlock: () => void }) {
  const { t } = useTranslation();
  const reducedMotion = useReducedMotion();
  if (state === 'unlocked') return <div className="flex aspect-[4/5] items-end bg-wine-800 p-6"><span className="font-display text-4xl leading-none">{t('curtain.unlocked')}</span></div>;
  return <div className="relative aspect-[4/5] overflow-hidden bg-gradient-to-br from-wine-900 via-ink-850 to-ink-950">
    <div className="absolute inset-0 opacity-30 [background-image:radial-gradient(circle_at_30%_20%,hsl(var(--crimson-400)/.4),transparent_35%),linear-gradient(130deg,hsl(var(--wine-800)/.8),hsl(var(--ink-950)))]" />
    <motion.div className="absolute inset-0 flex items-end p-5" animate={state === 'unlocking' ? { opacity: 0.55 } : { opacity: 1 }} transition={{ duration: reducedMotion ? 0.12 : 0.35 }}>
      <div className="relative z-10 w-full">
        <div className="mb-3 flex items-center gap-2 text-bone-300"><LockKey size={18} weight="duotone" /><span className="text-xs">{t('curtain.protected')}</span></div>
        <p className="mb-4 font-display text-5xl leading-none text-bone-50">{priceLabel}</p>
        <Botao className="w-full" loading={state === 'unlocking'} onClick={onUnlock}>{t('curtain.unlock', { price: priceLabel })}</Botao>
      </div>
    </motion.div>
  </div>;
}