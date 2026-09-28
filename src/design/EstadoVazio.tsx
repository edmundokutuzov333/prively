import { Ficha } from '@/design/Ficha';

export function EstadoVazio({ title, body, action }: { title: string; body?: string; action?: string }) {
  return <Ficha variant="flat" className="flex min-h-48 flex-col items-start justify-end p-6">
    <p className="max-w-[30ch] font-display text-4xl leading-none text-bone-50">{title}</p>
    {body ? <p className="mt-4 max-w-[55ch] text-sm leading-6 text-bone-300">{body}</p> : null}
    {action ? <span className="mt-4 text-sm text-bone-300">{action}</span> : null}
  </Ficha>;
}
