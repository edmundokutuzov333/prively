import { useEffect, useState } from 'react';
import { Ficha } from '@/design/Ficha';
import { Botao } from '@/design/Botao';
import { PageFrame } from '@/pages/PageFrame';
import { requireSupabase } from '@/lib/supabase';

type Ticket = {
  id: string;
  requester_id: string;
  category: string;
  subject: string;
  message: string;
  priority: string;
  status: string;
  assigned_to: string | null;
  resolution_note: string | null;
  created_at: string;
};

export function SupportPage({ admin = false }: { admin?: boolean }) {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [category, setCategory] = useState('technical');
  const [priority, setPriority] = useState('normal');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [resolution, setResolution] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = async () => {
    try {
      const sb = requireSupabase();
      if (admin) {
        const result = await sb.rpc('get_support_queue', { _limit: 200 });
        if (result.error) throw result.error;
        setTickets((result.data ?? []) as Ticket[]);
      } else {
        const result = await sb.from('support_tickets').select('id,requester_id,category,subject,message,priority,status,assigned_to,resolution_note,created_at').order('created_at', { ascending: false }).limit(100);
        if (result.error) throw result.error;
        setTickets((result.data ?? []) as Ticket[]);
      }
    } catch (value: unknown) {
      setError(value instanceof Error ? value.message : 'Falha ao carregar suporte.');
    }
  };

  useEffect(() => { void load(); }, [admin]);

  const create = async () => {
    try {
      const result = await requireSupabase().rpc('create_support_ticket', {
        _category: category,
        _subject: subject.trim(),
        _message: message.trim(),
        _priority: priority,
      });
      if (result.error) throw result.error;
      setSubject('');
      setMessage('');
      setNotice('Pedido enviado ao suporte.');
      await load();
    } catch (value: unknown) {
      setError(value instanceof Error ? value.message : 'Não foi possível enviar o pedido.');
    }
  };

  const resolve = async (ticketId: string, status: 'in_progress' | 'resolved' | 'closed') => {
    const result = await requireSupabase().rpc('resolve_support_ticket', {
      _ticket: ticketId,
      _status: status,
      _note: resolution[ticketId] ?? '',
    });
    if (result.error) setError(result.error.message);
    else await load();
  };

  return <PageFrame title={admin ? 'Suporte e tickets' : 'Suporte'} intro={admin ? 'Fila operacional de pedidos e emergências.' : 'Abre um pedido e acompanha o estado dentro da aplicação.'}>
    {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
    {notice ? <p role="status" className="text-sm text-ok">{notice}</p> : null}
    {!admin ? <Ficha className="p-5">
      <div className="grid gap-3 md:grid-cols-3">
        <select value={category} onChange={(event) => setCategory(event.target.value)} className="min-h-11 rounded-md bg-ink-800 px-3 text-bone-50"><option value="account">Conta</option><option value="payment">Pagamento</option><option value="content">Conteúdo</option><option value="safety">Segurança</option><option value="verification">Verificação</option><option value="technical">Técnico</option><option value="other">Outro</option></select>
        <select value={priority} onChange={(event) => setPriority(event.target.value)} className="min-h-11 rounded-md bg-ink-800 px-3 text-bone-50"><option value="normal">Normal</option><option value="high">Alta</option><option value="emergency">Emergência</option></select>
        <input value={subject} onChange={(event) => setSubject(event.target.value)} placeholder="Assunto" className="min-h-11 rounded-md bg-ink-800 px-3 text-bone-50" />
      </div>
      <textarea value={message} onChange={(event) => setMessage(event.target.value)} rows={6} placeholder="Descreve o pedido" className="mt-3 w-full rounded-md bg-ink-800 px-3 py-3 text-bone-50" />
      <Botao className="mt-3" onClick={() => void create()} disabled={subject.trim().length < 3 || message.trim().length < 10}>Enviar pedido</Botao>
    </Ficha> : null}

    <div className="mt-5 grid gap-3">
      {!tickets.length ? <Ficha><p className="m-0 text-sm text-bone-500">Ainda não existem tickets.</p></Ficha> : null}
      {tickets.map((ticket) => <Ficha key={ticket.id} className={ticket.priority === 'emergency' ? 'border-danger/30' : ''}>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-sm font-semibold text-bone-50">{ticket.subject}</p>
            <p className="mt-1 text-xs text-bone-500">{ticket.category} · {ticket.priority} · {ticket.status} · {new Date(ticket.created_at).toLocaleString('pt-MZ')}</p>
            <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-bone-300">{ticket.message}</p>
            {ticket.resolution_note ? <p className="mt-3 text-xs text-bone-500">Resolução: {ticket.resolution_note}</p> : null}
          </div>
          {admin && ticket.status !== 'resolved' && ticket.status !== 'closed' ? <div className="w-full max-w-sm space-y-2">
            <textarea value={resolution[ticket.id] ?? ''} onChange={(event) => setResolution((current) => ({ ...current, [ticket.id]: event.target.value }))} rows={3} placeholder="Nota de tratamento" className="w-full rounded-md bg-ink-800 px-3 py-2 text-sm text-bone-50" />
            <div className="flex gap-2"><Botao variant="outline" onClick={() => void resolve(ticket.id, 'in_progress')}>Assumir</Botao><Botao onClick={() => void resolve(ticket.id, 'resolved')}>Resolver</Botao><Botao variant="ghost" onClick={() => void resolve(ticket.id, 'closed')}>Fechar</Botao></div>
          </div> : null}
        </div>
      </Ficha>)}
    </div>
  </PageFrame>;
}
