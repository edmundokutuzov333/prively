import { ShieldCheck } from '@phosphor-icons/react';

export function Escudo({ text, actionLabel, onAction }: { text: string; actionLabel?: string; onAction?: () => void }) {
  return <div className="flex items-start gap-3 border-y border-bone-50/8 py-4 text-sm text-bone-300">
    <ShieldCheck size={22} weight="duotone" className="mt-0.5 shrink-0 text-crimson-400" />
    <p className="m-0 leading-6">{text}{actionLabel && onAction ? <> <button type="button" onClick={onAction} className="font-medium text-bone-50 underline decoration-bone-50/20 underline-offset-4">{actionLabel}</button></> : null}</p>
  </div>;
}