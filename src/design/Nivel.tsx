import { useTranslation } from 'react-i18next';

type Level = 'Bronze' | 'Prata' | 'Ouro' | 'VIP';

const styles: Record<Level, string> = {
  Bronze: 'border-tier-bronze/40 text-tier-bronze bg-tier-bronze/10',
  Prata: 'border-tier-prata/40 text-tier-prata bg-tier-prata/10',
  Ouro: 'border-tier-ouro/40 text-tier-ouro bg-tier-ouro/10',
  VIP: 'border-crimson-400/50 text-bone-50 bg-gradient-to-r from-wine-900 to-crimson-500/20'
};

export function Nivel({ level }: { level: Level }) {
  const { t } = useTranslation();
  const label = t(`levels.${level}`);
  return <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${styles[level]}`}>{label}</span>;
}