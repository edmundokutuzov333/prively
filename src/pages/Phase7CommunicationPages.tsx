import { useEffect, useRef, useState } from 'react';
import { Bell, LockKey, Paperclip, PaperPlaneTilt, WarningCircle, CheckCircle } from '@phosphor-icons/react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/app/session';
import { useConversationPresence, useMessages, type ChatAttachment, type ChatMessage } from '@/features/chat/useMessages';
import { Ficha } from '@/design/Ficha';
import { Botao } from '@/design/Botao';
import { EstadoVazio } from '@/design/EstadoVazio';
import { requireSupabase } from '@/lib/supabase';
import { formatMznFromCents } from '@/lib/money';
import { useFeatureFlags } from '@/features/feature-flags/useFeatureFlags';
import { getVapidPublicKey, registerPushForCurrentUser } from '@/lib/push';
import { PageFrame } from '@/pages/PageFrame';
import { ReportButton } from '@/features/safety/ReportButton';

const PRIVACY_NOTICE = 'As tuas conversas são privadas. Ficam protegidas com cifragem em trânsito e em repouso, e no dia-a-dia só as pessoas na conversa as vêem. Para segurança e cumprimento da lei, a equipa de moderação pode analisar conteúdo denunciado ou sinalizado, e a Prively pode ser obrigada a partilhar dados com as autoridades.';

function PrivacyNotice() {
  const { user } = useAuth();
  const [visible, setVisible] = useState(() => window.localStorage.getItem('prively.chat.privacy-notice') !== '1');
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState(false);
  if (!visible) return null;

  const accept = async () => {
    if (!user || accepting) return;
    setAccepting(true);
    setError(false);
    const { error: rpcError } = await requireSupabase().rpc('accept_communication_privacy', {
      _surface: 'conversation',
      _version: '1.0',
    });
    if (rpcError) {
      setError(true);
      setAccepting(false);
      return;
    }
    window.localStorage.setItem('prively.chat.privacy-notice', '1');
    setVisible(false);
    setAccepting(false);
  };

  return <Ficha variant="flat" className="mb-4 border-crimson-400/20 bg-wine-900/35 p-4">
    <p className="m-0 text-sm leading-6 text-bone-300">
      {PRIVACY_NOTICE} <Link to="/legal/privacidade" className="text-bone-50 underline underline-offset-4">Saber mais</Link>
    </p>
    {error ? <p role="alert" className="mt-3 text-sm text-danger">Não foi possível registar o aviso. Tenta novamente.</p> : null}
    <button type="button" disabled={accepting || !user} onClick={() => void accept()} className="mt-3 min-h-11 rounded-control border border-bone-50/10 px-3 text-sm text-bone-50 disabled:opacity-60">
      {accepting ? 'A registar…' : 'Continuar'}
    </button>
  </Ficha>;
}

type Conversation = {
  id: string;
  client_id: string;
  creator_id: string;
  channel_id: string;
  created_at: string;
};

type Channel = { id: string; display_name: string; handle: string };
type ConversationRow = Conversation & { channel?: Channel; lastMessage?: ChatMessage };

function LoginRedirect() {
  const navigate = useNavigate();
  useEffect(() => { navigate('/entrar', { replace: true }); }, [navigate]);
  return null;
}

