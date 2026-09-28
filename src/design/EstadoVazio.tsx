import { Ficha } from '@/design/Ficha';

export function EstadoVazio({ title, action }: { title: string; action?: string }) {
  return <Ficha variant="flat" className="flex min-h-48 flex-col items-start justify-end p-6">
    <p className="max-w-[26ch] font-display text-4xl leading-none text-bone-50">{title}</p>
    {action ? <span className="mt-4 text-sm text-bone-300">{action}</span> : null}
  </Ficha>;
}