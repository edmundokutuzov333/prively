import { type SupabaseClient } from '@supabase/supabase-js';
import { requireSupabase } from '@/lib/supabase';

export type RpcScalar = string | number | boolean | null;
export type RpcValue = RpcScalar | RpcValue[] | { [key: string]: RpcValue };
export type RpcArgs = Record<string, RpcValue>;

export async function phase3Rpc<T>(name: string, args: RpcArgs = {}): Promise<T> {
  const client = requireSupabase();
  const { data, error } = await client.rpc(name, args);
  if (error) throw new Error(error.code ?? error.message);
  return data as T;
}

export async function phase3Rows<T>(client: SupabaseClient | null, table: string, select = '*'): Promise<T[]> {
  if (!client) throw new Error('SUPABASE_NOT_CONFIGURED');
  const { data, error } = await client.from(table).select(select);
  if (error) throw new Error(error.code ?? error.message);
  return (data ?? []) as unknown as T[];
}

export async function phase3Edge<T>(name: string, body: Record<string, RpcValue>): Promise<T> {
  const client = requireSupabase();
  const { data, error } = await client.functions.invoke(name, { body });
  if (error) throw new Error(error.message);
  return data as T;
}
