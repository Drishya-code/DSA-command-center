import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  loading: boolean;
  signUp: (email: string, password: string, fullName?: string) => Promise<{ confirmationRequired: boolean }>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    let authEventSeen = false;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      authEventSeen = true;
      if (active) {
        setSession(nextSession);
        setLoading(false);
      }
    });

    void supabase.auth.getSession().then(({ data, error }) => {
      if (!active || authEventSeen) return;
      if (error) console.error('Could not restore the saved sign-in session.', error);
      setSession(data.session);
      setLoading(false);
    }).catch((error: unknown) => {
      if (!active || authEventSeen) return;
      console.error('Could not restore the saved sign-in session.', error);
      setSession(null);
      setLoading(false);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const signUp = useCallback(async (email: string, password: string, fullName?: string) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: fullName?.trim() ? { data: { full_name: fullName.trim() } } : undefined,
    });
    if (error) throw error;
    return { confirmationRequired: !data.session };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  }, []);

  const signOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    setSession(null);
  }, []);

  const value = useMemo(() => ({
    session,
    user: session?.user ?? null,
    loading,
    signUp,
    signIn,
    signOut,
  }), [session, loading, signUp, signIn, signOut]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used within an AuthProvider');
  return value;
}
