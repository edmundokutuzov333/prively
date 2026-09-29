import { useEffect, useState } from 'react';
import { Clock, Phone, Plus, ShieldCheck, Trash, WarningCircle } from '@phosphor-icons/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/app/session';
import { Ficha } from '@/design/Ficha';
import { Botao } from '@/design/Botao';
import { EstadoVazio } from '@/design/EstadoVazio';
import { PageFrame } from '@/pages/PageFrame';
import { requireSupabase } from '@/lib/supabase';
import { ReportButton } from '@/features/safety/ReportButton';

const dt = (value: string) => new Date(value).toLocaleString('pt-PT', { dateStyle: 'short', timeStyle: 'short' });
const toIso = (value: string) => new Date(value).toISOString();

type SafetyIncidentRow = {
  panic_id: string | null;
  checkin_id: string | null;
  panic_created_at: string | null;
  checkin_alerted_at: string | null;
  panic_share_location: boolean | null;
};

export function Phase8MyReportsPage() {
  const { user } = useAuth();
  const { data = [], isLoading } = useQuery({
    queryKey: ['phase8', 'reports', user?.id],
    enabled: Boolean(user),
    queryFn: async () => {
      const { data, error } = await requireSupabase().from('reports').select('id,target_type,reason_code,status,priority,created_at,details').order('created_at', { ascending: false }).limit(100);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  if (!user) return null;
  return (
    <PageFrame title="Denúncias" intro="Acompanha as denúncias que enviaste." detail="As denúncias são analisadas pela equipa de moderação. Não expomos o conteúdo de investigações internas.">
      {isLoading ? <p className="text-sm text-bone-500">A carregar.</p> : null}
      {!data.length && !isLoading ? <EstadoVazio title="Ainda não tens denúncias." body="Quando denunciares um perfil, publicação, mensagem ou encontro, o estado aparece aqui." /> : null}
      <div className="space-y-3">
        {data.map((item) => (
          <Ficha key={item.id}>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="m-0 text-sm font-semibold text-bone-50">{item.target_type} · {item.reason_code}</p>
                <p className="mt-1 text-xs text-bone-500">{dt(item.created_at)} · prioridade {item.priority}</p>
                {item.details ? <p className="mt-3 text-sm leading-6 text-bone-300">{item.details}</p> : null}
              </div>
              <span className="rounded-full border border-bone-50/10 px-3 py-1 text-xs text-bone-300">{item.status}</span>
            </div>
          </Ficha>
        ))}
      </div>
    </PageFrame>
  );
}

export function Phase8ModerationPage() {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { data = [], isLoading } = useQuery({
    queryKey: ['phase8', 'moderation'],
    queryFn: async () => {
      const sb = requireSupabase();
      const { data, error } = await sb
        .from('moderation_queue')
        .select('id,report_id,post_id,asset_id,message_id,queue_type,priority,status,ai_status,ai_categories,ai_score,assigned_to,created_at,resolved_at')
        .order('created_at', { ascending: true })
        .limit(200);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const act = async (queueId: string, action: string) => {
    setBusy(queueId + ':' + action);
    setError(null);
    const { error } = await requireSupabase().rpc('resolve_moderation_case', {
      _queue_id: queueId,
      _action: action,
      _reason: 'Decisão de moderação registada na fila da Fase 8.',
    });
    if (error) setError(error.message);
    await queryClient.invalidateQueries({ queryKey: ['phase8', 'moderation'] });
    setBusy(null);
  };

  const claim = async (queueId: string) => {
    setBusy(queueId + ':claim');
    const { error } = await requireSupabase().rpc('claim_moderation_case', { _queue_id: queueId });
    if (error) setError(error.message);
    await queryClient.invalidateQueries({ queryKey: ['phase8', 'moderation'] });
    setBusy(null);
  };

  const aiScan = async (queueId: string) => {
    setBusy(queueId + ':ai');
    setError(null);
    const result = await requireSupabase().functions.invoke('moderation-scan', { body: { queueId } });
    if (result.error) setError(result.error.message);
    await queryClient.invalidateQueries({ queryKey: ['phase8', 'moderation'] });
    setBusy(null);
  };

  return (
    <section className="space-y-8">
      <div>
        <p className="flex items-center gap-2 text-sm text-bone-500"><ShieldCheck size={18} />Moderação</p>
        <h1 className="mt-4 font-display text-6xl leading-none text-bone-50">Fila de confiança</h1>
        <p className="mt-5 max-w-3xl text-base leading-7 text-bone-300">Cada caso tem prioridade, estado, decisão humana e trilho de auditoria. A IA só entra quando um fornecedor aprovado estiver configurado.</p>
      </div>
      {error ? <p role="alert" className="rounded-md border border-danger/30 bg-danger/5 p-4 text-sm text-bone-50">{error}</p> : null}
      {isLoading ? <p className="text-sm text-bone-500">A carregar fila.</p> : null}
      <div className="space-y-3">
        {data.map((item) => (
          <Ficha key={item.id}>
            <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full border border-bone-50/10 px-2 py-1 text-xs text-bone-300">{item.priority}</span>
                  <span className="rounded-full border border-bone-50/10 px-2 py-1 text-xs text-bone-300">{item.status}</span>
                  <span className="rounded-full border border-bone-50/10 px-2 py-1 text-xs text-bone-300">IA: {item.ai_status}</span>
                </div>
                <p className="mt-3 text-sm font-semibold text-bone-50">{item.queue_type}</p>
                <p className="mt-1 text-xs text-bone-500">{dt(item.created_at)}</p>
                {item.ai_categories?.length ? <p className="mt-2 text-xs text-bone-400">Categorias IA: {JSON.stringify(item.ai_categories)}</p> : null}
              </div>
              <div className="flex flex-wrap gap-2">
                <Botao variant="outline" onClick={() => void claim(item.id)} loading={busy === item.id + ':claim'}>Assumir</Botao>
                <Botao variant="outline" onClick={() => void aiScan(item.id)} loading={busy === item.id + ':ai'}>Analisar IA</Botao>
                <Botao variant="danger" onClick={() => void act(item.id, 'remove_content')} loading={busy === item.id + ':remove_content'}>Remover</Botao>
                <Botao variant="outline" onClick={() => void act(item.id, 'dismiss')} loading={busy === item.id + ':dismiss'}>Encerrar</Botao>
              </div>
            </div>
          </Ficha>
        ))}
        {!data.length && !isLoading ? <EstadoVazio title="Fila vazia." body="Não existem casos pendentes neste momento." /> : null}
      </div>
    </section>
  );
}

export function Phase8CompliancePage() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [targetType, setTargetType] = useState('message');
  const [targetId, setTargetId] = useState('');
  const [reason, setReason] = useState('');
  const [legalOrder, setLegalOrder] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data = [] } = useQuery({
    queryKey: ['phase8', 'compliance-requests'],
    queryFn: async () => {
      const { data, error } = await requireSupabase().from('compliance_access_requests').select('id,requester_id,target_type,target_id,reason,legal_order,status,second_approver_id,created_at,expires_at').order('created_at', { ascending: false }).limit(100);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const requestAccess = async () => {
    setError(null);
    const { error } = await requireSupabase().rpc('request_compliance_access', {
      _target_type: targetType,
      _target_id: targetId.trim(),
      _reason: reason.trim(),
      _legal_order: legalOrder,
    });
    if (error) setError(error.message);
    else {
      setTargetId('');
      setReason('');
      await queryClient.invalidateQueries({ queryKey: ['phase8', 'compliance-requests'] });
    }
  };

  const approve = async (id: string) => {
    const { error } = await requireSupabase().rpc('approve_compliance_access', { _request_id: id });
    if (error) setError(error.message);
    await queryClient.invalidateQueries({ queryKey: ['phase8', 'compliance-requests'] });
  };

  return (
    <section className="space-y-8">
      <div>
        <p className="flex items-center gap-2 text-sm text-bone-500"><ShieldCheck size={18} />Conformidade</p>
        <h1 className="mt-4 font-display text-6xl leading-none text-bone-50">Vista de conformidade</h1>
        <p className="mt-5 max-w-3xl text-base leading-7 text-bone-300">Conteúdo privado só é consultável através de um pedido justificado, temporalmente limitado e auditado. DMs exigem segunda aprovação salvo ordem judicial.</p>
      </div>

      <Ficha className="p-5">
        <div className="grid gap-4 md:grid-cols-2">
          <label className="text-sm text-bone-300">Tipo
            <select value={targetType} onChange={(e) => setTargetType(e.target.value)} className="mt-2 min-h-11 w-full rounded-control border border-bone-50/10 bg-ink-900 px-3 text-bone-50">
              {['message','conversation','post','asset','report','user','meeting'].map((value) => <option key={value}>{value}</option>)}
            </select>
          </label>
          <label className="text-sm text-bone-300">ID do alvo
            <input value={targetId} onChange={(e) => setTargetId(e.target.value)} className="mt-2 min-h-11 w-full rounded-control border border-bone-50/10 bg-ink-900 px-3 text-sm text-bone-50" placeholder="UUID" />
          </label>
        </div>
        <label className="mt-4 block text-sm text-bone-300">Motivo escrito
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={4} className="mt-2 w-full rounded-control border border-bone-50/10 bg-ink-900 px-3 py-3 text-sm text-bone-50" placeholder="Indica a razão concreta para o acesso." />
        </label>
        <label className="mt-4 flex items-center gap-3 text-sm text-bone-300"><input type="checkbox" checked={legalOrder} onChange={(e) => setLegalOrder(e.target.checked)} /> Existe ordem judicial documentada</label>
        {error ? <p role="alert" className="mt-3 text-sm text-danger">{error}</p> : null}
        <Botao className="mt-4" onClick={() => void requestAccess()} disabled={!user || !targetId || reason.trim().length < 12}>Criar pedido de acesso</Botao>
      </Ficha>

      <div className="space-y-3">
        {data.map((item) => (
          <Ficha key={item.id}>
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <p className="text-sm font-semibold text-bone-50">{item.target_type} · {item.status}</p>
                <p className="mt-1 text-xs text-bone-500">{item.created_at ? dt(item.created_at) : ''} · expira {dt(item.expires_at)}</p>
                <p className="mt-3 text-sm text-bone-300">{item.reason}</p>
                {item.legal_order ? <p className="mt-2 text-xs text-ok">Ordem judicial registada.</p> : null}
              </div>
              {item.status === 'pending' ? <Botao onClick={() => void approve(item.id)}>Aprovar</Botao> : null}
            </div>
          </Ficha>
        ))}
        {!data.length ? <EstadoVazio title="Sem pedidos de acesso." body="Os pedidos aprovados ficam registados em admin_access_log." /> : null}
      </div>
    </section>
  );
}

export function Phase8LegalHoldsPage() {
  const queryClient = useQueryClient();
  const [targetType, setTargetType] = useState('post');
  const [targetId, setTargetId] = useState('');
  const [reason, setReason] = useState('');

  const { data = [] } = useQuery({
    queryKey: ['phase8', 'legal-holds'],
    queryFn: async () => {
      const { data, error } = await requireSupabase().from('legal_holds').select('id,target_type,target_id,reason,status,created_at,released_at').order('created_at', { ascending: false });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const createHold = async () => {
    const { error } = await requireSupabase().rpc('apply_legal_hold', { _target_type: targetType, _target_id: targetId, _reason: reason });
    if (!error) {
      setTargetId('');
      setReason('');
      await queryClient.invalidateQueries({ queryKey: ['phase8', 'legal-holds'] });
    }
  };

  const release = async (id: string) => {
    const { error } = await requireSupabase().rpc('release_legal_hold', { _hold_id: id, _reason: 'Retenção encerrada pela conformidade.' });
    if (!error) await queryClient.invalidateQueries({ queryKey: ['phase8', 'legal-holds'] });
  };

  return (
    <PageFrame title="Legal Holds" intro="Preservação controlada de conteúdo e evidência." detail="Um legal hold activo impede a remoção por retenção até ser libertado pela conformidade.">
      <Ficha className="p-5">
        <div className="grid gap-4 md:grid-cols-3">
          <select value={targetType} onChange={(e) => setTargetType(e.target.value)} className="min-h-11 rounded-control border border-bone-50/10 bg-ink-900 px-3 text-bone-50">
            {['post','asset','message','conversation','user','report'].map((value) => <option key={value}>{value}</option>)}
          </select>
          <input value={targetId} onChange={(e) => setTargetId(e.target.value)} placeholder="UUID do alvo" className="min-h-11 rounded-control border border-bone-50/10 bg-ink-900 px-3 text-sm text-bone-50" />
          <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Motivo de retenção" className="min-h-11 rounded-control border border-bone-50/10 bg-ink-900 px-3 text-sm text-bone-50" />
        </div>
        <Botao className="mt-4" onClick={() => void createHold()} disabled={!targetId || reason.length < 12}>Criar legal hold</Botao>
      </Ficha>
      <div className="mt-5 space-y-3">
        {data.map((item) => <Ficha key={item.id}><div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between"><div><p className="text-sm font-semibold text-bone-50">{item.target_type}</p><p className="text-xs text-bone-500">{dt(item.created_at)} · {item.status}</p><p className="mt-2 text-sm text-bone-300">{item.reason}</p></div>{item.status === 'active' ? <Botao variant="outline" onClick={() => void release(item.id)}>Libertar</Botao> : null}</div></Ficha>)}
      </div>
    </PageFrame>
  );
}

export function Phase8SafeVenuesPage() {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [kind, setKind] = useState('cafe');
  const [city, setCity] = useState('Maputo');
  const [bairro, setBairro] = useState('');

  const { data = [] } = useQuery({
    queryKey: ['phase8', 'safe-venues'],
    queryFn: async () => {
      const { data, error } = await requireSupabase().from('safe_venues').select('id,name,kind,city,bairro,active').order('city').order('name');
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const add = async () => {
    const { error } = await requireSupabase().from('safe_venues').insert({ name: name.trim(), kind, city: city.trim(), bairro: bairro.trim() || null });
    if (!error) {
      setName('');
      setBairro('');
      await queryClient.invalidateQueries({ queryKey: ['phase8', 'safe-venues'] });
    }
  };

  const toggle = async (id: string, active: boolean) => {
    await requireSupabase().from('safe_venues').update({ active: !active }).eq('id', id);
    await queryClient.invalidateQueries({ queryKey: ['phase8', 'safe-venues'] });
  };

  return (
    <PageFrame title="Locais seguros" intro="Curadoria de espaços públicos para encontros sociais." detail="A base de dados impede categorias de hotel ou alojamento. Não existem preços nem pagamentos neste módulo.">
      <Ficha className="p-5">
        <div className="grid gap-4 md:grid-cols-4">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome do local" className="min-h-11 rounded-control border border-bone-50/10 bg-ink-900 px-3 text-sm text-bone-50" />
          <select value={kind} onChange={(e) => setKind(e.target.value)} className="min-h-11 rounded-control border border-bone-50/10 bg-ink-900 px-3 text-bone-50"><option value="cafe">Café</option><option value="restaurante">Restaurante</option><option value="centro_comercial">Centro comercial</option></select>
          <input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Cidade" className="min-h-11 rounded-control border border-bone-50/10 bg-ink-900 px-3 text-sm text-bone-50" />
          <input value={bairro} onChange={(e) => setBairro(e.target.value)} placeholder="Bairro" className="min-h-11 rounded-control border border-bone-50/10 bg-ink-900 px-3 text-sm text-bone-50" />
        </div>
        <Botao className="mt-4" onClick={() => void add()} disabled={!name.trim()}>Adicionar local</Botao>
      </Ficha>
      <div className="mt-5 grid gap-3">
        {data.map((item) => <Ficha key={item.id}><div className="flex items-center justify-between gap-4"><div><p className="text-sm font-semibold text-bone-50">{item.name}</p><p className="mt-1 text-xs text-bone-500">{item.kind} · {item.city}{item.bairro ? ' · ' + item.bairro : ''}</p></div><Botao variant="outline" onClick={() => void toggle(item.id, item.active)}>{item.active ? 'Desactivar' : 'Activar'}</Botao></div></Ficha>)}
      </div>
    </PageFrame>
  );
}

export function Phase8EmergenciesPage() {
  const queryClient = useQueryClient();
  const { data = [], isLoading } = useQuery<SafetyIncidentRow[]>({
    queryKey: ['phase8', 'incidents'],
    queryFn: async () => {
      const { data, error } = await requireSupabase().rpc('get_safety_incidents', { _limit: 100 });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
    refetchInterval: 10_000,
  });

  const dispatch = async (panicId: string) => {
    await requireSupabase().functions.invoke('safety-alert-dispatch', { body: { panicId } });
    await queryClient.invalidateQueries({ queryKey: ['phase8', 'incidents'] });
  };

  const resolve = async (panicId: string) => {
    await requireSupabase().rpc('resolve_panic_event', { _panic_id: panicId });
    await queryClient.invalidateQueries({ queryKey: ['phase8', 'incidents'] });
  };

  return (
    <PageFrame title="Emergências" intro="Painel de segurança em tempo real." detail="Localização só aparece quando foi explicitamente partilhada e dentro da janela de retenção.">
      {isLoading ? <p className="text-sm text-bone-500">A carregar.</p> : null}
      {!data.length && !isLoading ? <EstadoVazio title="Sem incidentes activos." body="Os alertas de segurança são apresentados aqui quando existem." /> : null}
      <div className="space-y-3">
        {data.map((item) => { const panicId = item.panic_id; const when = item.panic_created_at ?? item.checkin_alerted_at; return <Ficha key={(panicId ?? '') + (item.checkin_id ?? '')} className="border-danger/20"><div className="flex flex-col gap-4 lg:flex-row lg:justify-between"><div><p className="flex items-center gap-2 text-sm font-semibold text-bone-50"><WarningCircle size={19} className="text-danger" />Alerta de segurança</p><p className="mt-1 text-xs text-bone-500">{panicId ? 'Pânico' : 'Check-in expirado'} · {when ? dt(when) : 'sem timestamp'}</p><p className="mt-3 text-xs text-bone-400">Partilha de localização: {item.panic_share_location ? 'sim' : 'não'}</p></div>{panicId ? <div className="flex flex-wrap gap-2"><Botao variant="outline" onClick={() => void dispatch(panicId)}>Disparar alerta</Botao><Botao onClick={() => void resolve(panicId)}>Resolver</Botao></div> : null}</div></Ficha>; })}
      </div>
    </PageFrame>
  );
}

export function Phase8CreatorSafetyPage() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [expectedEnd, setExpectedEnd] = useState(() => new Date(Date.now() + 60 * 60 * 1000).toISOString().slice(0, 16));
  const [shareLocation, setShareLocation] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const { data: contacts = [] } = useQuery({
    queryKey: ['phase8', 'trusted-contacts', user?.id],
    enabled: Boolean(user),
    queryFn: async () => {
      const { data, error } = await requireSupabase().from('trusted_contacts').select('id,display_name,phone,relationship,verified_at').order('created_at', { ascending: true });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const { data: checkin } = useQuery({
    queryKey: ['phase8', 'checkin', user?.id],
    enabled: Boolean(user),
    queryFn: async () => {
      const { data, error } = await requireSupabase().from('safety_checkins').select('id,expected_end,status,share_location').eq('status', 'active').order('created_at', { ascending: false }).limit(1).maybeSingle();
      if (error) throw new Error(error.message);
      return data;
    },
  });

  const addContact = async () => {
    if (!/^\+[1-9]\d{7,14}$/.test(contactPhone)) {
      setMessage('Usa o formato internacional, por exemplo +258XXXXXXXXX.');
      return;
    }
    const { error } = await requireSupabase().from('trusted_contacts').insert({ display_name: contactName.trim(), phone: contactPhone.trim() });
    if (error) setMessage('Não foi possível guardar o contacto.');
    else {
      setContactName('');
      setContactPhone('');
      setMessage('Contacto guardado. A verificação por SMS precisa de um provider de segurança configurado.');
      await queryClient.invalidateQueries({ queryKey: ['phase8', 'trusted-contacts', user?.id] });
    }
  };

  const deleteContact = async (id: string) => {
    await requireSupabase().from('trusted_contacts').delete().eq('id', id);
    await queryClient.invalidateQueries({ queryKey: ['phase8', 'trusted-contacts', user?.id] });
  };

  const startCheckin = async () => {
    setBusy(true);
    const { error } = await requireSupabase().rpc('create_safety_checkin', { _expected_end: toIso(expectedEnd), _tolerance_minutes: 15, _share_location: shareLocation });
    setMessage(error ? error.message : 'Check-in de segurança activo.');
    await queryClient.invalidateQueries({ queryKey: ['phase8', 'checkin', user?.id] });
    setBusy(false);
  };

  const confirm = async () => {
    if (!checkin?.id) return;
    const { error } = await requireSupabase().rpc('confirm_safety_checkin', { _checkin_id: checkin.id });
    setMessage(error ? error.message : 'Check-in confirmado.');
    await queryClient.invalidateQueries({ queryKey: ['phase8', 'checkin', user?.id] });
  };

  const panic = async () => {
    setBusy(true);
    setMessage(null);
    let locationId: string | null = null;
    if (shareLocation && navigator.geolocation) {
      locationId = await new Promise<string | null>((resolve) => {
        navigator.geolocation.getCurrentPosition(async (position) => {
          const { data, error } = await requireSupabase().rpc('add_safety_location', {
            _source: 'panic',
            _latitude: position.coords.latitude,
            _longitude: position.coords.longitude,
          });
          resolve(error ? null : (data as string));
        }, () => resolve(null), { enableHighAccuracy: false, timeout: 7000 });
      });
    }

    const { data, error } = await requireSupabase().rpc('create_panic_event', {
      _share_location: Boolean(locationId),
      _location_id: locationId,
    });
    if (error || !data) {
      setMessage(error?.message ?? 'Não foi possível criar o alerta.');
      setBusy(false);
      return;
    }

    const dispatch = await requireSupabase().functions.invoke('safety-alert-dispatch', { body: { panicId: data } });
    setMessage(dispatch.error ? 'Alerta criado. O painel de suporte recebeu o incidente.' : 'Alerta de segurança enviado.');
    setBusy(false);
  };

  return (
    <PageFrame title="Segurança" intro="Check-in, contacto de confiança e pânico." detail="A Prively não promete impedir incidentes. Estes mecanismos ajudam a acionar apoio e deixam um registo auditável.">
      <div className="grid gap-5 lg:grid-cols-2">
        <Ficha>
          <div className="flex items-center gap-3"><Phone size={21} className="text-crimson-400" /><h2 className="m-0 font-display text-3xl text-bone-50">Contacto de confiança</h2></div>
          <div className="mt-5 grid gap-3 md:grid-cols-2">
            <input value={contactName} onChange={(e) => setContactName(e.target.value)} placeholder="Nome" className="min-h-11 rounded-control border border-bone-50/10 bg-ink-900 px-3 text-sm text-bone-50" />
            <input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} placeholder="+258..." className="min-h-11 rounded-control border border-bone-50/10 bg-ink-900 px-3 text-sm text-bone-50" />
          </div>
          <Botao className="mt-3" onClick={() => void addContact()} disabled={!contactName.trim() || !contactPhone.trim()}><Plus size={17} />Adicionar</Botao>
          <div className="mt-5 space-y-2">
            {contacts.map((contact) => <div key={contact.id} className="flex items-center justify-between gap-3 border-t border-bone-50/7 pt-3"><div><p className="m-0 text-sm text-bone-50">{contact.display_name}</p><p className="text-xs text-bone-500">{contact.phone} · {contact.verified_at ? 'verificado' : 'não verificado'}</p></div><button type="button" onClick={() => void deleteContact(contact.id)} aria-label="Remover contacto" className="text-bone-500 hover:text-danger"><Trash size={18} /></button></div>)}
          </div>
        </Ficha>

        <Ficha>
          <div className="flex items-center gap-3"><Clock size={21} className="text-crimson-400" /><h2 className="m-0 font-display text-3xl text-bone-50">Check-in</h2></div>
          <label className="mt-5 block text-sm text-bone-300">Hora prevista de fim
            <input type="datetime-local" value={expectedEnd} onChange={(e) => setExpectedEnd(e.target.value)} className="mt-2 min-h-11 w-full rounded-control border border-bone-50/10 bg-ink-900 px-3 text-bone-50" />
          </label>
          <label className="mt-4 flex items-center gap-3 text-sm text-bone-300"><input type="checkbox" checked={shareLocation} onChange={(e) => setShareLocation(e.target.checked)} /> Partilhar localização durante o check-in</label>
          {checkin ? <div className="mt-5 rounded-md border border-ok/20 bg-ok/5 p-4"><p className="m-0 text-sm text-bone-50">Check-in activo até {dt(checkin.expected_end)}.</p><Botao className="mt-3" onClick={() => void confirm()}>Confirmar que está tudo bem</Botao></div> : <Botao className="mt-5" onClick={() => void startCheckin()} loading={busy}>Activar check-in</Botao>}
        </Ficha>
      </div>

      <Ficha variant="focus" className="mt-5 border-danger/25">
        <p className="m-0 flex items-center gap-3 text-sm font-semibold text-bone-50"><WarningCircle size={22} className="text-danger" />Precisa de ajuda agora?</p>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-bone-300">O botão de pânico cria um incidente imediato, notifica o suporte e tenta avisar os contactos verificados quando o serviço de alertas externo estiver configurado.</p>
        <Botao variant="danger" className="mt-4 min-h-12" onClick={() => void panic()} loading={busy}>Activar alerta de pânico</Botao>
        {message ? <p role="status" className="mt-3 text-sm text-bone-300">{message}</p> : null}
      </Ficha>
    </PageFrame>
  );
}

export function Phase8CreatorMeetingsPage() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [channelId, setChannelId] = useState('');
  const [startsAt, setStartsAt] = useState(() => new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 16));
  const [endsAt, setEndsAt] = useState(() => new Date(Date.now() + 25 * 60 * 60 * 1000).toISOString().slice(0, 16));
  const [areaLabel, setAreaLabel] = useState('');
  const { data: channels = [] } = useQuery({
    queryKey: ['phase8', 'creator-channels', user?.id],
    enabled: Boolean(user),
    queryFn: async () => {
      const { data, error } = await requireSupabase().from('channels').select('id,display_name,handle').eq('owner_id', user?.id);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  useEffect(() => { if (!channelId && channels[0]?.id) setChannelId(channels[0].id); }, [channels, channelId]);

  const { data: slots = [] } = useQuery({
    queryKey: ['phase8', 'creator-slots', channelId],
    enabled: Boolean(channelId),
    queryFn: async () => {
      const { data, error } = await requireSupabase().from('availability_slots').select('id,starts_at,ends_at,area_label').eq('channel_id', channelId).order('starts_at');
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const { data: requests = [] } = useQuery({
    queryKey: ['phase8', 'creator-meetings', channelId],
    enabled: Boolean(channelId),
    queryFn: async () => {
      const { data, error } = await requireSupabase().from('meeting_requests').select('id,client_id,proposed_at,status,safe_venue_id,note').eq('channel_id', channelId).order('created_at', { ascending: false });
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const addSlot = async () => {
    const { error } = await requireSupabase().from('availability_slots').insert({
      channel_id: channelId,
      starts_at: toIso(startsAt),
      ends_at: toIso(endsAt),
      area_label: areaLabel.trim() || null,
    });
    if (!error) {
      setAreaLabel('');
      await queryClient.invalidateQueries({ queryKey: ['phase8', 'creator-slots', channelId] });
    }
  };

  const respond = async (id: string, status: 'accepted' | 'declined') => {
    await requireSupabase().rpc('respond_meeting_request', { _request_id: id, _status: status });
    await queryClient.invalidateQueries({ queryKey: ['phase8', 'creator-meetings', channelId] });
  };

  return (
    <PageFrame title="Encontros sociais" intro="Agenda de disponibilidade e pedidos." detail="Este módulo não possui preço, pagamento, comissão, catálogo de serviços ou hotéis. A Prively só fornece agenda e mecanismos de segurança.">
      <Ficha>
        <div className="grid gap-4 md:grid-cols-4">
          <select value={channelId} onChange={(e) => setChannelId(e.target.value)} className="min-h-11 rounded-control border border-bone-50/10 bg-ink-900 px-3 text-bone-50">{channels.map((channel) => <option key={channel.id} value={channel.id}>{channel.display_name}</option>)}</select>
          <input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} className="min-h-11 rounded-control border border-bone-50/10 bg-ink-900 px-3 text-bone-50" />
          <input type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} className="min-h-11 rounded-control border border-bone-50/10 bg-ink-900 px-3 text-bone-50" />
          <input value={areaLabel} onChange={(e) => setAreaLabel(e.target.value)} placeholder="Cidade / bairro" className="min-h-11 rounded-control border border-bone-50/10 bg-ink-900 px-3 text-sm text-bone-50" />
        </div>
        <Botao className="mt-4" onClick={() => void addSlot()} disabled={!channelId}>Publicar disponibilidade</Botao>
      </Ficha>

      <div className="mt-5 grid gap-3">
        {slots.map((slot) => <Ficha key={slot.id}><div className="flex items-center justify-between gap-4"><div><p className="text-sm font-semibold text-bone-50">{dt(slot.starts_at)} → {dt(slot.ends_at)}</p><p className="text-xs text-bone-500">{slot.area_label ?? 'Área não definida'}</p></div></div></Ficha>)}
      </div>

      <div className="mt-8">
        <h2 className="font-display text-3xl text-bone-50">Pedidos recebidos</h2>
        <div className="mt-4 space-y-3">
          {requests.map((request) => <Ficha key={request.id}><div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between"><div><p className="text-sm text-bone-50">{dt(request.proposed_at)} · {request.status}</p><p className="mt-1 text-xs text-bone-500">Cliente {request.client_id.slice(0, 8)}</p>{request.note ? <p className="mt-3 text-sm text-bone-300">{request.note}</p> : null}<div className="mt-3"><ReportButton targetType="meeting" targetId={request.id} /></div></div>{request.status === 'pending' ? <div className="flex gap-2"><Botao onClick={() => void respond(request.id, 'accepted')}>Aceitar</Botao><Botao variant="outline" onClick={() => void respond(request.id, 'declined')}>Recusar</Botao></div> : null}</div></Ficha>)}
        </div>
      </div>
    </PageFrame>
  );
}

export function Phase8ClientMeetingsPage() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [slotId, setSlotId] = useState('');
  const [venueId, setVenueId] = useState('');
  const [proposedAt, setProposedAt] = useState('');
  const [note, setNote] = useState('');

  const { data: slots = [] } = useQuery({
    queryKey: ['phase8', 'public-slots'],
    queryFn: async () => {
      const { data, error } = await requireSupabase().from('availability_slots').select('id,channel_id,starts_at,ends_at,area_label').gte('ends_at', new Date().toISOString()).order('starts_at').limit(100);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });
  const channelIds = [...new Set(slots.map((slot) => slot.channel_id))];
  const channels = useQuery({
    queryKey: ['phase8', 'public-channel-names', channelIds.join(',')],
    enabled: channelIds.length > 0,
    queryFn: async () => {
      const ids = [...new Set(slots.map((slot) => slot.channel_id))];
      if (!ids.length) return [];
      const { data, error } = await requireSupabase().from('channels').select('id,display_name,handle').in('id', ids);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });
  const { data: venues = [] } = useQuery({
    queryKey: ['phase8', 'public-venues'],
    queryFn: async () => {
      const { data, error } = await requireSupabase().from('safe_venues').select('id,name,kind,city,bairro').eq('active', true).order('city').order('name');
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  useEffect(() => {
    if (!slotId && slots[0]) {
      setSlotId(slots[0].id);
      setProposedAt(slots[0].starts_at.slice(0, 16));
    }
  }, [slotId, slots]);

  const submit = async () => {
    const slot = slots.find((item) => item.id === slotId);
    if (!slot || !venueId) return;
    const { error } = await requireSupabase().rpc('create_meeting_request', {
      _channel_id: slot.channel_id,
      _availability_slot_id: slot.id,
      _safe_venue_id: venueId,
      _proposed_at: toIso(proposedAt),
      _note: note.trim() || null,
    });
    if (!error) {
      setNote('');
      await queryClient.invalidateQueries({ queryKey: ['phase8', 'public-slots'] });
    }
  };

  const myRequests = useQuery({
    queryKey: ['phase8', 'my-meetings', user?.id],
    enabled: Boolean(user),
    queryFn: async () => {
      const { data, error } = await requireSupabase().from('meeting_requests').select('id,channel_id,proposed_at,status,safe_venue_id,note').eq('client_id', user?.id).order('created_at', { ascending: false }).limit(50);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  return (
    <PageFrame title="Encontros sociais" intro="Agenda social com locais públicos." detail="Não existem preços, pagamentos ou comissão. A Prively não é parte do encontro. Hotéis e alojamentos não fazem parte da lista.">
      <Ficha>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="text-sm text-bone-300">Disponibilidade
            <select value={slotId} onChange={(e) => {
              const slot = slots.find((item) => item.id === e.target.value);
              setSlotId(e.target.value);
              setProposedAt(slot?.starts_at.slice(0, 16) ?? '');
            }} className="mt-2 min-h-11 w-full rounded-control border border-bone-50/10 bg-ink-900 px-3 text-bone-50">
              {slots.map((slot) => <option key={slot.id} value={slot.id}>{dt(slot.starts_at)} · {slot.area_label ?? 'Área a combinar'}</option>)}
            </select>
          </label>
          <label className="text-sm text-bone-300">Local público
            <select value={venueId} onChange={(e) => setVenueId(e.target.value)} className="mt-2 min-h-11 w-full rounded-control border border-bone-50/10 bg-ink-900 px-3 text-bone-50">
              <option value="">Escolher local</option>
              {venues.map((venue) => <option key={venue.id} value={venue.id}>{venue.name} · {venue.city}</option>)}
            </select>
          </label>
        </div>
        <label className="mt-4 block text-sm text-bone-300">Nota
          <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} rows={3} className="mt-2 w-full rounded-control border border-bone-50/10 bg-ink-900 px-3 py-3 text-sm text-bone-50" />
        </label>
        <Botao className="mt-4" onClick={() => void submit()} disabled={!slotId || !venueId || !proposedAt}>Enviar pedido</Botao>
      </Ficha>

      <div className="mt-6 space-y-3">
        {!slots.length ? <EstadoVazio title="Ainda não há disponibilidades." body="As criadoras publicam aqui as janelas abertas para encontros sociais." /> : null}
        {myRequests.data?.map((request) => <Ficha key={request.id}><div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between"><div><p className="text-sm text-bone-50">{dt(request.proposed_at)} · {request.status}</p><p className="mt-1 text-xs text-bone-500">{channels.data?.find((channel) => channel.id === request.channel_id)?.display_name ?? 'Canal'}</p></div><ReportButton targetType="meeting" targetId={request.id} /></div></Ficha>)}
      </div>
    </PageFrame>
  );
}

export function Phase8DmcaPage() {
  const [claimantName, setClaimantName] = useState('');
  const [claimantEmail, setClaimantEmail] = useState('');
  const [work, setWork] = useState('');
  const [url, setUrl] = useState('');
  const [statement, setStatement] = useState('');
  const [signature, setSignature] = useState('');
  const [status, setStatus] = useState<'idle' | 'sent' | 'error'>('idle');

  const submit = async () => {
    const { error } = await requireSupabase().from('dmca_requests').insert({
      claimant_name: claimantName.trim(),
      claimant_email: claimantEmail.trim(),
      copyrighted_work: work.trim(),
      target_url: url.trim(),
      statement: statement.trim(),
      signature_name: signature.trim(),
    });
    setStatus(error ? 'error' : 'sent');
  };

  if (status === 'sent') return <PageFrame title="Remoção de conteúdo" intro="Pedido recebido." detail="O pedido foi registado para revisão jurídica e de moderação."><Ficha><p className="m-0 text-sm text-bone-300">O estado do pedido será tratado pela equipa responsável.</p></Ficha></PageFrame>;

  return (
    <PageFrame title="Remoção de conteúdo" intro="DMCA e direitos de autor." detail="Fornece apenas os dados necessários para avaliar o pedido.">
      <Ficha className="space-y-4">
        <input value={claimantName} onChange={(e) => setClaimantName(e.target.value)} placeholder="Nome do titular" className="min-h-11 w-full rounded-control border border-bone-50/10 bg-ink-900 px-3 text-sm text-bone-50" />
        <input type="email" value={claimantEmail} onChange={(e) => setClaimantEmail(e.target.value)} placeholder="Email do titular" className="min-h-11 w-full rounded-control border border-bone-50/10 bg-ink-900 px-3 text-sm text-bone-50" />
        <input value={work} onChange={(e) => setWork(e.target.value)} placeholder="Obra protegida" className="min-h-11 w-full rounded-control border border-bone-50/10 bg-ink-900 px-3 text-sm text-bone-50" />
        <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="URL do conteúdo" className="min-h-11 w-full rounded-control border border-bone-50/10 bg-ink-900 px-3 text-sm text-bone-50" />
        <textarea value={statement} onChange={(e) => setStatement(e.target.value)} placeholder="Declaração e fundamento do pedido" rows={6} className="w-full rounded-control border border-bone-50/10 bg-ink-900 px-3 py-3 text-sm text-bone-50" />
        <input value={signature} onChange={(e) => setSignature(e.target.value)} placeholder="Assinatura" className="min-h-11 w-full rounded-control border border-bone-50/10 bg-ink-900 px-3 text-sm text-bone-50" />
        {status === 'error' ? <p role="alert" className="text-sm text-danger">Não foi possível registar o pedido.</p> : null}
        <Botao onClick={() => void submit()} disabled={!claimantName || !claimantEmail || statement.length < 20 || !signature}>Enviar pedido</Botao>
      </Ficha>
    </PageFrame>
  );
}
