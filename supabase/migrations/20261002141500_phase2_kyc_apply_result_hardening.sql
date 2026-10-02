revoke all on function public.apply_kyc_result(uuid,text,text,text,boolean,text,timestamptz) from public, anon, authenticated;
grant execute on function public.apply_kyc_result(uuid,text,text,text,boolean,text,timestamptz) to service_role;
