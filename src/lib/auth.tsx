import type { Session } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

import { cancelAllReminders, removePushToken } from '@/lib/notifications';
import { supabase } from '@/lib/supabase';
import type { Profile } from '@/lib/types';

type AuthContextValue = {
  session: Session | null;
  profile: Profile | null;
  /** True until we know whether someone is signed in (and have their profile). */
  loading: boolean;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [sessionReady, setSessionReady] = useState(false);
  const [profileState, setProfileState] = useState<{ userId: string; profile: Profile | null } | null>(
    null
  );

  useEffect(() => {
    // Fires immediately with INITIAL_SESSION, then on every sign in / out.
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setSessionReady(true);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const userId = session?.user.id;

  const refreshProfile = useCallback(async () => {
    if (!userId) return;
    const { data } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
    setProfileState({ userId, profile: (data as Profile | null) ?? null });
  }, [userId]);

  useEffect(() => {
    if (userId) refreshProfile();
  }, [userId, refreshProfile]);

  const signOut = useCallback(async () => {
    await Promise.allSettled([removePushToken(), cancelAllReminders()]);
    await supabase.auth.signOut();
  }, []);

  const profileLoaded = !!userId && profileState?.userId === userId;
  const value: AuthContextValue = {
    session,
    profile: profileLoaded ? profileState.profile : null,
    loading: !sessionReady || (!!userId && !profileLoaded),
    refreshProfile,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
