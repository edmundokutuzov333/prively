import { Ficha } from '@/design/Ficha';
import { PageFrame } from '@/pages/PageFrame';
import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

export function SurfacePage() {
  const { t } = useTranslation();
  const location = useLocation();

  return (
    <PageFrame
      title={t('surface.title')}
      intro={t('surface.intro')}
      detail={t('surface.backendGated')}
    >
      <Ficha className="mx-auto mt-6 max-w-6xl p-6">
        <p className="m-0 text-xs uppercase tracking-[0.18em] text-bone-500">{t('surface.route')}</p>
        <p className="mt-2 break-all font-mono text-sm text-bone-50">{location.pathname}</p>
      </Ficha>
    </PageFrame>
  );
}

export function SurfaceStatePage() {
  const { t } = useTranslation();
  const location = useLocation();

  return (
    <PageFrame
      title={t('surface.stateTitle')}
      intro={t('surface.stateIntro')}
      detail={t('surface.stateDetail')}
    >
      <Ficha variant="focus" className="mx-auto mt-6 max-w-6xl p-6">
        <p className="m-0 text-xs uppercase tracking-[0.18em] text-crimson-400">{t('surface.state')}</p>
        <p className="mt-3 break-all font-mono text-sm text-bone-50">{location.pathname}</p>
        <p className="mt-4 text-sm leading-6 text-bone-400">{t('surface.stateBackend')}</p>
      </Ficha>
    </PageFrame>
  );
}
