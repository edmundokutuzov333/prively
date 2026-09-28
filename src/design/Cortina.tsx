import { LockKey } from '@phosphor-icons/react';
import { motion, useReducedMotion } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { Botao } from '@/design/Botao';

type CortinaProps = {
  priceLabel: string;
  state?: 'locked' | 'unlocking' | 'unlocked';
  thumbnailUrl?: string | null;
  onUnlock?: () => void;
};

export function Cortina({
  priceLabel,
  state = 'locked',
  thumbnailUrl = null,
  onUnlock,
}: CortinaProps) {
  const { t } = useTranslation();
  const reducedMotion = useReducedMotion();

  if (state === 'unlocked') {
    return (
      <div className="flex aspect-[4/5] items-end bg-wine-800 p-6">
        <span className="font-display text-4xl leading-none">{t('curtain.unlocked')}</span>
      </div>
    );
  }

  return (
    <div className="relative aspect-[4/5] overflow-hidden bg-wine-900">
      {thumbnailUrl ? (
        <img
          src={thumbnailUrl}
          alt=""
          aria-hidden="true"
          draggable={false}
          loading="lazy"
          className="absolute inset-0 h-full w-full object-cover opacity-40"
        />
      ) : null}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,hsl(var(--crimson-400)/.22),transparent_35%),linear-gradient(130deg,hsl(var(--wine-800)/.84),hsl(var(--ink-950)/.96))]" />
      <motion.div
        className="absolute inset-0 flex items-end p-5"
        animate={state === 'unlocking' ? { opacity: 0.55 } : { opacity: 1 }}
        transition={{ duration: reducedMotion ? 0.12 : 0.35 }}
      >
        <div className="relative z-10 w-full">
          <div className="mb-3 flex items-center gap-2 text-bone-300">
            <LockKey size={18} weight="duotone" />
            <span className="text-xs">{t('curtain.protected')}</span>
          </div>
          <p className="mb-4 font-display text-5xl leading-none text-bone-50">{priceLabel}</p>
          {onUnlock ? (
            <Botao className="w-full" loading={state === 'unlocking'} onClick={onUnlock}>
              {t('curtain.unlock', { price: priceLabel })}
            </Botao>
          ) : null}
        </div>
      </motion.div>
    </div>
  );
}
