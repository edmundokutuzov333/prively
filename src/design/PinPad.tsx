import { LockKey } from '@phosphor-icons/react';
import { useTranslation } from 'react-i18next';
import { useState } from 'react';

export function PinPad({ onComplete }: { onComplete: (pin: string) => void }) {
  const { t } = useTranslation();
  const [pin, setPin] = useState('');
  const keys = ['1','2','3','4','5','6','7','8','9','del','0','enter'];
  const press = (key: string) => {
    if (key === 'del') { setPin((value) => value.slice(0, -1)); return; }
    if (key === 'enter') { if (pin.length === 4) onComplete(pin); return; }
    if (pin.length < 4) setPin((value) => value + key);
  };
  return <div className="w-full max-w-xs rounded-xl border border-bone-50/10 bg-ink-900 p-5">
    <div className="mb-5 flex items-center gap-3 text-bone-300"><LockKey size={20} weight="duotone" /><span className="text-sm">{t('curtain.pin')}</span></div>
    <div className="mb-5 flex justify-center gap-3">{[0,1,2,3].map((index) => <span key={index} className={`h-3 w-3 rounded-full border ${index < pin.length ? 'border-crimson-400 bg-crimson-400' : 'border-bone-50/20 bg-transparent'}`} aria-hidden="true" />)}</div>
    <div className="grid grid-cols-3 gap-2">{keys.map((key) => <button key={key} type="button" onClick={() => press(key)} className="min-h-12 rounded-md border border-bone-50/8 bg-ink-850 text-sm text-bone-50 hover:bg-ink-800">{key === 'del' ? '⌫' : key === 'enter' ? t('curtain.confirm') : key}</button>)}</div>
  </div>;
}