-- Phase 5 performance hardening: remove duplicate queue index
drop index if exists public.media_processing_jobs_available_idx;
