import { useState, useEffect, createContext, useContext, ReactNode, useCallback, useRef } from 'react';
import { User, Session, AuthChangeEvent } from '@supabase/supabase-js';
// Usa o Lovable Cloud para autenticação e dados principais
import { supabase } from '@/integrations/supabase/client';
type AppRole = 'admin' | 'seller' | 'user';

// Default trial days (can be overridden by app_settings)
const DEFAULT_TRIAL_DAYS = 5;

// Authentication states - explicit for better control
type AuthState = 'loading' | 'authenticated' | 'unauthenticated';

interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  whatsapp: string | null;
  subscription_expires_at: string | null;
  is_permanent: boolean;
  is_active: boolean;
  needs_password_update: boolean;
  created_at: string;
  tutorial_visto: boolean;
}

interface TrialInfo {
  isInTrial: boolean;
  daysRemaining: number;
  trialExpired: boolean;
  trialEndDate?: Date;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  role: AppRole | null;
  isAdmin: boolean;
  isSeller: boolean;
  isUser: boolean;
  hasSystemAccess: boolean; // true se admin, seller, ou user em período de teste
  trialInfo: TrialInfo; // informações do período de teste
  loading: boolean;
  authState: AuthState; // Explicit auth state
  needsPasswordUpdate: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (
    email: string,
    password: string,
    fullName: string,
    whatsapp?: string
  ) => Promise<{ error: Error | null; needsEmailConfirmation?: boolean }>;
  signOut: () => Promise<void>;
  updatePassword: (newPassword: string) => Promise<{ error: Error | null }>;
  clearPasswordUpdateFlag: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Cache keys
const CACHE_KEYS = {
  PROFILE: 'auth_cached_profile',
  ROLE: 'auth_cached_role',
  USER_ID: 'auth_cached_user_id',
  SESSION_MARKER: 'auth_session_active', // Marker to detect if session should exist
} as const;

// Cache helpers with improved error handling
const getCachedData = (userId: string): { profile: Profile | null; role: AppRole | null } => {
  try {
    const cachedUserId = localStorage.getItem(CACHE_KEYS.USER_ID);
    
    // CRITICAL: If cached user ID doesn't match current user, clear ALL cache
    // This prevents role bleeding between different users on the same device
    if (cachedUserId && cachedUserId !== userId) {
      clearCachedData();
      return { profile: null, role: null };
    }
    
    const profileStr = localStorage.getItem(CACHE_KEYS.PROFILE);
    const roleStr = localStorage.getItem(CACHE_KEYS.ROLE);
    
    // Validate that cached profile ID matches the user ID
    if (profileStr) {
      const profile = JSON.parse(profileStr);
      if (profile.id !== userId) {
        clearCachedData();
        return { profile: null, role: null };
      }
    }
    
    return {
      profile: profileStr ? JSON.parse(profileStr) : null,
      role: roleStr as AppRole | null,
    };
  } catch {
    clearCachedData();
    return { profile: null, role: null };
  }
};

const setCachedData = (userId: string, profile: Profile | null, role: AppRole | null) => {
  try {
    localStorage.setItem(CACHE_KEYS.USER_ID, userId);
    localStorage.setItem(CACHE_KEYS.SESSION_MARKER, 'true');

    if (profile) {
      localStorage.setItem(CACHE_KEYS.PROFILE, JSON.stringify(profile));
    } else {
      localStorage.removeItem(CACHE_KEYS.PROFILE);
    }

    if (role) {
      localStorage.setItem(CACHE_KEYS.ROLE, role);
    } else {
      localStorage.removeItem(CACHE_KEYS.ROLE);
    }
  } catch {
    // Ignore storage errors
  }
};

const clearCachedData = () => {
  try {
    localStorage.removeItem(CACHE_KEYS.PROFILE);
    localStorage.removeItem(CACHE_KEYS.ROLE);
    localStorage.removeItem(CACHE_KEYS.USER_ID);
    localStorage.removeItem(CACHE_KEYS.SESSION_MARKER);
  } catch {
    // Ignore storage errors
  }
};

// Check if we expect a session to exist (for faster initial state)
const hasSessionMarker = (): boolean => {
  try {
    return localStorage.getItem(CACHE_KEYS.SESSION_MARKER) === 'true';
  } catch {
    return false;
  }
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [authState, setAuthState] = useState<AuthState>('loading');
  const [isVerifyingRole, setIsVerifyingRole] = useState(false);
  const [trialDays, setTrialDays] = useState<number>(DEFAULT_TRIAL_DAYS);
  
  // Refs to prevent race conditions
  const initializationComplete = useRef(false);
  const fetchingUserData = useRef(false);
  const authStateRef = useRef<AuthState>('loading');
  const sessionRef = useRef<Session | null>(null);
  const recoveringMissingSession = useRef(false);

  // Keep refs in sync to avoid stale-closure bugs (timeouts, async handlers)
  useEffect(() => {
    authStateRef.current = authState;
    if (authState !== 'loading') initializationComplete.current = true;
  }, [authState]);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  /**
   * CRITICAL SELF-HEAL:
   * We should never stay in a state where authState='authenticated' but user is null.
   * This can happen when we temporarily rely on cached profile/role while the session
   * restore is slow/fails, and it can lead to infinite "tela branca"/"trava" states.
   *
   * Strategy:
   * - Attempt to recover the session once via getSession()
   * - If still missing, fall back to unauthenticated and clear cache markers
   */
  useEffect(() => {
    if (authState !== 'authenticated') return;
    if (user) return;
    if (recoveringMissingSession.current) return;

    recoveringMissingSession.current = true;
    console.warn('[useAuth] Inconsistent state: authenticated without user. Attempting recovery...');

    // Keep UI stable while we attempt session recovery.
    setAuthState('loading');

    const recover = async () => {
      try {
        const { data, error } = await supabase.auth.getSession();

        if (!error && data?.session?.user) {
          console.log('[useAuth] Session recovered successfully');
          setSession(data.session);
          setUser(data.session.user);
          setAuthState('authenticated');
          return;
        }

        console.warn('[useAuth] Session recovery failed; forcing unauthenticated', error);
        clearCachedData();
        setSession(null);
        setUser(null);
        setProfile(null);
        setRole(null);
        setAuthState('unauthenticated');
      } catch (e) {
        console.error('[useAuth] Session recovery exception; forcing unauthenticated', e);
        clearCachedData();
        setSession(null);
        setUser(null);
        setProfile(null);
        setRole(null);
        setAuthState('unauthenticated');
      } finally {
        recoveringMissingSession.current = false;
      }
    };

    recover();
  }, [authState, user]);

  // Fetch trial days from app_settings
  useEffect(() => {
    const fetchTrialDays = async () => {
      try {
        const { data } = await supabase
          .from('app_settings')
          .select('value')
          .eq('key', 'seller_trial_days')
          .maybeSingle();
        
        if (data?.value) {
          const days = parseInt(data.value, 10);
          if (!isNaN(days) && days > 0) {
            setTrialDays(days);
          }
        }
      } catch {
        // Use default if fetch fails
      }
    };

    fetchTrialDays();
  }, []);

  // Main authentication initialization
  useEffect(() => {
    let isMounted = true;

    // Safety timeout - 8 seconds is enough for slow networks
    const loadingTimeout = setTimeout(() => {
      // IMPORTANT: use refs here (effect runs once; state values would be stale)
      if (isMounted && authStateRef.current === 'loading') {
        console.log('[useAuth] Safety timeout reached, checking cache...');

        // If we already have a valid session, NEVER kick the user back to login.
        // Just mark as authenticated and let the data fetch continue.
        if (sessionRef.current?.user) {
          console.log('[useAuth] Session exists; keeping user authenticated after timeout');
          setAuthState('authenticated');
          return;
        }

        // Check if we have cached data to use
        const sessionMarker = hasSessionMarker();
        if (sessionMarker) {
          // Try to use cached data
          const cachedUserId = localStorage.getItem(CACHE_KEYS.USER_ID);
          if (cachedUserId) {
            const cached = getCachedData(cachedUserId);
            if (cached.profile && cached.role) {
              console.log('[useAuth] Using cached data after timeout');
              setProfile(cached.profile);
              setRole(cached.role);
              setAuthState('authenticated');
              return;
            }
          }
        }
        // No valid cache - set unauthenticated
        setAuthState('unauthenticated');
      }
    }, 8000);

    const initializeAuth = async () => {
      // IMPORTANT: Set up auth state change listener FIRST
      const { data: { subscription } } = supabase.auth.onAuthStateChange(
        async (event: AuthChangeEvent, currentSession: Session | null) => {
          if (!isMounted) return;
          
          console.log('[useAuth] Auth event:', event);
          
          switch (event) {
            case 'SIGNED_OUT':
              setSession(null);
              setUser(null);
              setProfile(null);
              setRole(null);
              clearCachedData();
              setAuthState('unauthenticated');
              break;
              
            case 'SIGNED_IN':
            case 'TOKEN_REFRESHED':
            case 'USER_UPDATED':
              if (currentSession?.user) {
                setSession(currentSession);
                setUser(currentSession.user);
                localStorage.setItem(CACHE_KEYS.SESSION_MARKER, 'true');

                // Session exists: consider authenticated immediately (data can load in background)
                setAuthState('authenticated');
                
                // Load cached data for instant display
                const cached = getCachedData(currentSession.user.id);
                if (cached.profile) setProfile(cached.profile);
                if (cached.role) setRole(cached.role);
                
                // Always fetch fresh data
                await fetchUserData(currentSession.user.id, isMounted, currentSession.access_token);
                if (isMounted) setAuthState('authenticated');
              }
              break;
              
            case 'INITIAL_SESSION':
              if (currentSession?.user) {
                setSession(currentSession);
                setUser(currentSession.user);
                localStorage.setItem(CACHE_KEYS.SESSION_MARKER, 'true');
                
                const cached = getCachedData(currentSession.user.id);
                if (cached.profile) setProfile(cached.profile);
                if (cached.role) setRole(cached.role);

                // CRITICAL: Never block UI on profile/role fetch.
                // If a session exists, treat as authenticated immediately and fetch data in background.
                // This prevents getting stuck on "Verificando sessão..." on slow/unstable networks.
                setAuthState('authenticated');
                fetchUserData(currentSession.user.id, isMounted, currentSession.access_token);
              } else {
                // No session - unauthenticated
                if (isMounted) setAuthState('unauthenticated');
              }
              break;
              
            default:
              if (currentSession?.user) {
                setSession(currentSession);
                setUser(currentSession.user);
              }
          }
        }
      );

      // Get current session
      try {
        const { data: { session: initialSession }, error } = await supabase.auth.getSession();
        
        if (error) {
          console.error('[useAuth] Session error:', error);
          // Check cache before giving up
          if (hasSessionMarker()) {
            const cachedUserId = localStorage.getItem(CACHE_KEYS.USER_ID);
            if (cachedUserId) {
              const cached = getCachedData(cachedUserId);
              if (cached.profile && cached.role) {
                setProfile(cached.profile);
                setRole(cached.role);
                setAuthState('authenticated');
                return;
              }
            }
          }
        }
        
        // INITIAL_SESSION event handles the rest
        // But if no session, set unauthenticated now
        if (!initialSession && isMounted && authState === 'loading') {
          setAuthState('unauthenticated');
        }
        
      } catch (error) {
        console.error('[useAuth] Exception:', error);
        if (isMounted) setAuthState('unauthenticated');
      }

      return () => {
        subscription.unsubscribe();
      };
    };

    const cleanupPromise = initializeAuth();

    return () => {
      isMounted = false;
      clearTimeout(loadingTimeout);
      cleanupPromise.then(cleanup => cleanup?.());
    };
  }, []);

  const fetchUserData = useCallback(async (userId: string, isMounted: boolean, accessToken?: string | null) => {
    // Prevent concurrent fetches
    if (fetchingUserData.current) return;
    fetchingUserData.current = true;
    
    setIsVerifyingRole(true);
    try {
      const [profileResult, roleResult] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', userId).maybeSingle(),
        // Robust: do not use maybeSingle/single because duplicates can happen and would break admin detection
        supabase.from('user_roles').select('role').eq('user_id', userId)
      ]);

      if (!isMounted) return;

      if (profileResult.error) {
        console.warn('[useAuth] Profile fetch error:', profileResult.error);
      }
      if (roleResult.error) {
        console.warn('[useAuth] Role fetch error:', roleResult.error);
      }

      let nextProfile = (profileResult.data as Profile | null) ?? null;

      const roleRows = (roleResult.data as any[]) || [];
      let nextRole = (roleRows.find((r: any) => r?.role === 'admin')?.role || roleRows?.[0]?.role || null) as AppRole | null;

      // Se o usuário não tem role, tentar corrigir automaticamente
      // IMPORTANT: do not depend on React state timing for the access token
      if (!nextRole && accessToken) {
        console.log('[useAuth] User has no role, attempting to fix...');
        try {
          const { data: fixData, error: fixError } = await supabase.functions.invoke('fix-user-roles', {
            headers: { Authorization: `Bearer ${accessToken}` }
          });
          
          if (!fixError && fixData?.role) {
            console.log('[useAuth] Role fixed:', fixData.role);
            nextRole = fixData.role as AppRole;
            
            // Re-fetch profile in case it was also created
            const { data: newProfile } = await supabase
              .from('profiles')
              .select('*')
              .eq('id', userId)
              .maybeSingle();
            
            if (newProfile) {
              nextProfile = newProfile as Profile;
            }
          }
        } catch (e) {
          console.error('[useAuth] Failed to fix role:', e);
        }
      }

      // Always overwrite state with fresh data
      setProfile(nextProfile);
      setRole(nextRole);

      // Update cache with fresh data
      setCachedData(userId, nextProfile, nextRole);
      
      // Now we can confirm authentication
      if (isMounted) {
        setAuthState('authenticated');
      }
    } catch (error) {
      console.error('[useAuth] Error fetching user data:', error);
    } finally {
      fetchingUserData.current = false;
      if (isMounted) {
        setIsVerifyingRole(false);
      }
    }
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    // Prevent showing stale cached role/profile during a new login
    clearCachedData();
    setAuthState('loading');
    
    const normalizedEmail = email.trim().toLowerCase();
    const { error } = await supabase.auth.signInWithPassword({ email: normalizedEmail, password });
    
    if (error) {
      setAuthState('unauthenticated');
    }
    
    return { error: error as Error | null };
  }, []);

  const signUp = useCallback(async (email: string, password: string, fullName: string, whatsapp?: string) => {
    const redirectUrl = `${window.location.origin}/`;
    const normalizedEmail = email.trim().toLowerCase();

    const { data, error } = await supabase.auth.signUp({
      email: normalizedEmail,
      password,
      options: {
        emailRedirectTo: redirectUrl,
        data: { full_name: fullName, whatsapp: whatsapp || null }
      }
    });

    // If data.session is null, the provider is requiring email confirmation.
    const needsEmailConfirmation = !!data?.user && !data?.session;

    return { error: error as Error | null, needsEmailConfirmation };
  }, []);

  const signOut = useCallback(async () => {
    console.log('[useAuth] Signing out...');
    
    // Clear all cached data FIRST
    clearCachedData();
    
    // Clear state immediately
    setUser(null);
    setSession(null);
    setProfile(null);
    setRole(null);
    setAuthState('unauthenticated');
    
    // Then sign out from Supabase
    try {
      await supabase.auth.signOut();
    } catch (error) {
      console.error('[useAuth] Error during signOut:', error);
    }
    
    console.log('[useAuth] Signed out successfully');
  }, []);

  const updatePassword = useCallback(async (newPassword: string) => {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    return { error: error as Error | null };
  }, []);

  const clearPasswordUpdateFlag = useCallback(async () => {
    if (!user) return;
    
    await supabase
      .from('profiles')
      .update({ needs_password_update: false })
      .eq('id', user.id);
    
    if (profile) {
      const updatedProfile = { ...profile, needs_password_update: false };
      setProfile(updatedProfile);
      setCachedData(user.id, updatedProfile, role);
    }
  }, [user, profile, role]);

  const isAdmin = role === 'admin';
  const isSeller = role === 'seller';
  const isUser = role === 'user';
  
  // Calcular período de teste usando o valor dinâmico do banco
  const trialInfo = (() => {
    if (!profile?.created_at || role !== 'user') {
      return { isInTrial: false, daysRemaining: 0, trialExpired: false };
    }
    
    const createdAt = new Date(profile.created_at);
    const trialEndDate = new Date(createdAt.getTime() + trialDays * 24 * 60 * 60 * 1000);
    const now = new Date();
    const daysRemaining = Math.ceil((trialEndDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    
    return {
      isInTrial: daysRemaining > 0,
      daysRemaining: Math.max(0, daysRemaining),
      trialExpired: daysRemaining <= 0,
      trialEndDate
    };
  })();
  
  // hasSystemAccess: admin, seller, ou user em período de teste
  // Enquanto verifica role, considera que tem acesso para evitar flash de erro
  const hasSystemAccess = isVerifyingRole || isAdmin || isSeller || trialInfo.isInTrial;

  // loading is true when authState is 'loading'
  const loading = authState === 'loading';

  return (
    <AuthContext.Provider value={{
      user,
      session,
      profile,
      role,
      isAdmin,
      isSeller,
      isUser,
      hasSystemAccess,
      trialInfo,
      loading,
      authState,
      needsPasswordUpdate: profile?.needs_password_update ?? false,
      signIn,
      signUp,
      signOut,
      updatePassword,
      clearPasswordUpdateFlag
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
