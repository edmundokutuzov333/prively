alter table public.legal_acceptances
  drop constraint if exists legal_acceptances_document_type_check;

alter table public.legal_acceptances
  add constraint legal_acceptances_document_type_check
  check (document_type = any (array[
    'terms'::text,
    'creator_terms'::text,
    'privacy'::text,
    'content_prohibited'::text,
    'refunds'::text,
    'cookies'::text,
    'dmca'::text
  ]));
