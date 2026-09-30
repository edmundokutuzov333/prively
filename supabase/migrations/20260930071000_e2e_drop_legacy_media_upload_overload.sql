-- Phase E2E: remove the legacy media-upload overload completely.
-- Revoking EXECUTE is insufficient for PostgREST overload resolution because
-- the 6-argument function remains in the function catalog.
drop function if exists public.create_media_upload(uuid,text,text,bigint,text,text);
