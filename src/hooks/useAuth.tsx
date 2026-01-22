import { useState, useEffect, createContext, useContext, ReactNode, useCallback, useRef } from 'react';
import { User, Session, AuthChangeEvent } from '@supabase/supabase-js';
// Usa o Lovable Cloud para autenticação e dados principais
import { supabase } from '@/integrations/supabase/client';
type AppRole = 'admin' | 'seller' | 'user';

// Default trial days (can be overridden by app_settings)
const DEFAULT_TRIAL_DAYS = 5;

// Authentication states - explicit for better control
type AuthState = 'loading' | 'authenticated' | 'unauthenticated';

const AUTH_DEBUG_PREFIX = '[useAuth]';

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

// Small helper to avoid infinite "Verificando sessão..." if the auth SDK hangs
const withTimeout = async <T,>(
  promise: Promise<T>,
  ms: number,
  label: string
): Promise<T> => {
  let timeoutId: number | undefined;
  const timeoutPromise = new Promise<T>((_, reject) => {
    timeoutId = window.setTimeout(() => {
      reject(new Error(`[useAuth] Timeout: ${label} (${ms}ms)`));
    }, ms);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutId) window.clearTimeout(timeoutId);
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
  const missingUserRecoveryAttempts = useRef(0);
  const signInInProgress = useRef(false); // Prevents self-heal from running during signIn
  const isProviderMounted = useRef(true);

  // Prevent setState after unmount in delayed fallbacks
  useEffect(() => {
    return () => {
      isProviderMounted.current = false;
    };
  }, []);

  // If the backend SDK hangs (common on flaky networks / blocked storage), avoid infinite "Verificando sessão..."
  const scheduleStaleSessionMarkerFallback = useCallback(
    (reason: string, delayMs = 6000) => {
      window.setTimeout(() => {
        if (!isProviderMounted.current) return;
        if (authStateRef.current !== 'loading') return;
        if (sessionRef.current?.user) return;
        if (!hasSessionMarker()) return;

        console.warn(`${AUTH_DEBUG_PREFIX} Stale session marker detected (${reason}). Forcing unauthenticated.`);
        clearCachedData();
        setSession(null);
        setUser(null);
        setProfile(null);
        setRole(null);
        setAuthState('unauthenticated');
      }, delayMs);
    },
    []
  );

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
    // CRITICAL: Skip self-heal during signIn - user will be set in the same React update batch
    if (signInInProgress.current) return;
    if (missingUserRecoveryAttempts.current >= 1) {
      // Avoid infinite loops on slow/unstable networks where getSession() can hang.
      console.warn('[useAuth] Skipping repeated recovery attempt (authenticated without user)');
      return;
    }

    missingUserRecoveryAttempts.current += 1;

    recoveringMissingSession.current = true;
    console.warn(`${AUTH_DEBUG_PREFIX} Inconsistent state: authenticated without user. Attempting recovery...`);

    // Keep UI stable while we attempt session recovery.
    setAuthState('loading');

    const recover = async () => {
      try {
        const { data, error } = await withTimeout(
          supabase.auth.getSession(),
          4000,
          'getSession(recover)'
        );

        if (!error && data?.session?.user) {
          console.log(`${AUTH_DEBUG_PREFIX} Session recovered successfully`);
          setSession(data.session);
          setUser(data.session.user);
          setAuthState('authenticated');
          return;
        }

        // IMPORTANT: Never mark as authenticated without a real session user.
        // If we have a session marker, stay in "loading" so ProtectedRoute can show
        // a stable "Reconectando" UI instead of bouncing to /auth.
        console.warn(`${AUTH_DEBUG_PREFIX} Session recovery failed; staying in reconnecting mode`, error);
        if (hasSessionMarker()) {
          scheduleStaleSessionMarkerFallback('recover-failed', 4000);
          return;
        }

        // No marker means we truly don't expect a session.
        clearCachedData();
        setSession(null);
        setUser(null);
        setProfile(null);
        setRole(null);
        setAuthState('unauthenticated');
      } catch (e) {
        console.error(`${AUTH_DEBUG_PREFIX} Session recovery exception; staying in reconnecting mode`, e);
        if (hasSessionMarker()) {
          scheduleStaleSessionMarkerFallback('recover-exception', 4000);
          return;
        }

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
          // Try to use cached data for UI hints, but DO NOT mark authenticated without a real user.
          const cachedUserId = localStorage.getItem(CACHE_KEYS.USER_ID);
          if (cachedUserId) {
            const cached = getCachedData(cachedUserId);
            if (cached.profile) setProfile(cached.profile);
            if (cached.role) setRole(cached.role);
          }
          console.warn(`${AUTH_DEBUG_PREFIX} Safety timeout: session marker present but session not restored yet; staying in loading`);
          // Avoid infinite "Verificando sessão..." if the SDK never recovers.
          scheduleStaleSessionMarkerFallback('init-safety-timeout', 6000);
          return;
        }
        // No valid cache - set unauthenticated
        setAuthState('unauthenticated');
      }
    }, 8000);

    const initializeAuth = async () => {
      // IMPORTANT: Set up auth state change listener FIRST
      const { data: { subscription } } = supabase.auth.onAuthStateChange(
        (event: AuthChangeEvent, currentSession: Session | null) => {
          // CRITICAL FIX: Use setTimeout(0) to avoid blocking the auth event handler
          // This prevents deadlocks during login by deferring async operations
          setTimeout(() => {
            if (!isMounted) return;
            
            console.log(`${AUTH_DEBUG_PREFIX} Auth event:`, event);
            
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
                  
                  // Fetch fresh data in background (non-blocking)
                  fetchUserData(currentSession.user.id, isMounted, currentSession.access_token);
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
          }, 0);
        }
      );

      // Get current session
      try {
        const { data: { session: initialSession }, error } = await withTimeout(
          supabase.auth.getSession(),
          6000,
          'getSession(init)'
        );
        
        if (error) {
          console.error('[useAuth] Session error:', error);
          // Cache is allowed to avoid blank UI, but DO NOT mark authenticated without a real user.
          if (hasSessionMarker()) {
            const cachedUserId = localStorage.getItem(CACHE_KEYS.USER_ID);
            if (cachedUserId) {
              const cached = getCachedData(cachedUserId);
              if (cached.profile) setProfile(cached.profile);
              if (cached.role) setRole(cached.role);
            }
            // Stay loading and let auth events resolve.
            scheduleStaleSessionMarkerFallback('getSession(init)-error', 6000);
            return;
          }
        }
        
        // INITIAL_SESSION event handles the rest.
        // If getSession() returns null but we *expect* a session (marker), keep loading
        // and let the safety timeout / auth events resolve it.
        if (!initialSession && isMounted && authStateRef.current === 'loading' && !hasSessionMarker()) {
          setAuthState('unauthenticated');
        }
        
      } catch (error) {
        console.error('[useAuth] Exception:', error);
        if (!isMounted) return;

        // Timeout/hang case: try cache before giving up.
        if (hasSessionMarker()) {
          const cachedUserId = localStorage.getItem(CACHE_KEYS.USER_ID);
          if (cachedUserId) {
            const cached = getCachedData(cachedUserId);
            if (cached.profile) setProfile(cached.profile);
            if (cached.role) setRole(cached.role);
          }
          // Keep loading (reconnecting). Do NOT mark authenticated without a real user.
          scheduleStaleSessionMarkerFallback('getSession(init)-exception', 6000);
          return;
        }

        setAuthState('unauthenticated');
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
    // Mark that signIn is in progress so self-heal effect doesn't interfere
    signInInProgress.current = true;
    
    // Prevent showing stale cached role/profile during a new login
    clearCachedData();
    setAuthState('loading');
    
    const normalizedEmail = email.trim().toLowerCase();
    const { data, error } = await supabase.auth.signInWithPassword({
      email: normalizedEmail,
      password,
    });
    
    if (error) {
      signInInProgress.current = false;
      setAuthState('unauthenticated');
      return { error: error as Error | null };
    }

    // CRITICAL: do not depend solely on onAuthStateChange.
    // If the auth event is delayed/missed, we would be stuck on "Verificando sessão...".
    if (data?.session?.user) {
      setSession(data.session);
      setUser(data.session.user);
      localStorage.setItem(CACHE_KEYS.SESSION_MARKER, 'true');

      const cached = getCachedData(data.session.user.id);
      if (cached.profile) setProfile(cached.profile);
      if (cached.role) setRole(cached.role);

      setAuthState('authenticated');
      // Fetch profile/role in background
      fetchUserData(data.session.user.id, true, data.session.access_token);
    } else {
      // Unexpected: no user in response; treat as unauthenticated to unblock UI
      setAuthState('unauthenticated');
    }
    
    // Clear flag after a micro-task to ensure React has processed the state updates
    setTimeout(() => { signInInProgress.current = false; }, 0);
    
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
  
  // Calcular período de teste/assinatura
  const trialInfo = (() => {
    if (!profile) {
      return { isInTrial: false, daysRemaining: 0, trialExpired: false };
    }
    
    // Permanentes nunca estão em trial
    if (profile.is_permanent) {
      return { isInTrial: false, daysRemaining: 999, trialExpired: false };
    }
    
    const now = new Date();
    let trialEndDate: Date;
    
    // Se tem subscription_expires_at, usa ele (seller com assinatura)
    if (profile.subscription_expires_at) {
      trialEndDate = new Date(profile.subscription_expires_at);
    } else if (profile.created_at) {
      // Senão, calcula baseado em created_at + trialDays (novo usuário/seller em trial)
      const createdAt = new Date(profile.created_at);
      trialEndDate = new Date(createdAt.getTime() + trialDays * 24 * 60 * 60 * 1000);
    } else {
      return { isInTrial: false, daysRemaining: 0, trialExpired: false };
    }
    
    const daysRemaining = Math.ceil((trialEndDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    
    // Para sellers, mostra como "assinatura" não "trial"
    // Para users, mostra como "trial"
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
