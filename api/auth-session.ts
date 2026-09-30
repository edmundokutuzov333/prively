const COOKIE_NAME = 'prively_access_token';

function json(body: Record<string, unknown>, status = 200, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...extraHeaders },
  });
}

function cookie(token: string, maxAge: number) {
  return [COOKIE_NAME + '=' + encodeURIComponent(token), 'Path=/', 'HttpOnly', 'Secure', 'SameSite=Lax', 'Max-Age=' + String(maxAge)].join('; ');
}

export default async function handler(request: Request): Promise<Response> {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: {
      'Access-Control-Allow-Origin': request.headers.get('origin') ?? 'null',
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Allow-Methods': 'POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'content-type',
      Vary: 'Origin',
    }});
  }
  if (request.method === 'DELETE') return json({ ok: true }, 200, { 'Set-Cookie': cookie('', 0) });
  if (request.method !== 'POST') return json({ code: 'method_not_allowed' }, 405);
  const url = process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !anonKey) return json({ code: 'auth_session_not_configured' }, 503);
  try {
    const body = await request.json() as { accessToken?: unknown };
    if (typeof body.accessToken !== 'string' || body.accessToken.length < 20) return json({ code: 'invalid_access_token' }, 400);
    const upstream = await fetch(url + '/auth/v1/user', { method: 'GET', headers: { apikey: anonKey, Authorization: 'Bearer ' + body.accessToken }, cache: 'no-store' });
    if (!upstream.ok) return json({ code: 'invalid_session' }, 401);
    const user = await upstream.json() as { id?: string };
    if (!user.id) return json({ code: 'invalid_session' }, 401);
    return json({ ok: true }, 200, { 'Set-Cookie': cookie(body.accessToken, 3600) });
  } catch {
    return json({ code: 'auth_session_error' }, 400);
  }
}