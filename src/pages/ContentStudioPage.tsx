import { useEffect, useState } from 'react';
import { CheckCircle, CloudArrowUp, FilmStrip, Plus, ShieldCheck, Sparkle, UploadSimple, WarningCircle } from '@phosphor-icons/react';
import { useTranslation } from 'react-i18next';
import { Ficha } from '@/design/Ficha';
import { Botao } from '@/design/Botao';
import { requireSupabase } from '@/lib/supabase';
import { useAuth } from '@/app/session';
import { mediaKind, prepareMediaUpload, uploadMediaResumable } from '@/lib/mediaUpload';

type Channel = { id: string; handle: string; display_name: string; bio: string | null };
type ContentRow = {
  id: string;
  channel_id: string;
  caption: string | null;
  visibility: string;
  price: number | null;
  status: string;
  publish_at: string | null;
  expires_at: string | null;
  is_story: boolean;
  moderation_status: string;
  created_at: string;
  media_count: number;
  ready_media_count: number;
};

type PendingUpload = {
  fileName: string;
  progress: number;
  state: 'preparing' | 'uploading' | 'queued' | 'failed';
  error?: string;
};

function contentErrorMessage(t: (key: string, options?: Record<string, unknown>) => string, error: unknown) {
  const raw = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  const code = raw.toLowerCase().split(':')[0].replace(/[^a-z0-9_]/g, '');
  const known = new Set([
    'content_rights_required',
    'content_terms_required',
    'creator_verification_required',
    'channel_forbidden',
    'channel_handle_taken',
    'invalid_channel_handle',
    'display_name_required',
    'post_create_failed',
    'media_upload_prepare_failed',
    'signed_upload_url_failed',
    'session_required',
    'unsupported_media_type',
    'file_too_large',
    'unsupported_image_type',
    'unsupported_video_type',
    'unsupported_audio_type',
    'media_size_mismatch',
    'sha256_mismatch',
    'media_forbidden',
    'media_not_ready',
    'media_integrity_failed',
    'media_archive_failed',
    'media_finalize_failed',
    'ppv_price_required',
    'tier_required',
    'price_visibility_mismatch'
  ]);
  return known.has(code) ? t(`content.errors.${code}`) : t('content.errors.generic');
}