export function Phase7MessagesPage() {
  const { user } = useAuth();
  const supabase = requireSupabase();
  const { data, isLoading, error } = useQuery({
    queryKey: ['phase7', 'conversations', user?.id],
    enabled: Boolean(user),
    queryFn: async () => {
      if (!user) return [];
      const { data: conversations, error: conversationError } = await supabase
        .from('conversations')
        .select('id,client_id,creator_id,channel_id,created_at')
        .or('client_id.eq.' + user.id + ',creator_id.eq.' + user.id)
        .order('created_at', { ascending: false });

      if (conversationError) throw new Error(conversationError.code ?? conversationError.message);
      const rows = (conversations ?? []) as Conversation[];
      const channelIds = [...new Set(rows.map((row) => row.channel_id))];

      const { data: channelRows } = channelIds.length
        ? await supabase.from('channels').select('id,display_name,handle').in('id', channelIds)
        : { data: [] as Channel[] };

      const { data: messages } = rows.length
        ? await supabase
            .from('messages')
            .select('id,conversation_id,sender_id,kind,body,price,locked_content_id,created_at,read_at,updated_at')
            .in('conversation_id', rows.map((row) => row.id))
            .order('created_at', { ascending: false })
        : { data: [] as ChatMessage[] };

      return rows.map((conversation) => ({
        ...conversation,
        channel: (channelRows ?? []).find((channel) => channel.id === conversation.channel_id) as Channel | undefined,
        lastMessage: (messages ?? []).find((message) => message.conversation_id === conversation.id) as ChatMessage | undefined,
      })) as ConversationRow[];
    },
    staleTime: 5_000,
  });

  if (!user) return <LoginRedirect />;
  if (isLoading) return <PageFrame title="Mensagens" intro="Conversas privadas"><p className="text-sm text-bone-500">A carregar conversas.</p></PageFrame>;
  if (error) return <PageFrame title="Mensagens" intro="Conversas privadas"><p role="alert" className="text-sm text-danger">Não foi possível carregar as conversas.</p></PageFrame>;

  const rows = data ?? [];
  return <PageFrame title="Mensagens" intro="Conversas privadas">
    {!rows.length ? <EstadoVazio title="Ainda não tens conversas." body="As conversas aparecem quando existe uma relação autorizada com uma criadora." /> : null}
    <div className="grid gap-3">
      {rows.map((row) => <Link key={row.id} to={'/mensagens/' + row.id} className="no-underline">
        <Ficha className="transition-colors hover:border-crimson-400/25">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="m-0 truncate text-base font-semibold text-bone-50">{row.channel?.display_name ?? 'Conversa privada'}</p>
              <p className="mt-1 truncate text-sm text-bone-500">@{row.channel?.handle ?? 'privado'}</p>
              <p className="mt-3 truncate text-sm text-bone-300">{row.lastMessage?.locked_content_id && !row.lastMessage.body ? 'Mensagem bloqueada' : row.lastMessage?.body ?? 'Sem mensagens'}</p>
            </div>
            <span className="text-xs text-bone-500">{row.lastMessage ? new Date(row.lastMessage.created_at).toLocaleDateString('pt-PT') : ''}</span>
          </div>
        </Ficha>
      </Link>)}
    </div>
  </PageFrame>;
}

function MessageBubble({
  message,
  own,
  onUnlock,
  onAttachment,
  onTranslate,
}: {
  message: ChatMessage;
  own: boolean;
  onUnlock: () => void;
  onAttachment: (attachment: ChatAttachment) => void;
  onTranslate: () => Promise<string | null>;
}) {
  const [translation, setTranslation] = useState<string | null>(null);
  const [translating, setTranslating] = useState(false);
  const isLocked = Boolean(message.price && message.locked_content_id && !message.locked_body && !own);
  const displayBody = message.locked_content_id ? (message.locked_body ?? null) : message.body;

  return <div className={own ? 'flex justify-end' : 'flex justify-start'}>
    <div className={own ? 'max-w-[85%] rounded-surface border border-crimson-400/20 bg-wine-900/45 px-4 py-3' : 'max-w-[85%] rounded-surface border border-bone-50/8 bg-ink-900 px-4 py-3'}>
      {isLocked ? <button type="button" onClick={onUnlock} className="flex items-center gap-3 text-left">
        <LockKey size={22} weight="duotone" className="text-crimson-400" />
        <span>
          <span className="block text-sm font-semibold text-bone-50">Mensagem bloqueada</span>
          <span className="mt-1 block font-display text-xl text-bone-50">{formatMznFromCents(message.price as number)}</span>
          <span className="mt-1 block text-xs text-bone-500">Desbloquear para ler</span>
        </span>
      </button> : <><p className="m-0 whitespace-pre-wrap text-sm leading-6 text-bone-50">{translation ?? displayBody ?? ''}</p>{displayBody ? <button type="button" className="mt-2 min-h-11 text-xs text-bone-400 underline" disabled={translating} onClick={() => { if (translation) { setTranslation(null); return; } setTranslating(true); void onTranslate().then(setTranslation).finally(() => setTranslating(false)); }}>{translation ? 'Ver original' : translating ? 'A traduzir…' : 'Traduzir'}</button> : null}</>}

      {message.attachments?.map((attachment) => <button
        key={attachment.id}
        type="button"
        onClick={() => onAttachment(attachment)}
        className="mt-3 flex min-h-11 w-full items-center gap-2 rounded-control border border-bone-50/10 px-3 text-left text-sm text-bone-300 hover:text-bone-50"
      >
        <Paperclip size={17} weight="duotone" /> Anexo protegido
      </button>)}

      <div className="mt-2 flex items-center justify-end gap-2 text-[11px] text-bone-500">
        <span>{new Date(message.created_at).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })}</span>
        {own ? <span>{message.read_at ? 'Visto' : 'Enviado'}</span> : null}
        {!own ? <ReportButton targetType="message" targetId={message.id} label="Denunciar mensagem" /> : null}
      </div>
    </div>
  </div>;
}

