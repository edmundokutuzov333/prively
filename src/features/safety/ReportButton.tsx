import { useState } from 'react';
import { Flag } from '@phosphor-icons/react';
import { Botao } from '@/design/Botao';
import { Ficha } from '@/design/Ficha';
import { requireSupabase } from '@/lib/supabase';
import { useAuth } from '@/app/session';

type ReportTarget = 'profile' | 'post' | 'message' | 'meeting' | 'comment' | 'media' | 'leak' | 'safety';
type Reason =
  | 'minor_suspected'
  | 'non_consensual'
  | 'illegal_content'
  | 'harassment'
  | 'threat'
  | 'doxxing'
  | 'scam'
  | 'copyright'
  | 'privacy'
  | 'spam'
  | 'self_harm'
  | 'safety'
  | 'leak'
  | 'other';

const reasons: Array<{ value: Reason; label: string }> = [
  { value: 'minor_suspected', label: 'Suspeita de menor' },
  { value: 'non_consensual', label: 'Conteúdo não consensual' },
  { value: 'illegal_content', label: 'Conteúdo ilegal' },
  { value: 'harassment', label: 'Assédio' },
  { value: 'threat', label: 'Ameaça' },
  { value: 'doxxing', label: 'Exposição de dados pessoais' },
  { value: 'scam', label: 'Burla ou fraude' },
  { value: 'copyright', label: 'Direitos de autor' },
  { value: 'privacy', label: 'Privacidade' },
  { value: 'spam', label: 'Spam' },
  { value: 'self_harm', label: 'Risco de auto-lesão' },
  { value: 'safety', label: 'Segurança física' },
  { value: 'leak', label: 'Possível fuga de conteúdo' },
  { value: 'other', label: 'Outro' },
];

export function ReportButton({
  targetType,
  targetId,
  label = 'Denunciar',
}: {
  targetType: ReportTarget;
  targetId: string;
  label?: string;
}) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<Reason>('other');
  const [details, setDetails] = useState('');
  const [state, setState] = useState<'idle' | 'saving' | 'sent' | 'error'>('idle');

  if (!user) return null;

  const submit = async () => {
    setState('saving');
    const { error } = await requireSupabase().rpc('submit_report', {
      _target_type: targetType,
      _target_id: targetId,
      _reason_code: reason,
      _details: details.trim() || null,
    });
    setState(error ? 'error' : 'sent');
  };

  return (
    <div className="inline-flex flex-col items-start">
      <Botao variant="outline" type="button" onClick={() => setOpen((value) => !value)} disabled={state === 'saving'}>
        <Flag size={17} weight="duotone" /> {label}
      </Botao>
      {open ? (
        <Ficha className="mt-3 w-full max-w-md p-4">
          {state === 'sent' ? (
            <p role="status" className="m-0 text-sm text-ok">Denúncia enviada para análise.</p>
          ) : (
            <>
              <label className="block text-xs text-bone-500">Motivo</label>
              <select
                value={reason}
                onChange={(event) => setReason(event.target.value as Reason)}
                className="mt-2 min-h-11 w-full rounded-control border border-bone-50/10 bg-ink-900 px-3 text-sm text-bone-50"
              >
                {reasons.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
              <label className="mt-4 block text-xs text-bone-500">Detalhes</label>
              <textarea
                value={details}
                onChange={(event) => setDetails(event.target.value)}
                maxLength={3000}
                rows={4}
                className="mt-2 w-full rounded-control border border-bone-50/10 bg-ink-900 px-3 py-3 text-sm text-bone-50"
                placeholder="Explica o que aconteceu."
              />
              {state === 'error' ? <p role="alert" className="mt-2 text-sm text-danger">Não foi possível enviar a denúncia.</p> : null}
              <Botao type="button" onClick={() => void submit()} loading={state === 'saving'} className="mt-3">Enviar denúncia</Botao>
            </>
          )}
        </Ficha>
      ) : null}
    </div>
  );
}
