-- Direct B2 uploads still finalize through the authenticated RPC.
-- Restore the client execute grant required by the production upload flow.
revoke all on function public.finalize_media_upload(uuid,text,bigint) from public,anon;
grant execute on function public.finalize_media_upload(uuid,text,bigint) to authenticated;
