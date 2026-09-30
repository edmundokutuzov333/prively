-- The legacy six-argument contract is intentionally removed.
-- Grant only the consent-aware seven-argument upload RPC.
revoke all on function public.create_media_upload(uuid,text,text,bigint,text,text,boolean) from public,anon;
grant execute on function public.create_media_upload(uuid,text,text,bigint,text,text,boolean) to authenticated;
