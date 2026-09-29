-- Forward-only repair: keep the creator media-upload RPC callable by authenticated users.
revoke all on function public.create_media_upload(uuid,text,text,bigint,text,text) from public,anon;
grant execute on function public.create_media_upload(uuid,text,text,bigint,text,text) to authenticated;
