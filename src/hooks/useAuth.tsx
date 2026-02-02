import { useState, useEffect, createContext, useContext, ReactNode, useCallback, useRef } from 'react';
import { User, Session, AuthChangeEvent } from '@supabase/supabase-js';
// Usa o Lovable Cloud para autenticação e dados principais
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

type AppRole = 'admin' | 'seller' | 'user';

// Default trial days (can be overridden by app_settings)
const DEFAULT_TRIAL_DAYS = 5;

// Authentication states - explicit for better control
type AuthState = 'loading' | 'authenticated' | 'unauthenticated';

// State machine phases to prevent race conditions
type AuthPhase = 
  | 'idle'           // No operation in progress
  | 'initializing'   // Initial session check
  | 'signing_in'     // SignIn in progress
  | 'signing_out'    // SignOut in progress
  | 'fetching_data'  // Fetching profile/role
  | 'recovering';    // Self-heal recovery

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
  
  // ============= STATE MACHINE FOR RACE CONDITION PREVENTION =============
  // Single source of truth for current operation phase
  const phaseRef = useRef<AuthPhase>('idle');
  const phaseLockRef = useRef<Promise<void>>(Promise.resolve());
  
  // Helper to acquire exclusive lock for a phase
  const acquireLock = useCallback(async (newPhase: AuthPhase): Promise<boolean> => {
    // Wait for any pending operation to complete
    await phaseLockRef.current;
    
    // Check if we can transition to the new phase
    const currentPhase = phaseRef.current;
    
    // Define valid transitions
    const validTransitions: Record<AuthPhase, AuthPhase[]> = {
      'idle': ['initializing', 'signing_in', 'signing_out', 'fetching_data', 'recovering'],
      'initializing': [], // Must complete before any other operation
      'signing_in': [], // Exclusive - no parallel operations allowed
      'signing_out': [], // Exclusive
      'fetching_data': [], // Can be interrupted by sign_out
      'recovering': [], // Can be interrupted by sign_in/sign_out
    };
    
    // signing_out can always interrupt
    if (newPhase === 'signing_out') {
      console.log(`${AUTH_DEBUG_PREFIX} [StateMachine] Force transition: ${currentPhase} -> ${newPhase}`);
      phaseRef.current = newPhase;
      return true;
    }
    
    // Check if transition is valid
    if (currentPhase !== 'idle' && !validTransitions[currentPhase].includes(newPhase)) {
      console.log(`${AUTH_DEBUG_PREFIX} [StateMachine] Blocked: ${currentPhase} -> ${newPhase}`);
      return false;
    }
    
    console.log(`${AUTH_DEBUG_PREFIX} [StateMachine] Transition: ${currentPhase} -> ${newPhase}`);
    phaseRef.current = newPhase;
    return true;
  }, []);
  
  // Helper to release lock
  const releaseLock = useCallback(() => {
    console.log(`${AUTH_DEBUG_PREFIX} [StateMachine] Release: ${phaseRef.current} -> idle`);
    phaseRef.current = 'idle';
  }, []);
  
  // Refs to track component lifecycle
  const authStateRef = useRef<AuthState>('loading');
  const sessionRef = useRef<Session | null>(null);
  const isProviderMounted = useRef(true);
  const initializationComplete = useRef(false);

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
        
        // Don't interrupt active operations
        if (phaseRef.current !== 'idle' && phaseRef.current !== 'initializing') {
          console.log(`${AUTH_DEBUG_PREFIX} Stale marker fallback skipped - operation in progress: ${phaseRef.current}`);
          return;
        }

        console.warn(`${AUTH_DEBUG_PREFIX} Stale session marker detected (${reason}). Forcing unauthenticated.`);
        clearCachedData();
        setSession(null);
        setUser(null);
        setProfile(null);
        setRole(null);
        setAuthState('unauthenticated');
        phaseRef.current = 'idle';
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
   * Now protected by state machine - only runs when no other operation is in progress.
   */
  useEffect(() => {
    if (authState !== 'authenticated') return;
    if (user) return;
    
    // STATE MACHINE: Only attempt recovery if no operation is in progress
    if (phaseRef.current !== 'idle') {
      console.log(`${AUTH_DEBUG_PREFIX} Self-heal skipped - operation in progress: ${phaseRef.current}`);
      return;
    }

    const recover = async () => {
      // Try to acquire lock for recovery
      const hasLock = await acquireLock('recovering');
      if (!hasLock) {
        console.log(`${AUTH_DEBUG_PREFIX} Self-heal aborted - could not acquire lock`);
        return;
      }

      console.warn(`${AUTH_DEBUG_PREFIX} Inconsistent state: authenticated without user. Attempting recovery...`);
      setAuthState('loading');

      try {
        const { data, error } = await withTimeout(
          supabase.auth.getSession(),
          4000,
          'getSession(recover)'
        );

        if (!isProviderMounted.current) {
          releaseLock();
          return;
        }

        if (!error && data?.session?.user) {
          console.log(`${AUTH_DEBUG_PREFIX} Session recovered successfully`);
          setSession(data.session);
          setUser(data.session.user);
          setAuthState('authenticated');
          releaseLock();
          return;
        }

        // Recovery failed
        console.warn(`${AUTH_DEBUG_PREFIX} Session recovery failed`, error);
        if (hasSessionMarker()) {
          scheduleStaleSessionMarkerFallback('recover-failed', 4000);
          releaseLock();
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
        console.error(`${AUTH_DEBUG_PREFIX} Session recovery exception`, e);
        if (hasSessionMarker()) {
          scheduleStaleSessionMarkerFallback('recover-exception', 4000);
          releaseLock();
          return;
        }

        clearCachedData();
        setSession(null);
        setUser(null);
        setProfile(null);
        setRole(null);
        setAuthState('unauthenticated');
      } finally {
        releaseLock();
      }
    };

    recover();
  }, [authState, user, acquireLock, releaseLock, scheduleStaleSessionMarkerFallback]);

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

  // Fetch user data with state machine protection
  const fetchUserData = useCallback(async (userId: string, isMounted: boolean, accessToken?: string | null) => {
    // STATE MACHINE: Check if we can fetch data
    const currentPhase = phaseRef.current;
    if (currentPhase === 'signing_out' as AuthPhase) {
      console.log(`${AUTH_DEBUG_PREFIX} fetchUserData skipped - signing out`);
      return;
    }
    
    // If already fetching, skip
    if (phaseRef.current === 'fetching_data') {
      console.log(`${AUTH_DEBUG_PREFIX} fetchUserData skipped - already fetching`);
      return;
    }
    
    const hasLock = await acquireLock('fetching_data');
    if (!hasLock) {
      console.log(`${AUTH_DEBUG_PREFIX} fetchUserData aborted - could not acquire lock`);
      return;
    }
    
    setIsVerifyingRole(true);
    try {
      const [profileResult, roleResult] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', userId).maybeSingle(),
        supabase.from('user_roles').select('role').eq('user_id', userId)
      ]);

      if (!isMounted || !isProviderMounted.current) {
        releaseLock();
        return;
      }
      
      // Check if we were interrupted by signOut
      if ((phaseRef.current as AuthPhase) === 'signing_out') {
        console.log(`${AUTH_DEBUG_PREFIX} fetchUserData interrupted by signOut`);
        releaseLock();
        return;
      }

      if (profileResult.error) {
        console.warn('[useAuth] Profile fetch error:', profileResult.error);
      }
      if (roleResult.error) {
        console.warn('[useAuth] Role fetch error:', roleResult.error);
      }

      let nextProfile = (profileResult.data as Profile | null) ?? null;

      const roleRows = (roleResult.data as any[]) || [];
      let nextRole = (roleRows.find((r: any) => r?.role === 'admin')?.role || roleRows?.[0]?.role || null) as AppRole | null;

      // Se o usuário não tem role, tentar corrigir em background (NON-BLOCKING)
      if (!nextRole && accessToken) {
        console.log('[useAuth] User has no role, fixing in background with retry...');
        
        // Track if role was successfully fixed
        let roleFixed = false;
        
        // Fire-and-forget with retry logic and exponential backoff
        const fixRoleWithRetry = async (attempt = 1): Promise<void> => {
          const MAX_ATTEMPTS = 3;
          const baseDelay = 1000; // 1 second base
          
          try {
            console.log(`[useAuth] fix-user-roles attempt ${attempt}/${MAX_ATTEMPTS}`);
            
            const { data: fixData, error: fixError } = await supabase.functions.invoke('fix-user-roles', {
              headers: { Authorization: `Bearer ${accessToken}` }
            });
            
            if (!fixError && fixData?.role) {
              console.log('[useAuth] Role fixed successfully:', fixData.role);
              roleFixed = true;
              
              // Only update if we haven't signed out
              if ((phaseRef.current as AuthPhase) !== 'signing_out' && isProviderMounted.current) {
                setRole(fixData.role as AppRole);
                
                // Re-fetch profile in case it was also created
                const { data: newProfile } = await supabase
                  .from('profiles')
                  .select('*')
                  .eq('id', userId)
                  .maybeSingle();
                
                if (newProfile && (phaseRef.current as AuthPhase) !== 'signing_out') {
                  setProfile(newProfile as Profile);
                  setCachedData(userId, newProfile as Profile, fixData.role as AppRole);
                } else {
                  setCachedData(userId, nextProfile, fixData.role as AppRole);
                }
                
                // Show success toast if we had to retry
                if (attempt > 1) {
                  toast({
                    title: "Perfil sincronizado",
                    description: "Suas permissões foram atualizadas com sucesso.",
                  });
                }
              }
              return;
            }
            
            // Handle error or missing role
            const errorMsg = fixError?.message || 'Role não retornado';
            console.warn(`[useAuth] fix-user-roles attempt ${attempt} failed:`, errorMsg);
            
            if (attempt < MAX_ATTEMPTS) {
              // Exponential backoff: 2s, 4s, 8s...
              const delay = Math.pow(2, attempt) * baseDelay;
              console.log(`[useAuth] Retrying fix-user-roles in ${delay}ms (attempt ${attempt + 1}/${MAX_ATTEMPTS})`);
              await new Promise(resolve => setTimeout(resolve, delay));
              return fixRoleWithRetry(attempt + 1);
            }
            
            // All attempts failed
            handleAllAttemptsFailed();
            
          } catch (e) {
            console.error(`[useAuth] fix-user-roles attempt ${attempt} exception:`, e);
            
            if (attempt < MAX_ATTEMPTS) {
              const delay = Math.pow(2, attempt) * baseDelay;
              console.log(`[useAuth] Retrying fix-user-roles in ${delay}ms after error (attempt ${attempt + 1}/${MAX_ATTEMPTS})`);
              await new Promise(resolve => setTimeout(resolve, delay));
              return fixRoleWithRetry(attempt + 1);
            }
            
            // All attempts failed
            handleAllAttemptsFailed();
          }
        };
        
        // Handler when all retry attempts fail
        const handleAllAttemptsFailed = () => {
          console.error('[useAuth] fix-user-roles failed after 3 attempts - user stuck with temporary role');
          
          // Show error toast to user
          if (isProviderMounted.current) {
            toast({
              variant: "destructive",
              title: "Erro ao sincronizar perfil",
              description: "Não foi possível verificar suas permissões. Tente fazer logout e login novamente.",
            });
          }
        };
        
        // Start retry in background
        fixRoleWithRetry();
        
        // Use a temporary 'seller' role to unblock UI immediately
        // This will be replaced when background fix completes
        nextRole = 'seller' as AppRole;
        console.log('[useAuth] Using temporary seller role while fix runs in background');
      }

      // Always overwrite state with fresh data
      setProfile(nextProfile);
      setRole(nextRole);

      // Update cache with fresh data
      setCachedData(userId, nextProfile, nextRole);
      
      // Now we can confirm authentication
      if (isMounted && isProviderMounted.current) {
        setAuthState('authenticated');
      }
    } catch (error) {
      console.error('[useAuth] Error fetching user data:', error);
    } finally {
      releaseLock();
      if (isMounted && isProviderMounted.current) {
        setIsVerifyingRole(false);
      }
    }
  }, [acquireLock, releaseLock]);

  // Main authentication initialization
  useEffect(() => {
    let isMounted = true;

    // Acquire lock for initialization
    phaseRef.current = 'initializing';

    // Safety timeout - 8 seconds is enough for slow networks
    const loadingTimeout = setTimeout(() => {
      if (isMounted && authStateRef.current === 'loading') {
        console.log('[useAuth] Safety timeout reached, checking cache...');

        // If we already have a valid session, NEVER kick the user back to login.
        // Just mark as authenticated and let the data fetch continue.
        if (sessionRef.current?.user) {
          console.log('[useAuth] Session exists; keeping user authenticated after timeout');
          setAuthState('authenticated');
          phaseRef.current = 'idle';
          return;
        }

        // Check if we have cached data to use
        const sessionMarker = hasSessionMarker();
        if (sessionMarker) {
          const cachedUserId = localStorage.getItem(CACHE_KEYS.USER_ID);
          if (cachedUserId) {
            const cached = getCachedData(cachedUserId);
            if (cached.profile) setProfile(cached.profile);
            if (cached.role) setRole(cached.role);
          }
          console.warn(`${AUTH_DEBUG_PREFIX} Safety timeout: session marker present but session not restored yet`);
          scheduleStaleSessionMarkerFallback('init-safety-timeout', 6000);
          return;
        }
        // No valid cache - set unauthenticated
        setAuthState('unauthenticated');
        phaseRef.current = 'idle';
      }
    }, 8000);

    const initializeAuth = async () => {
      // IMPORTANT: Set up auth state change listener FIRST
      const { data: { subscription } } = supabase.auth.onAuthStateChange(
        (event: AuthChangeEvent, currentSession: Session | null) => {
          // CRITICAL FIX: Use setTimeout(0) to avoid blocking the auth event handler
          setTimeout(() => {
            if (!isMounted) return;
            
            console.log(`${AUTH_DEBUG_PREFIX} Auth event:`, event, `(phase: ${phaseRef.current})`);
            
            // STATE MACHINE: Skip events during certain phases
            if (phaseRef.current === 'signing_in' && event !== 'SIGNED_IN') {
              console.log(`${AUTH_DEBUG_PREFIX} Ignoring event during signIn: ${event}`);
              return;
            }
            
            switch (event) {
              case 'SIGNED_OUT':
                setSession(null);
                setUser(null);
                setProfile(null);
                setRole(null);
                clearCachedData();
                setAuthState('unauthenticated');
                phaseRef.current = 'idle';
                break;
                
              case 'SIGNED_IN':
              case 'TOKEN_REFRESHED':
              case 'USER_UPDATED':
                if (currentSession?.user) {
                  // Skip if signIn is handling this
                  if (phaseRef.current === 'signing_in') {
                    console.log(`${AUTH_DEBUG_PREFIX} Event handled by signIn flow, skipping duplicate processing`);
                    return;
                  }
                  
                  setSession(currentSession);
                  setUser(currentSession.user);
                  localStorage.setItem(CACHE_KEYS.SESSION_MARKER, 'true');

                  // Session exists: consider authenticated immediately
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

                  setAuthState('authenticated');
                  phaseRef.current = 'idle'; // Release init lock
                  fetchUserData(currentSession.user.id, isMounted, currentSession.access_token);
                } else {
                  // No session - unauthenticated
                  if (isMounted) {
                    setAuthState('unauthenticated');
                    phaseRef.current = 'idle';
                  }
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
          if (hasSessionMarker()) {
            const cachedUserId = localStorage.getItem(CACHE_KEYS.USER_ID);
            if (cachedUserId) {
              const cached = getCachedData(cachedUserId);
              if (cached.profile) setProfile(cached.profile);
              if (cached.role) setRole(cached.role);
            }
            scheduleStaleSessionMarkerFallback('getSession(init)-error', 6000);
            return;
          }
        }
        
        // INITIAL_SESSION event handles the rest.
        if (!initialSession && isMounted && authStateRef.current === 'loading' && !hasSessionMarker()) {
          setAuthState('unauthenticated');
          phaseRef.current = 'idle';
        }
        
      } catch (error) {
        console.error('[useAuth] Exception:', error);
        if (!isMounted) return;

        if (hasSessionMarker()) {
          const cachedUserId = localStorage.getItem(CACHE_KEYS.USER_ID);
          if (cachedUserId) {
            const cached = getCachedData(cachedUserId);
            if (cached.profile) setProfile(cached.profile);
            if (cached.role) setRole(cached.role);
          }
          scheduleStaleSessionMarkerFallback('getSession(init)-exception', 6000);
          return;
        }

        setAuthState('unauthenticated');
        phaseRef.current = 'idle';
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
  }, [fetchUserData, scheduleStaleSessionMarkerFallback]);

  const signIn = useCallback(async (email: string, password: string) => {
    // STATE MACHINE: Acquire exclusive lock for signIn
    const hasLock = await acquireLock('signing_in');
    if (!hasLock) {
      console.warn(`${AUTH_DEBUG_PREFIX} SignIn blocked - operation in progress: ${phaseRef.current}`);
      return { error: new Error('Operação em andamento. Aguarde.') };
    }
    
    // Prevent showing stale cached role/profile during a new login
    clearCachedData();
    setAuthState('loading');
    
    const normalizedEmail = email.trim().toLowerCase();
    
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      });
      
      if (error) {
        releaseLock();
        setAuthState('unauthenticated');
        return { error: error as Error | null };
      }

      // CRITICAL: Set state directly without waiting for onAuthStateChange
      if (data?.session?.user) {
        setSession(data.session);
        setUser(data.session.user);
        localStorage.setItem(CACHE_KEYS.SESSION_MARKER, 'true');

        const cached = getCachedData(data.session.user.id);
        if (cached.profile) setProfile(cached.profile);
        if (cached.role) setRole(cached.role);

        setAuthState('authenticated');
        
        // Release lock before starting background fetch
        releaseLock();
        
        // Fetch profile/role in background
        fetchUserData(data.session.user.id, true, data.session.access_token);
      } else {
        // Unexpected: no user in response
        releaseLock();
        setAuthState('unauthenticated');
      }
      
      return { error: null };
    } catch (e) {
      releaseLock();
      setAuthState('unauthenticated');
      return { error: e as Error };
    }
  }, [acquireLock, releaseLock, fetchUserData]);

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
    
    // STATE MACHINE: Force acquire lock (signOut always wins)
    await acquireLock('signing_out');
    
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
    
    releaseLock();
    console.log('[useAuth] Signed out successfully');
  }, [acquireLock, releaseLock]);

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
  // IMPORTANTE: Usa startOfToday() para cálculo correto dos dias restantes
  const trialInfo = (() => {
    // Helper para parsing seguro de datas (evita off-by-one de timezone)
    const safeParseDate = (dateStr: string) => {
      const normalized = /^\d{4}-\d{2}-\d{2}$/.test(dateStr) ? `${dateStr}T12:00:00` : dateStr;
      const d = new Date(normalized);
      return isNaN(d.getTime()) ? null : d;
    };
    
    // Usa meio-dia de hoje como referência para evitar problemas de timezone
    const today = new Date();
    today.setHours(12, 0, 0, 0);
    
    // Se o profile ainda não carregou, ainda conseguimos calcular um trial básico
    // baseado no created_at do usuário (evita banner/rotas “sumirem” durante o fetch).
    if (!profile) {
      const createdAt = user?.created_at ? safeParseDate(user.created_at) : null;
      if (!createdAt) {
        return { isInTrial: false, daysRemaining: 0, trialExpired: false };
      }

      const trialEndDate = new Date(createdAt.getTime() + trialDays * 24 * 60 * 60 * 1000);
      trialEndDate.setHours(12, 0, 0, 0);
      const msPerDay = 1000 * 60 * 60 * 24;
      const daysRemainingRaw = Math.round((trialEndDate.getTime() - today.getTime()) / msPerDay);
      const isExpired = daysRemainingRaw < 0;

      return {
        isInTrial: !isExpired,
        daysRemaining: Math.max(0, daysRemainingRaw),
        trialExpired: isExpired,
        trialEndDate,
      };
    }
    
    // Permanentes nunca estão em trial
    if (profile.is_permanent) {
      return { isInTrial: false, daysRemaining: 999, trialExpired: false };
    }
    
    let trialEndDate: Date | null = null;
    
    // Se tem subscription_expires_at, usa ele (seller com assinatura)
    if (profile.subscription_expires_at) {
      trialEndDate = safeParseDate(profile.subscription_expires_at);
    }
    
    // Fallback: calcula baseado em created_at + trialDays
    if (!trialEndDate && profile.created_at) {
      const createdAt = safeParseDate(profile.created_at);
      if (createdAt) {
        trialEndDate = new Date(createdAt.getTime() + trialDays * 24 * 60 * 60 * 1000);
      }
    }
    
    // Fallback final: usa created_at do auth user
    if (!trialEndDate && user?.created_at) {
      const createdAt = safeParseDate(user.created_at);
      if (createdAt) {
        trialEndDate = new Date(createdAt.getTime() + trialDays * 24 * 60 * 60 * 1000);
      }
    }
    
    // Se ainda não temos data, retorna estado padrão
    if (!trialEndDate) {
      return { isInTrial: false, daysRemaining: 0, trialExpired: false };
    }

    // Normaliza para meio-dia local (evita off-by-one quando o timestamp cai no limite do dia)
    trialEndDate.setHours(12, 0, 0, 0);
    
    // Calcula diferença em dias com base em datas normalizadas
    const msPerDay = 1000 * 60 * 60 * 24;
    const daysRemainingRaw = Math.round((trialEndDate.getTime() - today.getTime()) / msPerDay);
    const isExpired = daysRemainingRaw < 0;
    
    return {
      isInTrial: !isExpired,
      daysRemaining: Math.max(0, daysRemainingRaw),
      trialExpired: isExpired,
      trialEndDate
    };
  })();
  
  // hasSystemAccess: admin sempre, seller/user apenas se não expirado ou permanente
  // - Admin: sempre tem acesso
  // - Permanente: sempre tem acesso (is_permanent = true)
  // - Seller/User não permanente: só tem acesso se não expirou (trialInfo.isInTrial)
  //
  // CRITICAL FIX: Durante o reload rápido, o authState pode ser 'authenticated' mas 
  // role ainda é null (aguardando fetch). Nesse caso, NÃO devemos redirecionar para 
  // /access-denied. Retornamos hasSystemAccess = true temporariamente até o role carregar.
  // Isso evita o "flash" da tela de expirado durante reloads.
  const isPermanent = profile?.is_permanent === true;
  
  // Se autenticado mas role ainda não carregou, assume acesso temporário para evitar flash
  const isRoleStillLoading = authState === 'authenticated' && role === null;

  // CRITICAL: Durante reload, pode existir sessão/role mas o profile ainda não chegou.
  // Nesse intervalo, NÃO podemos concluir que a assinatura expirou, então bloqueamos
  // redirecionamentos/avisos até o profile ser carregado.
  const isProfileStillLoading = authState === 'authenticated' && !!user && profile === null;
  
  const hasSystemAccess = 
    isVerifyingRole || 
    isRoleStillLoading || // <-- Novo: evita flash durante carregamento de role
    isProfileStillLoading || // <-- Novo: evita flash de "assinatura expirada" antes do profile
    isAdmin || 
    isPermanent || 
    (isSeller && trialInfo.isInTrial) || 
    (!isSeller && !isAdmin && trialInfo.isInTrial);

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
