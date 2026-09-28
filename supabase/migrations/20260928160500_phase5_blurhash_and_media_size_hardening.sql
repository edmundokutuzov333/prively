alter table public.media_assets
  drop constraint if exists media_assets_file_size_limit_check;
alter table public.media_assets
  add constraint media_assets_file_size_limit_check
  check (
    (kind='image' and file_size_bytes between 1 and 52428800)
    or (kind='video' and file_size_bytes between 1 and 104857600)
    or (kind='audio' and file_size_bytes between 1 and 104857600)
  );

create or replace function public.create_post_with_blurhash(
  _channel uuid,
  _caption text default null,
  _visibility public.visibility default 'subscribers',
  _min_tier_rank smallint default null,
  _price bigint default null,
  _is_story boolean default false,
  _expires_at timestamptz default null,
  _blurhash text default null
)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare post_id uuid:=gen_random_uuid();
declare channel_owner uuid;
declare expiry timestamptz:=_expires_at;
begin
  if auth.uid() is null then raise exception 'unauthorized'; end if;
  select owner_id into channel_owner from public.channels where id=_channel;
  if channel_owner is null or channel_owner<>auth.uid() then raise exception 'channel_forbidden'; end if;
  if not public.is_age_verified(auth.uid()) then raise exception 'creator_verification_required'; end if;
  if not public.has_legal_acceptance(auth.uid(),'terms','1.0')
     or not public.has_legal_acceptance(auth.uid(),'privacy','1.0')
     or not public.has_legal_acceptance(auth.uid(),'content_prohibited','1.0') then
    raise exception 'content_terms_required';
  end if;
  if _visibility='ppv' and coalesce(_price,0)<=0 then raise exception 'ppv_price_required'; end if;
  if _visibility='tier' and coalesce(_min_tier_rank,0) not between 1 and 4 then raise exception 'tier_required'; end if;
  if _visibility<>'ppv' and _price is not null then raise exception 'price_visibility_mismatch'; end if;
  if _is_story and expiry is null then expiry:=now()+interval '24 hours'; end if;
  if _is_story and expiry<=now() then raise exception 'story_expiry_invalid'; end if;
  if length(coalesce(_caption,''))>5000 then raise exception 'caption_too_long'; end if;
  if _blurhash is not null and length(trim(_blurhash))>64 then raise exception 'blurhash_invalid'; end if;

  insert into public.posts(
    id,channel_id,caption,visibility,min_tier_rank,price,status,publish_at,expires_at,is_story,blurhash,moderation_status
  )
  values(
    post_id,_channel,nullif(trim(_caption),''),_visibility,_min_tier_rank,_price,'draft',null,expiry,_is_story,nullif(trim(_blurhash),''),'pending'
  );
  return post_id;
end
$$;

grant execute on function public.create_post_with_blurhash(uuid,text,public.visibility,smallint,bigint,boolean,timestamptz,text) to authenticated;
revoke execute on function public.create_post_with_blurhash(uuid,text,public.visibility,smallint,bigint,boolean,timestamptz,text) from public,anon;