export function Phase7MessagePage() {
  const { user } = useAuth();
  const { flags } = useFeatureFlags();
  const { id = '' } = useParams();
  const supabase = requireSupabase();
  const queryClient = useQueryClient();
  const { data: messages = [], isLoading, error } = useMessages(id);
  const { typingUsers, setTyping } = useConversationPresence(id, user?.id ?? null);
  const [text, setText] = useState('');
  const [attachmentId, setAttachmentId] = useState<string | null>(null);
  const [attachmentKind, setAttachmentKind] = useState<'image' | 'video' | 'audio' | null>(null);
  const [uploading, setUploading] = useState(false);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const endRef = useRef<HTMLDivElement>(null);

  const { data: conversation } = useQuery({
    queryKey: ['phase7', 'conversation', id],
    enabled: Boolean(id),
    queryFn: async () => {
      const { data: row, error: rowError } = await supabase
        .from('conversations')
        .select('id,client_id,creator_id,channel_id')
        .eq('id', id)
        .maybeSingle();
      if (rowError || !row) throw new Error(rowError?.code ?? 'conversation_not_found');

      const { data: channel } = await supabase.from('channels').select('id,display_name,handle').eq('id', row.channel_id).maybeSingle();
      return { ...row, channel };
    },
  });

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  useEffect(() => {
    const unread = messages.filter((message) => message.sender_id !== user?.id && !message.read_at).slice(-10);
    if (!unread.length) return;
    void Promise.all(unread.map((message) => supabase.rpc('mark_message_read', { _message: message.id })))
      .then(() => queryClient.invalidateQueries({ queryKey: ['phase7', 'messages', id] }));
  }, [messages, id, queryClient, supabase, user?.id]);

  const send = async () => {
    if (!flags.messaging || ((!text.trim() && !attachmentId) || uploading)) return;
    setErrorCode(null);
    const kind = attachmentKind ?? 'text';
    const { error: sendError } = await supabase.rpc('send_message_guarded', {
      _conversation: id,
      _body: text.trim() || null,
      _kind: kind,
      _attachment_id: attachmentId,
      _idem: crypto.randomUUID(),
    });
    if (sendError) {
      setErrorCode(sendError.code ?? sendError.message);
      return;
    }

    setText('');
    setAttachmentId(null);
    setAttachmentKind(null);
    setTyping(false);
  };

  const selectAttachment = async (file: File) => {
    setUploading(true);
    setErrorCode(null);

    const kind: 'image' | 'video' | 'audio' = file.type.startsWith('image/')
      ? 'image'
      : file.type.startsWith('video/')
        ? 'video'
        : 'audio';

    const result = await supabase.functions.invoke('chat-attachment-upload-url', {
      body: {
        conversationId: id,
        mimeType: file.type,
        fileSize: file.size,
        fileName: file.name,
      },
    });

    if (result.error || !result.data?.attachmentId) {
      setErrorCode(result.error?.message ?? 'Não foi possível preparar o anexo.');
      setUploading(false);
      return;
    }

    const uploaded = await supabase.storage
      .from('prively-chat')
      .uploadToSignedUrl(result.data.path as string, result.data.token as string, file);

    if (uploaded.error) {
      setErrorCode(uploaded.error.message);
      setUploading(false);
      return;
    }

    setAttachmentId(result.data.attachmentId as string);
    setAttachmentKind(kind);
    setUploading(false);
  };

  const openAttachment = async (attachment: ChatAttachment) => {
    const result = await supabase.functions.invoke('chat-attachment-url', { body: { attachmentId: attachment.id } });
    if (result.error || !result.data?.url) {
      setErrorCode(result.error?.message ?? 'Não foi possível abrir o anexo.');
      return;
    }
    window.open(result.data.url as string, '_blank', 'noopener,noreferrer');
  };

  const unlock = async (message: ChatMessage) => {
    if (!message.price) return;
    setErrorCode(null);
    const { error: rpcError } = await supabase.rpc('unlock_message', {
      _message: message.id,
      _idem: 'unlock:' + message.id + ':' + crypto.randomUUID(),
    });
    if (rpcError) {
      setErrorCode(rpcError.code ?? rpcError.message);
      return;
    }
    setNotice('Mensagem desbloqueada.');
    await queryClient.invalidateQueries({ queryKey: ['phase7', 'messages', id] });
  };

  if (!user) return <LoginRedirect />;
  if (isLoading) return <PageFrame title="Conversa" intro="Mensagens privadas"><p className="text-sm text-bone-500">A carregar conversa.</p></PageFrame>;
  if (error || !conversation) return <PageFrame title="Conversa" intro="Mensagens privadas"><p role="alert" className="text-sm text-danger">A conversa não está disponível.</p></PageFrame>;

  return <PageFrame title={conversation.channel?.display_name ?? 'Conversa'} intro={'@' + (conversation.channel?.handle ?? 'privado')}>
    <PrivacyNotice />
    <div className="space-y-3">
      {messages.map((message) => <MessageBubble
        key={message.id}
        message={message}
        own={message.sender_id === user.id}
        onUnlock={() => void unlock(message)}
        onAttachment={(attachment) => void openAttachment(attachment)}
        onTranslate={async () => {
          const result = await supabase.functions.invoke('translate-message', { body: { messageId: message.id, language: 'pt-MZ' } });
          if (result.error) { setErrorCode(result.error.message); return null; }
          return typeof result.data?.translation === 'string' ? result.data.translation : null;
        }}
      />)}
      {!messages.length ? <EstadoVazio title="Ainda não há mensagens." body="Envia uma mensagem quando a conversa estiver pronta." /> : null}
      {typingUsers.length ? <p className="m-0 text-xs text-bone-500">A escrever</p> : null}
      <div ref={endRef} />
    </div>

    <div className="sticky bottom-16 mt-5 border-t border-bone-50/7 bg-ink-950/95 pt-3 md:bottom-0">
      {notice ? <p className="mb-2 flex items-center gap-2 text-sm text-ok"><CheckCircle size={18} weight="duotone" />{notice}</p> : null}
      {errorCode ? <p role="alert" className="mb-2 flex items-center gap-2 text-sm text-danger"><WarningCircle size={18} weight="duotone" />{errorCode}</p> : null}
      {attachmentId ? <p className="mb-2 text-xs text-bone-500">Anexo pronto para envio.</p> : null}
      <div className="flex items-end gap-2">
        <label className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-control border border-bone-50/10 text-bone-300 hover:text-bone-50">
          <Paperclip size={20} weight="duotone" />
          <input type="file" accept="image/*,video/*,audio/*" className="sr-only" onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void selectAttachment(file);
            event.currentTarget.value = '';
          }} />
        </label>
        <textarea
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            setTyping(event.target.value.length > 0);
          }}
          onBlur={() => setTyping(false)}
          rows={1}
          maxLength={5000}
          placeholder="Escreve uma mensagem"
          className="min-h-11 flex-1 resize-none rounded-control border border-bone-50/10 bg-ink-900 px-3 py-3 text-sm text-bone-50"
        />
        <Botao type="button" onClick={() => void send()} disabled={!flags.messaging || uploading || (!text.trim() && !attachmentId)}>
          <PaperPlaneTilt size={18} weight="duotone" />Enviar
        </Botao>
      </div>
    </div>
  </PageFrame>;
}

