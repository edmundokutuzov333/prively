-- Grant the visibility read-model to authenticated clients.
-- Both overloads enforce auth.uid() identity before evaluating visibility.
revoke all on function public.can_view_post(uuid) from public, anon, authenticated;
grant execute on function public.can_view_post(uuid) to authenticated;

revoke all on function public.can_view_post(uuid, uuid) from public, anon, authenticated;
grant execute on function public.can_view_post(uuid, uuid) to authenticated;
