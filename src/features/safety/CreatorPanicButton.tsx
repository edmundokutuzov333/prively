import { WarningCircle, CheckCircle } from '@phosphor-icons/react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/app/session';
import { requireSupabase } from '@/lib/supabase';

type PanicStatus = 'idle' | 'busy' | 'success' | 'error';

export function CreatorPanicButton() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [status, setStatus] = useState<PanicStatus>('idle');

  if (!user) return null;

  const trigger = async () => {
    if (status === 'busy') return;
    setStatus('busy');

    const { data, error } = await requireSupabase().functions.invoke('trigger-panic', {
      body: { shareLocation: false },
    });

    if (error || !data?.panicId) {
      setStatus('error');
      return;
    }

    setStatus('success');
    window.setTimeout(() => setStatus('idle'), 7000);
  };

  const label = status === 'success'
    ? t('phase13Safety.panicTriggered')
    : status === 'error'
      ? t('phase13Safety.panicError')
      : t('phase13Safety.panic');

  return (
    <div className="fixed bottom-[5.5rem] right-4 z-50 md:bottom-6 md:right-6">
      <div className="flex max-w-[min(22rem,calc(100vw-2rem))] items-center gap-2 rounded-2xl border border-danger/30 bg-ink-950/95 p-2 shadow-2xl backdrop-blur-xl">
        <button
          type="button"
          aria-label={t('phase13Safety.panicAria')}
          data-testid="creator-panic-button"
          disabled={status === 'busy'}
          onClick={() => void trigger()}
          className="flex min-h-11 items-center gap-2 rounded-xl bg-danger px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-wait disabled:opacity-60"
        >
          {status === 'success' ? <CheckCircle size={18} weight="fill" /> : <WarningCircle size={18} weight="fill" />}
          <span>{label}</span>
        </button>
        <Link
          to="/estudio/panico"
          className="flex min-h-11 items-center rounded-xl px-3 text-xs text-bone-300 hover:bg-ink-900 hover:text-bone-50"
        >
          {t('phase13Safety.safetyPage')}
        </Link>
      </div>
    </div>
  );
}