export function ContentStudioPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [channel, setChannel] = useState<Channel | null>(null);
  const [contents, setContents] = useState<ContentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingChannel, setSavingChannel] = useState(false);
  const [creatingPost, setCreatingPost] = useState(false);
  const [publishing, setPublishing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [channelHandle, setChannelHandle] = useState('');
  const [channelName, setChannelName] = useState('');
  const [channelBio, setChannelBio] = useState('');

  const [caption, setCaption] = useState('');
  const [visibility, setVisibility] = useState<'public' | 'followers' | 'subscribers' | 'tier' | 'ppv'>('subscribers');
  const [tierRank, setTierRank] = useState('1');
  const [price, setPrice] = useState('');
  const [isStory, setIsStory] = useState(false);
  const [rightsConfirmed, setRightsConfirmed] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [uploads, setUploads] = useState<PendingUpload[]>([]);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    const sb = requireSupabase();
    const [channelResult, contentResult] = await Promise.all([
      sb.from('channels').select('id,handle,display_name,bio').eq('owner_id', user.id).order('created_at', { ascending: true }).limit(1).maybeSingle(),
      sb.rpc('get_creator_content', { _channel: null }),
    ]);
    setLoading(false);
    if (channelResult.error) {
      setError(contentErrorMessage(t, channelResult.error));
      return;
    }
    if (contentResult.error) {
      setError(contentErrorMessage(t, contentResult.error));
      return;
    }
    const found = (channelResult.data ?? null) as Channel | null;
    setChannel(found);
    setContents((contentResult.data ?? []) as ContentRow[]);
    if (found) {
      setChannelHandle(found.handle);
      setChannelName(found.display_name);
      setChannelBio(found.bio ?? '');
    }
  };

  useEffect(() => {
    void load();
  }, [user]);

  const createChannel = async () => {
    setSavingChannel(true);
    setError(null);
    const { data, error: rpcError } = await requireSupabase().rpc('create_creator_channel', {
      _handle: channelHandle,
      _display_name: channelName,
      _bio: channelBio || null,
    });
    setSavingChannel(false);
    if (rpcError) {
      setError(contentErrorMessage(t, rpcError));
      return;
    }
    setNotice(t('content.channelCreated'));
    setChannel((current) => current ?? {
      id: String(data),
      handle: channelHandle,
      display_name: channelName,
      bio: channelBio || null,
    });
    await load();
  };

  const ensureContentTerms = async () => {
    if (!rightsConfirmed) throw new Error('content_rights_required');
    const sb = requireSupabase();
    const accepted = await sb.rpc('record_legal_acceptance', {
      _document_type: 'content_prohibited',
      _version: '1.0',
      _source: 'creator_content',
    });
    if (accepted.error) throw accepted.error;
  };

  const createPost = async () => {
    if (!channel || files.length === 0) return;
    setCreatingPost(true);
    setError(null);
    setNotice(null);
    setUploads(files.map((file) => ({ fileName: file.name, progress: 0, state: 'preparing' })));

    try {
      await ensureContentTerms();

      const { data: postId, error: postError } = await requireSupabase().rpc('create_post', {
        _channel: channel.id,
        _caption: caption || null,
        _visibility: visibility,
        _min_tier_rank: visibility === 'tier' ? Number(tierRank) : null,
        _price: visibility === 'ppv' ? Math.round(Number(price) * 100) : null,
        _is_story: isStory,
        _expires_at: null,
      });
      if (postError || !postId) throw new Error(postError?.message ?? 'post_create_failed');

      for (let index = 0; index < files.length; index += 1) {
        const file = files[index];
        setUploads((items) => items.map((item, itemIndex) => itemIndex === index ? { ...item, state: 'preparing' } : item));

        const plan = await prepareMediaUpload(String(postId), file);
        const finalized = await uploadMediaResumable(file, plan, (progress) => {
          setUploads((items) => items.map((item, itemIndex) => itemIndex === index ? {
            ...item,
            state: 'uploading',
            progress: progress.percentage,
          } : item));
        });

        const sb = requireSupabase();
        const integrityJobId = finalized.jobs.integrity;

        if (integrityJobId) {
          const integrityResult = await sb.functions.invoke('process-media-job', {
            body: { jobId: integrityJobId },
          });

          if (integrityResult.error || integrityResult.data?.status !== 'succeeded') {
            throw new Error(
              typeof integrityResult.data?.code === 'string'
                ? integrityResult.data.code
                : integrityResult.error?.message ?? 'media_integrity_failed',
            );
          }
        }

        const archiveJobId = finalized.jobs.archive;
        if (archiveJobId) {
          const archiveResult = await sb.functions.invoke('process-media-job', {
            body: { jobId: archiveJobId },
          });

          if (archiveResult.error || archiveResult.data?.status !== 'succeeded') {
            throw new Error(
              typeof archiveResult.data?.code === 'string'
                ? archiveResult.data.code
                : archiveResult.error?.message ?? 'media_archive_failed',
            );
          }
        }

        setUploads((items) => items.map((item, itemIndex) => itemIndex === index ? {
          ...item,
          state: 'queued',
          progress: 100,
        } : item));
      }

      setCaption('');
      setFiles([]);
      setRightsConfirmed(false);
      setPrice('');
      setNotice(t('content.uploadQueued'));
      await load();
    } catch (submissionError) {
      const message = contentErrorMessage(t, submissionError);
      setError(message);
      setUploads((items) => items.map((item) => item.state === 'queued' ? item : { ...item, state: 'failed', error: message }));
    } finally {
      setCreatingPost(false);
    }
  };

  const publish = async (postId: string) => {
    setPublishing(postId);
    setError(null);
    setNotice(null);
    const { error: publishError } = await requireSupabase().rpc('publish_post', { _post: postId, _scheduled_at: null });
    setPublishing(null);
    if (publishError) {
      setError(contentErrorMessage(t, publishError));
      return;
    }
    setNotice(t('content.published'));
    await load();
  };

  if (loading) {
    return <section className="mx-auto max-w-6xl px-5 py-12"><p className="text-sm text-bone-500">{t('common.loading')}</p></section>;
  }

  return <section className="mx-auto max-w-6xl space-y-8 px-5 py-10 md:px-8 md:py-14">
    <div>
      <p className="flex items-center gap-2 text-sm text-bone-500"><FilmStrip size={19} weight="duotone" />{t('content.eyebrow')}</p>
      <h1 className="mt-4 font-display text-6xl leading-none text-bone-50">{t('content.title')}</h1>
      <p className="mt-5 max-w-3xl text-base leading-7 text-bone-300">{t('content.body')}</p>
    </div>

    {error ? <div role="alert" className="flex items-start gap-3 rounded-md border border-danger/35 bg-danger/5 p-4 text-sm text-bone-50"><WarningCircle size={20} className="mt-0.5 shrink-0" />{error}</div> : null}
    {notice ? <div role="status" className="flex items-start gap-3 rounded-md border border-ok/30 bg-ok/5 p-4 text-sm text-bone-50"><CheckCircle size={20} className="mt-0.5 shrink-0" />{notice}</div> : null}

    {!channel ? <Ficha variant="focus" className="p-6 md:p-8">
      <div className="flex items-start gap-4"><ShieldCheck size={24} className="text-crimson-400" /><div><h2 className="text-xl font-semibold text-bone-50">{t('content.channelTitle')}</h2><p className="mt-2 text-sm leading-6 text-bone-300">{t('content.channelBody')}</p></div></div>
      <div className="mt-7 grid gap-5 md:grid-cols-2">
        <label><span className="mb-2 block text-sm text-bone-300">{t('content.channelHandle')}</span><input value={channelHandle} onChange={(event)=>setChannelHandle(event.target.value.toLowerCase())} className="min-h-12 w-full rounded-md border border-input bg-ink-850 px-3 text-bone-50 outline-none" /></label>
        <label><span className="mb-2 block text-sm text-bone-300">{t('content.channelName')}</span><input value={channelName} onChange={(event)=>setChannelName(event.target.value)} className="min-h-12 w-full rounded-md border border-input bg-ink-850 px-3 text-bone-50 outline-none" /></label>
        <label className="md:col-span-2"><span className="mb-2 block text-sm text-bone-300">{t('content.channelBio')}</span><textarea value={channelBio} onChange={(event)=>setChannelBio(event.target.value)} rows={4} className="w-full rounded-md border border-input bg-ink-850 p-3 text-bone-50 outline-none" /></label>
      </div>
      <Botao className="mt-6" onClick={()=>void createChannel()} loading={savingChannel} disabled={!/^[a-z0-9_]{3,24}$/.test(channelHandle)||!channelName.trim()}><Plus size={18}/>{t('content.createChannel')}</Botao>
    </Ficha> : <div className="grid gap-8 lg:grid-cols-[1.2fr_.8fr]">
      <Ficha variant="focus" className="p-6 md:p-8">
        <div className="flex items-start justify-between gap-4"><div><p className="text-sm text-bone-500">{t('content.channelEyebrow')}</p><h2 className="mt-2 text-2xl font-semibold text-bone-50">@{channel.handle}</h2><p className="mt-1 text-sm text-bone-500">{channel.display_name}</p></div><Sparkle size={22} className="text-crimson-400"/></div>
        <div className="mt-7 space-y-5">
          <label><span className="mb-2 block text-sm text-bone-300">{t('content.caption')}</span><textarea value={caption} onChange={(event)=>setCaption(event.target.value)} rows={5} maxLength={5000} className="w-full rounded-md border border-input bg-ink-850 p-3 text-bone-50 outline-none" placeholder={t('content.captionPlaceholder')} /></label>
          <div className="grid gap-5 md:grid-cols-3">
            <label><span className="mb-2 block text-sm text-bone-300">{t('content.visibility')}</span><select value={visibility} onChange={(event)=>setVisibility(event.target.value as typeof visibility)} className="min-h-12 w-full rounded-md border border-input bg-ink-850 px-3 text-bone-50 outline-none"><option value="public">{t('content.public')}</option><option value="followers">{t('content.followers')}</option><option value="subscribers">{t('content.subscribers')}</option><option value="tier">{t('content.tier')}</option><option value="ppv">{t('content.ppv')}</option></select></label>
            {visibility === 'tier' ? <label><span className="mb-2 block text-sm text-bone-300">{t('content.tierRank')}</span><input value={tierRank} onChange={(event)=>setTierRank(event.target.value.replace(/\D/g,'').slice(0,1))} inputMode="numeric" min="1" max="4" className="min-h-12 w-full rounded-md border border-input bg-ink-850 px-3 text-bone-50 outline-none" /></label> : <div />}
            {visibility === 'ppv' ? <label><span className="mb-2 block text-sm text-bone-300">{t('content.price')}</span><input value={price} onChange={(event)=>setPrice(event.target.value)} inputMode="decimal" className="min-h-12 w-full rounded-md border border-input bg-ink-850 px-3 text-bone-50 outline-none" placeholder="0.00" /></label> : <div />}
          </div>

          <label className="flex items-start gap-3 rounded-md border border-bone-50/8 bg-ink-850 p-4 text-sm leading-6 text-bone-300"><input type="checkbox" checked={isStory} onChange={(event)=>setIsStory(event.target.checked)} className="mt-1 accent-crimson-500"/><span>{t('content.story')}</span></label>

          <label className="block rounded-md border border-dashed border-bone-50/15 bg-ink-850 p-5">
            <span className="flex items-center gap-2 text-sm font-semibold text-bone-50"><UploadSimple size={18}/>{t('content.files')}</span>
            <span className="mt-1 block text-xs text-bone-500">{t('content.fileHelp')}</span>
            <input type="file" multiple accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime,audio/mpeg,audio/mp4,audio/wav,audio/aac" onChange={(event)=>setFiles(Array.from(event.target.files ?? []))} className="mt-4 block w-full text-sm text-bone-300 file:mr-4 file:rounded file:border-0 file:bg-wine-900 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-bone-50" />
            {files.length ? <div className="mt-4 space-y-2">{files.map((file)=><div key={file.name+file.size} className="flex items-center justify-between gap-3 rounded bg-ink-900 px-3 py-2 text-xs text-bone-300"><span className="truncate">{file.name}</span><span>{mediaKind(file)}</span></div>)}</div> : null}
          </label>

          <label className="flex items-start gap-3 rounded-md border border-bone-50/8 p-4 text-sm leading-6 text-bone-300"><input type="checkbox" checked={rightsConfirmed} onChange={(event)=>setRightsConfirmed(event.target.checked)} className="mt-1 accent-crimson-500"/><span>{t('content.rights')}</span></label>

          {uploads.length ? <div className="space-y-2">{uploads.map((upload)=><div key={upload.fileName} className="rounded-md border border-bone-50/8 bg-ink-850 p-3"><div className="flex items-center justify-between gap-4 text-xs text-bone-300"><span className="truncate">{upload.fileName}</span><span>{upload.state==='uploading'?Math.round(upload.progress)+'%':t('content.uploadStates.'+upload.state)}</span></div><div className="mt-2 h-1.5 overflow-hidden rounded bg-ink-700"><div className="h-full bg-crimson-500 transition-[width]" style={{width:`${upload.progress}%`}} /></div></div>)}</div> : null}

          <div className="flex flex-wrap gap-3">
            <Botao onClick={()=>void createPost()} loading={creatingPost} disabled={!files.length||!rightsConfirmed||(visibility==='ppv'&&(!Number.isFinite(Number(price))||Number(price)<=0))||(visibility==='tier'&&(Number(tierRank)<1||Number(tierRank)>4))}><CloudArrowUp size={18}/>{t('content.createAndUpload')}</Botao>
            {creatingPost ? <span className="self-center text-xs text-bone-500">{t('content.resumableNote')}</span> : null}
          </div>
        </div>
      </Ficha>

      <Ficha className="p-6">
        <div className="flex items-center justify-between gap-3"><h2 className="text-xl font-semibold text-bone-50">{t('content.library')}</h2><span className="text-xs text-bone-500">{contents.length}</span></div>
        <div className="mt-5 space-y-3">
          {contents.map((item)=><article key={item.id} className="rounded-md border border-bone-50/8 bg-ink-850 p-4">
            <div className="flex items-start justify-between gap-3"><div><p className="text-sm font-semibold text-bone-50">{item.caption || t('content.untitled')}</p><p className="mt-1 text-xs text-bone-500">{t('content.visibilityValues.'+item.visibility)} · {item.media_count} {t('content.mediaLabel')} · {item.ready_media_count}/{item.media_count} {t('content.readyLabel')}</p></div><span className="rounded-full border border-bone-50/10 px-2 py-1 text-[11px] text-bone-400">{t('content.statusValues.'+item.status)}</span></div>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">{item.moderation_status==='pending'?<span className="text-bone-500">{t('content.moderationValues.pending')}</span>:item.moderation_status==='clean'?<span className="text-ok">{t('content.moderationValues.clean')}</span>:<span className="text-danger">{t('content.moderationValues.'+item.moderation_status)}</span>}</div>
            {item.status==='draft' && item.media_count>0 ? <Botao variant="outline" className="mt-4 w-full" onClick={()=>void publish(item.id)} loading={publishing===item.id} disabled={item.ready_media_count!==item.media_count}>{item.ready_media_count===item.media_count?t('content.publish'):t('content.processing')}</Botao> : null}
          </article>)}
          {!contents.length ? <div className="rounded-md border border-dashed border-bone-50/10 p-5 text-sm text-bone-500">{t('content.empty')}</div> : null}
        </div>
      </Ficha>
    </div>}
  </section>;
}
