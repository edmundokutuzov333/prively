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

export async function phase9Rows<T>(client: typeof import('@/lib/supabase').supabase, table: string, select = '*'): Promise<T[]> {
  if (!client) throw new Error('SUPABASE_NOT_CONFIGURED');
  const { data, error } = await client.from(table).select(select);
  if (error) throw new Error(error.code ?? error.message);
  return (data ?? []) as unknown as T[];
}

export async function phase9Edge<T>(name: string, body: Record<string, Phase9Value>): Promise<T> {
  const client = requireSupabase();
  const { data, error } = await client.functions.invoke(name, { body });
  if (error) throw new Error(error.message);
  return data as T;
}
