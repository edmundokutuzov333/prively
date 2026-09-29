import { useEffect, useState, type ReactNode } from 'react';
import { PinPad } from '@/design/PinPad';
import { Ficha } from '@/design/Ficha';

const STANDARD_TITLE = 'Prively | O teu Privê digital.';
const NEUTRAL_TITLE = 'Actividade';

function hashPin(pin: string): Promise<string> {
  return crypto.subtle.digest('SHA-256', new TextEncoder().encode(pin)).then((digest) =>
    Array.from(new Uint8Array(digest)).map((value) => value.toString(16).padStart(2, '0')).join(''),
  );
}

function applyDiscreetShell(enabled: boolean) {
  document.title = enabled ? NEUTRAL_TITLE : STANDARD_TITLE;
  const manifest = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
  if (manifest) manifest.href = enabled ? '/manifest-neutral.webmanifest' : '/manifest.webmanifest';
}

export function DiscreetGate({ children }: { children: ReactNode }) {
  const [locked, setLocked] = useState(false);
  const [ready, setReady] = useState(false);
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    const evaluate = () => {
      const discreet = window.localStorage.getItem('prively.discreet.enabled') === '1';
      const storedPin = window.localStorage.getItem('prively.discreet.pin');
      const active = discreet && Boolean(storedPin);
      setEnabled(active);
      setReady(true);
      applyDiscreetShell(discreet);
      if (!active) {
        setLocked(false);
        return;
      }
      if (document.visibilityState !== 'visible') setLocked(true);
    };

    evaluate();

    const onDiscreetChanged = () => evaluate();
    window.addEventListener('prively:discreet-changed', onDiscreetChanged);

    let idleTimer: number | undefined;
    const arm = () => {
      if (idleTimer) window.clearTimeout(idleTimer);
      if (!enabled) return;
      idleTimer = window.setTimeout(() => setLocked(true), 5 * 60 * 1000);
    };
    const visibility = () => {
      if (document.visibilityState !== 'visible' && window.localStorage.getItem('prively.discreet.enabled') === '1' && window.localStorage.getItem('prively.discreet.pin')) {
        setLocked(true);
      } else if (document.visibilityState === 'visible') {
        evaluate();
      }
    };
    const activity = () => arm();

    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('pointerdown', activity);
    window.addEventListener('keydown', activity);
    window.addEventListener('touchstart', activity);
    arm();

    return () => {
      window.removeEventListener('prively:discreet-changed', onDiscreetChanged);
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('pointerdown', activity);
      window.removeEventListener('keydown', activity);
      window.removeEventListener('touchstart', activity);
      if (idleTimer) window.clearTimeout(idleTimer);
    };
  }, [enabled]);

  if (!ready || !locked) return <>{children}</>;

  const unlock = async (pin: string) => {
    const expected = window.localStorage.getItem('prively.discreet.pin');
    if (!expected) return;
    const supplied = await hashPin(pin);
    if (supplied === expected) {
      setLocked(false);
    }
  };

  return <div className="fixed inset-0 z-[100] flex items-center justify-center bg-ink-950 p-6">
    <Ficha variant="focus" className="w-full max-w-md p-8 text-center">
      <p className="text-xs uppercase tracking-[0.2em] text-bone-500">Actividade</p>
      <h1 className="mt-3 font-display text-4xl text-bone-50">Espaço bloqueado</h1>
      <p className="mt-3 text-sm leading-6 text-bone-400">Introduz o PIN para voltar a abrir a aplicação.</p>
      <div className="mt-6 flex justify-center"><PinPad onComplete={(pin) => void unlock(pin)} /></div>
    </Ficha>
  </div>;
}
