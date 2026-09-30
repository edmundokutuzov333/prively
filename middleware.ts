const COOKIE_NAME = 'prively_access_token';
const ADMIN_LOGIN_PATHS = new Set(['/admin/entrar', '/admin/seguranca/mfa']);

function readCookie(request: Request): string | null {
  const header = request.headers.get('cookie') ?? '';
  for (const part of header.split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name === COOKIE_NAME) {
      try { return decodeURIComponent(rest.join('=')); } catch { return null; }
    }
  }
  return null;
}

async function verifyAdmin(accessToken: string): Promise<'admin' | 'forbidden' | 'unauthorized'> {
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!supabaseUrl || !anonKey) return 'forbidden';
  const headers = { apikey: anonKey, Authorization: 'Bearer ' + accessToken, 'Content-Type': 'application/json' };
  const userResponse = await fetch(supabaseUrl + '/auth/v1/user', { headers, cache: 'no-store' });
  if (userResponse.status === 401 || userResponse.status === 403) return 'unauthorized';
  if (!userResponse.ok) return 'forbidden';
  const user = await userResponse.json() as { id?: string };
  if (!user.id) return 'unauthorized';
  const roleResponse = await fetch(supabaseUrl + '/rest/v1/rpc/has_permission', { method: 'POST', headers, body: JSON.stringify({ _uid: user.id, _permission: 'admin.control_room' }), cache: 'no-store' });
  if (!roleResponse.ok) return 'forbidden';
  const allowed = await roleResponse.json();
  return allowed === true ? 'admin' : 'forbidden';
}

export const config = { matcher: ['/admin/:path*'], runtime: 'edge' };

export default async function middleware(request: Request): Promise<Response | undefined> {
  const pathname = new URL(request.url).pathname;
  if (ADMIN_LOGIN_PATHS.has(pathname)) return undefined;
  const accessToken = readCookie(request);
  if (!accessToken) return new Response('Unauthorized', { status: 401, headers: { 'Cache-Control': 'no-store' } });
  const state = await verifyAdmin(accessToken);
  if (state === 'unauthorized') return new Response('Unauthorized', { status: 401, headers: { 'Cache-Control': 'no-store' } });
  if (state !== 'admin') return new Response('Forbidden', { status: 403, headers: { 'Cache-Control': 'no-store' } });
  return undefined;
}