export function Phase7NotificationsPage() {
  const { user } = useAuth();
  const { flags } = useFeatureFlags();
  const supabase = requireSupabase();
  const queryClient = useQueryClient();
  const [pushState, setPushState] = useState<'idle' | 'enabled' | 'error'>('idle');
  const pushConfigured = flags.push && Boolean(getVapidPublicKey());

  const { data: notifications = [], isLoading } = useQuery({
    queryKey: ['phase7', 'notifications', user?.id],
    enabled: Boolean(user),
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from('notifications')
        .select('id,kind,payload,read_at,created_at')
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw new Error(error.code ?? error.message);
      return data ?? [];
    },
  });

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel('notifications:' + user.id)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: 'user_id=eq.' + user.id },
        () => { void queryClient.invalidateQueries({ queryKey: ['phase7', 'notifications', user.id] }); },
      )
      .subscribe();

    return () => { void supabase.removeChannel(channel); };
  }, [queryClient, supabase, user?.id]);

  if (!user) return <LoginRedirect />;
  const enablePush = async () => {
    setPushState('idle');
    try {
      await registerPushForCurrentUser();
      setPushState('enabled');
    } catch {
      setPushState('error');
    }
  };

  return <PageFrame title="Notificações" intro="Actividade da tua conta">
    {pushConfigured ? <Ficha variant="flat" className="mb-4 border-bone-50/10">
      <p className="m-0 text-sm text-bone-300">Recebe notificações neutras neste dispositivo.</p>
      <Botao type="button" className="mt-3" onClick={() => void enablePush()}>Activar notificações</Botao>
      {pushState === 'enabled' ? <p className="mt-2 text-xs text-ok">Notificações activas neste dispositivo.</p> : null}
      {pushState === 'error' ? <p className="mt-2 text-xs text-danger">Não foi possível activar as notificações neste dispositivo.</p> : null}
    </Ficha> : null}
    {isLoading ? <p className="text-sm text-bone-500">A carregar.</p> : null}
    {!notifications.length && !isLoading ? <EstadoVazio title="Ainda não tens notificações." body="Actividade relevante aparece aqui sem expor conteúdo sensível." /> : null}
    <div className="grid gap-3">
      {notifications.map((item) => <button key={item.id} type="button" onClick={() => {
        void supabase.rpc('mark_notification_read', { _notification: item.id });
        void queryClient.invalidateQueries({ queryKey: ['phase7', 'notifications', user.id] });
      }} className="text-left">
        <Ficha className={item.read_at ? 'opacity-70' : 'border-crimson-400/20'}>
          <div className="flex gap-3">
            <Bell size={20} weight="duotone" className="mt-0.5 text-crimson-400" />
            <div>
              <p className="m-0 text-sm font-semibold text-bone-50">
                {item.kind === 'message' ? 'Tens uma nova mensagem' : item.kind === 'follow' ? 'Alguém começou a seguir um canal' : 'Actividade na tua conta'}
              </p>
              <p className="mt-1 text-xs text-bone-500">{new Date(item.created_at).toLocaleDateString('pt-PT')}</p>
            </div>
          </div>
        </Ficha>
      </button>)}
    </div>
  </PageFrame>;
}
