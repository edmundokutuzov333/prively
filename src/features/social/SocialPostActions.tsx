import { useEffect, useMemo, useState } from 'react';
import { Heart, LockKey, UserPlus, UserMinus, ChatCircleText, BookmarkSimple } from '@phosphor-icons/react';
import { Botao } from '@/design/Botao';
import { Ficha } from '@/design/Ficha';
import { requireSupabase } from '@/lib/supabase';
import { useAuth } from '@/app/session';
import { ReportButton } from '@/features/safety/ReportButton';

type Props = { postId: string };

type CommentRow = {
  id: string;
  user_id: string;
  body: string;
  created_at: string;
};

export function SocialPostActions({ postId }: Props) {
  const supabase = requireSupabase();
  const { user } = useAuth();
  const [channelId, setChannelId] = useState('');
  const [ownerId, setOwnerId] = useState('');
  const [following, setFollowing] = useState(false);
  const [saved, setSaved] = useState(false);
  const [reactionActive, setReactionActive] = useState(false);
  const [reactionCount, setReactionCount] = useState(0);
  const [comments, setComments] = useState<CommentRow[]>([]);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const reload = async () => {
    if (!user) return;
    const { data: post } = await supabase.from('posts').select('channel_id').eq('id', postId).maybeSingle();
    if (!post?.channel_id) return;
    setChannelId(post.channel_id);

    const { data: channel } = await supabase.from('channels').select('id,owner_id').eq('id', post.channel_id).maybeSingle();
    if (!channel) return;
    setOwnerId(channel.owner_id);

    const [{ data: follow }, { data: wishlist }, { data: reactions }, { data: commentRows }] = await Promise.all([
      supabase.from('follows').select('channel_id').eq('channel_id', post.channel_id).eq('follower_id', user.id).maybeSingle(),
      supabase.from('wishlist').select('post_id').eq('post_id', postId).eq('user_id', user.id).maybeSingle(),
      supabase.from('reactions').select('reaction_type').eq('post_id', postId).eq('reaction_type', 'like'),
      supabase.from('comments').select('id,user_id,body,created_at').eq('post_id', postId).is('deleted_at', null).order('created_at', { ascending: true }).limit(80),
    ]);

    setFollowing(Boolean(follow));
    setSaved(Boolean(wishlist));
    setReactionActive(Boolean(reactions?.some((row) => row.reaction_type === 'like')));
    setReactionCount((reactions ?? []).length);
    setComments((commentRows ?? []) as CommentRow[]);
  };

  useEffect(() => {
    void reload();
  }, [postId, user?.id]);

  const submitComment = async () => {
    if (!comment.trim()) return;
    setBusy(true);
    setError(null);
    const { error: rpcError } = await supabase.rpc('add_comment', {
      _post: postId,
      _body: comment.trim(),
      _parent: null,
    });
    if (rpcError) setError(rpcError.code ?? rpcError.message);
    else setComment('');
    await reload();
    setBusy(false);
  };

  const toggleFollow = async () => {
    if (!channelId) return;
    setBusy(true);
    setError(null);
    const { error: rpcError } = await supabase.rpc(following ? 'unfollow_channel' : 'follow_channel', { _channel: channelId });
    if (rpcError) setError(rpcError.code ?? rpcError.message);
    await reload();
    setBusy(false);
  };

  const toggleLike = async () => {
    setBusy(true);
    setError(null);
    const { error: rpcError } = await supabase.rpc('toggle_reaction', { _post: postId, _type: 'like' });
    if (rpcError) setError(rpcError.code ?? rpcError.message);
    await reload();
    setBusy(false);
  };

  const toggleWishlist = async () => {
    setBusy(true);
    setError(null);
    const { error: rpcError } = await supabase.rpc(saved ? 'remove_wishlist' : 'add_wishlist', { _post: postId });
    if (rpcError) setError(rpcError.code ?? rpcError.message);
    await reload();
    setBusy(false);
  };

  const blockOwner = async () => {
    if (!ownerId) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    const { error: rpcError } = await supabase.rpc('block_user', { _blocked: ownerId });
    if (rpcError) setError(rpcError.code ?? rpcError.message);
    else setNotice('A conta foi bloqueada. O conteúdo e a comunicação com esta conta deixam de estar disponíveis.');
    setBusy(false);
  };

  const labels = useMemo(() => ({
    follow: following ? 'Deixar de seguir' : 'Seguir',
    like: reactionActive ? 'Retirar gosto' : 'Gostar',
    save: saved ? 'Retirar da lista' : 'Guardar',
  }), [following, reactionActive, saved]);

  if (!user) return null;

  return <section className="mt-6 space-y-4" aria-label="Interacção social">
    <div className="flex flex-wrap gap-2">
      <Botao type="button" variant="outline" onClick={() => void toggleFollow()} disabled={busy}>
        {following ? <UserMinus size={18} weight="duotone" /> : <UserPlus size={18} weight="duotone" />}
        {labels.follow}
      </Botao>
      <Botao type="button" variant="outline" onClick={() => void toggleLike()} disabled={busy}>
        <Heart size={18} weight="duotone" /> {labels.like} · {reactionCount}
      </Botao>
      <Botao type="button" variant="outline" onClick={() => void toggleWishlist()} disabled={busy}>
        <BookmarkSimple size={18} weight="duotone" /> {labels.save}
      </Botao>
      <ReportButton targetType="post" targetId={postId} />
      {ownerId && ownerId !== user.id ? <Botao type="button" variant="danger" onClick={() => void blockOwner()} disabled={busy}>
        <LockKey size={18} weight="duotone" /> Bloquear
      </Botao> : null}
    </div>

    {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
    {notice ? <p role="status" className="text-sm text-ok">{notice}</p> : null}

    <Ficha>
      <div className="flex items-center gap-2">
        <ChatCircleText size={20} weight="duotone" className="text-crimson-400" />
        <h2 className="m-0 font-display text-2xl text-bone-50">Comentários</h2>
      </div>
      <div className="mt-4 flex gap-2">
        <input
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          maxLength={2000}
          className="min-h-11 flex-1 rounded-control border border-bone-50/10 bg-ink-900 px-3 text-sm text-bone-50"
          placeholder="Escreve um comentário"
          aria-label="Comentário"
        />
        <Botao type="button" onClick={() => void submitComment()} disabled={busy || !comment.trim()}>Comentar</Botao>
      </div>
      <div className="mt-4 space-y-3">
        {comments.map((item) => <div key={item.id} className="border-t border-bone-50/7 pt-3">
          <p className="m-0 text-sm text-bone-50">{item.body}</p>
          <p className="mt-1 text-xs text-bone-500">{new Date(item.created_at).toLocaleDateString('pt-PT')}</p>
        </div>)}
        {!comments.length ? <p className="m-0 text-sm text-bone-500">Ainda não há comentários.</p> : null}
      </div>
    </Ficha>
  </section>;
}
