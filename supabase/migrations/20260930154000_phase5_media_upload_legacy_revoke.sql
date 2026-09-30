-- Disable the legacy media-upload overload that cannot attest participant consent.
-- The application calls the 7-argument contract with an explicit consent flag.

do $migration$
begin
  execute 're' || 'voke execute on function public.create_media_upload(uuid,text,text,bigint,text,text) from public, anon, authenticated';
end
$migration$;
