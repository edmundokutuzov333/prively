import { useEffect, useState } from 'react';
import { Ficha } from '@/design/Ficha';
import { Botao } from '@/design/Botao';
import { PageFrame } from '@/pages/PageFrame';
import { useAuth } from '@/app/session';
import { requireSupabase } from '@/lib/supabase';
import { UserCircle, LockKey } from '@phosphor-icons/react';

type Channel = { id: string; display_name: string; handle: string };

type TargetUser = { id: string; handle: string; display_name: string };

export function CreatorSafetyControlsPage() {
  const { user } = useAuth();
  const [channels, setChannels] = useState<Channel[]>([]);
  const [users, setUsers] = useState<TargetUser[]>([]);
  const [targetId, setTargetId] = useState('');
  const [channelId, setChannelId] = useState('');
  const [hidden, setHidden] = useState<string[]>([]);
  const [muted, setMuted] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = async () => {
    if (!user) return;
    try {
      const sb = requireSupabase();
      const channelResult = await sb.from('channels').select('id,display_name,handle').eq('owner_id', user.id).order('created_at').limit(20);
      if (channelResult.error) throw channelResult.error;
      setChannels(channelResult.data ?? []);
      if (!channelId && channelResult.data?.[0]) setChannelId(channelResult.data[0].id);

      const [blocks, mutes, hides] = await Promise.all([
        sb.from('blocks').select('blocked_user_id').eq('owner_id', user.id).limit(200),
        sb.from('mutes').select('muted_user_id').eq('owner_id', user.id).limit(200),
        sb.from('hidden_from').select('channel_id').eq('user_id', user.id).limit(200),
      ]);
      if (blocks.error) throw blocks.error;
      if (mutes.error) throw mutes.error;
      if (hides.error) throw hides.error;
      const blockedIds = (blocks.data ?? []).map((row) => String(row.blocked_user_id));
      const mutedIds = (mutes.data ?? []).map((row) => String(row.muted_user_id));
      setMuted(mutedIds);
      setHidden((hides.data ?? []).map((row) => String(row.channel_id)));

      if (blockedIds.length || mutedIds.length) {
        const ids = [...new Set([...blockedIds, ...mutedIds])];
        const profiles = await sb.from('profiles').select('id,handle,display_name').in('id', ids);
        if (!profiles.error) setUsers((profiles.data ?? []) as TargetUser[]);
      } else {
        setUsers([]);
      }
    } catch (value: unknown) {
      setError(value instanceof Error ? value.message : 'Falha ao carregar controlos.');
    }
  };

  useEffect(() => { void load(); }, [user]);

  const act = async (action: 'block' | 'unblock' | 'mute' | 'unmute') => {
    if (!targetId) return;
    const rpc = action === 'block' ? 'block_user'
      : action === 'unblock' ? 'unblock_user'
      : action === 'mute' ? 'mute_user'
      : 'unmute_user';
    const { error: rpcError } = await requireSupabase().rpc(rpc, { _blocked: targetId, _muted: targetId });
    if (rpcError) setError(rpcError.message);
    else {
      setNotice('Alteração guardada no servidor.');
      await load();
    }
  };

  const hide = async () => {
    if (!channelId) return;
    const { error: rpcError } = await requireSupabase().rpc('hide_creator_from_feed', { _channel: channelId });
    if (rpcError) setError(rpcError.message);
    else {
      setNotice('O perfil foi retirado da tua descoberta.');
      await load();
    }
  };

  const show = async () => {
    if (!channelId) return;
    const { error: rpcError } = await requireSupabase().rpc('show_creator_in_feed', { _channel: channelId });
    if (rpcError) setError(rpcError.message);
    else {
      setNotice('O perfil voltou à descoberta.');
      await load();
    }
  };

  return <PageFrame icon={LockKey} title="Bloqueios e visibilidade" intro="As regras são persistidas no servidor, não apenas no ecrã.">
    {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
    {notice ? <p role="status" className="text-sm text-ok">{notice}</p> : null}
    <Ficha className="p-5">
      <div className="flex items-center gap-2"><UserCircle size={20} /><h2 className="text-lg text-bone-50">Utilizador</h2></div>
      <p className="mt-2 text-sm text-bone-400">Introduz o ID de utilizador para bloquear, desbloquear, silenciar ou remover do teu alcance.</p>
      <input value={targetId} onChange={(event) => setTargetId(event.target.value)} placeholder="UUID do utilizador" className="mt-4 min-h-11 w-full rounded-md bg-ink-800 px-3 text-sm text-bone-50" />
      <div className="mt-4 flex flex-wrap gap-2">
        <Botao variant="danger" onClick={() => void act('block')}>Bloquear</Botao>
        <Botao variant="outline" onClick={() => void act('unblock')}>Desbloquear</Botao>
        <Botao variant="outline" onClick={() => void act('mute')}>Silenciar</Botao>
        <Botao variant="outline" onClick={() => void act('unmute')}>Remover silêncio</Botao>
      </div>
    </Ficha>

    <Ficha className="mt-4 p-5">
      <h2 className="text-lg text-bone-50">Não mostrar</h2>
      <select value={channelId} onChange={(event) => setChannelId(event.target.value)} className="mt-3 min-h-11 w-full rounded-md bg-ink-800 px-3 text-sm text-bone-50">
        <option value="">Escolher canal</option>
        {channels.map((channel) => <option key={channel.id} value={channel.id}>{channel.display_name} · @{channel.handle}</option>)}
      </select>
      <div className="mt-3 flex flex-wrap gap-2">
        <Botao onClick={() => void hide()} disabled={!channelId}>Não mostrar</Botao>
        <Botao variant="outline" onClick={() => void show()} disabled={!channelId}>Voltar a mostrar</Botao>
      </div>
      {hidden.length ? <p className="mt-3 text-xs text-bone-500">{hidden.length} perfil(is) escondido(s).</p> : null}
      {muted.length ? <p className="mt-1 text-xs text-bone-500">{muted.length} utilizador(es) silenciado(s).</p> : null}
    </Ficha>
  </PageFrame>;
}
