import type { Session, User } from '@supabase/supabase-js';
import { createContext, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react';
import { supabase } from '@/lib/supabase';

type AuthState = {
  session: Session | null;
  user: User | null;
  loading: boolean;
  configured: boolean;
};

const AuthContext = createContext<AuthState>({ session: null, user: null, loading: true, configured: Boolean(supabase) });

async function hashUserAgent() {
  const value = navigator.userAgent;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function syncServerAuthSession(session: Session | null) {
  try {
    if (session) {
      await fetch('/api/auth-session', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ accessToken: session.access_token }),
      });
    } else {
      await fetch('/api/auth-session', { method: 'DELETE', credentials: 'include' });
    }
  } catch {
    // Server-side routing protection is defence in depth and must not break the SPA session.
  }
}

async function registerSession() {
  if (!supabase) return;
  try {
    const userAgentHash = await hashUserAgent();
    await supabase.rpc('register_current_session', {
      _device_label: navigator.userAgent.slice(0, 80),
      _user_agent_hash: userAgentHash,
      _ip_hash: null
    });
  } catch {
    // Session registration is audit telemetry and must never prevent authentication.
  }
}

export function SessionProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(Boolean(supabase));

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }
    let active = true;
    void supabase.auth.getSession()
      .then(({ data }) => {
        if (!active) return;
        setSession(data.session);
        setLoading(false);
        void syncServerAuthSession(data.session);
        if (data.session) void registerSession();
      })
      .catch(() => {
        if (!active) return;
        setSession(null);
        setLoading(false);
      });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setLoading(false);
      void syncServerAuthSession(nextSession);
      if (nextSession) window.setTimeout(() => { void registerSession(); }, 0);
    });
    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthState>(() => ({
    session,
    user: session?.user ?? null,
    loading,
    configured: Boolean(supabase)
  }), [loading, session]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
