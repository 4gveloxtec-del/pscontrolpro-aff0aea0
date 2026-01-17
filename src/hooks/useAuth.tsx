import { useState, useEffect, createContext, useContext, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

type AppRole = 'admin' | 'seller' | 'user';

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
  needsPasswordUpdate: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string, fullName: string, whatsapp?: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  updatePassword: (newPassword: string) => Promise<{ error: Error | null }>;
  clearPasswordUpdateFlag: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Cache keys
const CACHE_KEYS = {
  PROFILE: 'cached_profile',
  ROLE: 'cached_role',
  USER_ID: 'cached_user_id',
} as const;

// Cache helpers
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
  } catch {
    // Ignore storage errors
  }
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    // Safety timeout to prevent infinite loading
    const loadingTimeout = setTimeout(() => {
      if (isMounted && loading) {
        setLoading(false);
      }
    }, 5000);

    // Get initial session immediately
    supabase.auth.getSession()
      .then(({ data: { session }, error }) => {
        if (!isMounted) return;
        
        if (error) {
          clearCachedData();
          setLoading(false);
          return;
        }
        
        setSession(session);
        setUser(session?.user ?? null);
        
        if (session?.user) {
          // Load from cache first for instant display
          const cached = getCachedData(session.user.id);
          if (cached.profile) {
            setProfile(cached.profile);
          }
          if (cached.role) {
            setRole(cached.role);
          }
          
          // If we have cached data, show it immediately but still fetch fresh data
          if (cached.profile && cached.role) {
            setLoading(false);
          }
          
          fetchUserData(session.user.id, isMounted);
        } else {
          clearCachedData();
          setLoading(false);
        }
      })
      .catch(() => {
        if (isMounted) {
          clearCachedData();
          setLoading(false);
        }
      });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (!isMounted) return;
        
        setSession(session);
        setUser(session?.user ?? null);
        
        if (session?.user) {
          // Load from cache first
          const cached = getCachedData(session.user.id);
          if (cached.profile) {
            setProfile(cached.profile);
          }
          if (cached.role) {
            setRole(cached.role);
          }
          
          // Use queueMicrotask for faster execution than setTimeout
          queueMicrotask(() => {
            if (isMounted) fetchUserData(session.user.id, isMounted);
          });
        } else {
          setProfile(null);
          setRole(null);
          clearCachedData();
          setLoading(false);
        }
      }
    );

    return () => {
      isMounted = false;
      clearTimeout(loadingTimeout);
      subscription.unsubscribe();
    };
  }, []);

  const fetchUserData = async (userId: string, isMounted: boolean) => {
    try {
      const [profileResult, roleResult] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', userId).maybeSingle(),
        supabase.from('user_roles').select('role').eq('user_id', userId).maybeSingle()
      ]);

      if (!isMounted) return;

      if (profileResult.error) {
        // Silently handle profile fetch errors
      }
      if (roleResult.error) {
        // Silently handle role fetch errors
      }

      const nextProfile = (profileResult.data as Profile | null) ?? null;
      const nextRole = (roleResult.data?.role as AppRole | null) ?? null;

      // Always overwrite state with fresh data
      setProfile(nextProfile);
      setRole(nextRole);

      // Update cache with fresh data
      setCachedData(userId, nextProfile, nextRole);
    } catch {
      // Silently handle fetch errors
    } finally {
      if (isMounted) {
        setLoading(false);
      }
    }
  };

  const signIn = async (email: string, password: string) => {
    // Prevent showing stale cached role/profile during a new login
    clearCachedData();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error as Error | null };
  };

  const signUp = async (email: string, password: string, fullName: string, whatsapp?: string) => {
    const redirectUrl = `${window.location.origin}/`;
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectUrl,
        data: { full_name: fullName, whatsapp: whatsapp || null }
      }
    });
    return { error: error as Error | null };
  };

  const signOut = async () => {
    clearCachedData();
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setProfile(null);
    setRole(null);
  };

  const updatePassword = async (newPassword: string) => {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    return { error: error as Error | null };
  };

  const clearPasswordUpdateFlag = async () => {
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
  };

  const isAdmin = role === 'admin';
  const isSeller = role === 'seller';
  const isUser = role === 'user';
  
  // Calcular período de teste de 5 dias para usuários 'user'
  const TRIAL_DAYS = 5;
  const trialInfo = (() => {
    if (!profile?.created_at || role !== 'user') {
      return { isInTrial: false, daysRemaining: 0, trialExpired: false };
    }
    
    const createdAt = new Date(profile.created_at);
    const trialEndDate = new Date(createdAt.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000);
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
  const hasSystemAccess = isAdmin || isSeller || trialInfo.isInTrial;

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
