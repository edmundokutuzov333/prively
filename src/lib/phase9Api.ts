import type { SupabaseClient } from '@supabase/supabase-js';
import { requireSupabase } from '@/lib/supabase';

export type Phase9Scalar = string | number | boolean | null;
export type Phase9Value = Phase9Scalar | Phase9Value[] | { [key: string]: Phase9Value };
export type Phase9Args = Record<string, Phase9Value>;

export async function phase9Rpc<T>(name: string, args: Phase9Args = {}): Promise<T> {
  const client = requireSupabase();
  const { data, error } = await client.rpc(name, args);
  if (error) throw new Error(error.code ?? error.message);
  return data as T;
}

export async function phase9Rows<T>(
  client: SupabaseClient | null,
  table: string,
  select = '*',
  configure?: (query: ReturnType<SupabaseClient['from']>) => ReturnType<SupabaseClient['from']>
): Promise<T[]> {
  if (!client) throw new Error('SUPABASE_NOT_CONFIGURED');
  let query = client.from(table).select(select);
  if (configure) query = configure(query as never) as never;
  const { data, error } = await query;
  if (error) throw new Error(error.code ?? error.message);
  return (data ?? []) as unknown as T[];
}

export async function phase9Edge<T>(
  name: string,
  body: Record<string, Phase9Value>
): Promise<T> {
  const client = requireSupabase();
  const { data, error } = await client.functions.invoke(name, { body });
  if (error) throw new Error(error.message);
  return data as T;
}
