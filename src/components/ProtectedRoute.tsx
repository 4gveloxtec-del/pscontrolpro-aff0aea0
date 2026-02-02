import { Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useState, useEffect, useRef } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

type AllowedRole = 'admin' | 'seller' | 'user';

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: AllowedRole[];
  requireSystemAccess?: boolean; // Require admin or seller
}

// Timeout configuration
const ROLE_LOADING_TIMEOUT_MS = 10000; // 10 seconds

/**
 * Componente que protege rotas baseado em permissões
 * 
 * IMPORTANTE: Este componente NÃO redireciona para login enquanto o estado
 * de autenticação está sendo verificado (loading/authState === 'loading').
 * Isso evita logouts intermitentes ao recarregar a página.
 * 
 * - Se requireSystemAccess=true, apenas admin e seller podem acessar
 * - Se allowedRoles é especificado, apenas esses roles podem acessar
 * - Users sem permissão são redirecionados para /access-denied
 * - Timeout de 10s aplica role temporária para evitar loading infinito
 */
export function ProtectedRoute({ 
  children, 
  allowedRoles,
  requireSystemAccess = false 
}: ProtectedRouteProps) {
  const { role, loading, hasSystemAccess, authState, user } = useAuth();
  
  // State for timeout-based fallback
  const [hasTimedOut, setHasTimedOut] = useState(false);
  const [usingFallbackRole, setUsingFallbackRole] = useState(false);
  const timeoutRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(Date.now());

  // Track when we started waiting for role
  useEffect(() => {
    // Reset timeout state when role arrives
    if (role) {
      setHasTimedOut(false);
      setUsingFallbackRole(false);
      if (timeoutRef.current) {
        window.clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      return;
    }

    // Only start timeout when authenticated but waiting for role
    if (authState === 'authenticated' && user && !role && !timeoutRef.current) {
      startTimeRef.current = Date.now();
      
      timeoutRef.current = window.setTimeout(() => {
        console.warn('[ProtectedRoute] Role loading timeout reached (10s). Applying fallback.');
        setHasTimedOut(true);
        setUsingFallbackRole(true);
      }, ROLE_LOADING_TIMEOUT_MS);
    }

    return () => {
      if (timeoutRef.current) {
        window.clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [authState, user, role]);

  // Reset fallback when role finally arrives
  useEffect(() => {
    if (role && usingFallbackRole) {
      console.log('[ProtectedRoute] Role received, removing fallback banner');
      setUsingFallbackRole(false);
    }
  }, [role, usingFallbackRole]);

  const LoadingScreen = ({ message, showProgress = false }: { message: string; showProgress?: boolean }) => (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-4">
        <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        <p className="text-muted-foreground">{message}</p>
        {showProgress && (
          <p className="text-xs text-muted-foreground/60">
            Aguardando sincronização...
          </p>
        )}
      </div>
    </div>
  );

  // Warning banner for fallback role
  const FallbackRoleBanner = () => (
    <div className="fixed top-0 left-0 right-0 z-50 bg-amber-500/90 text-amber-950 px-4 py-2 flex items-center justify-center gap-2 text-sm font-medium shadow-lg">
      <AlertTriangle className="h-4 w-4" />
      <span>Sincronização de permissões pendente. Algumas funcionalidades podem estar limitadas.</span>
      <button 
        onClick={() => window.location.reload()}
        className="ml-2 flex items-center gap-1 px-2 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded text-xs transition-colors"
      >
        <RefreshCw className="h-3 w-3" />
        Recarregar
      </button>
    </div>
  );

  // CRITICAL: NEVER redirect while authentication is being verified.
  // Also, if we have authState='authenticated' but user/role hasn't arrived yet,
  // keep the UI stable in a "reconnecting" state instead of bouncing to /auth.
  if (loading || authState === 'loading') {
    return <LoadingScreen message="Verificando permissões..." />;
  }

  // Explicit logout only
  if (authState === 'unauthenticated') {
    return <Navigate to="/auth" replace />;
  }

  // Authenticated but user object still missing (slow/unstable network)
  if (!user) {
    return <LoadingScreen message="Reconectando sessão..." />;
  }

  // Determine effective role (use 'seller' as fallback after timeout)
  const effectiveRole = role || (hasTimedOut ? 'seller' : null);
  const effectiveHasSystemAccess = hasSystemAccess || hasTimedOut;

  // CRITICAL FIX: Não redirecionar enquanto role está carregando (evita flash de /access-denied)
  const isRoleStillLoading = authState === 'authenticated' && role === null && !hasTimedOut;

  // Se ainda não tem role e não atingiu timeout, aguarda carregar
  if (!effectiveRole) {
    return <LoadingScreen message="Carregando permissões..." showProgress />;
  }

  // Se requer acesso ao sistema (admin ou seller)
  // MAS só redireciona após role ser determinado
  if (requireSystemAccess && !effectiveHasSystemAccess && !isRoleStillLoading) {
    return <Navigate to="/access-denied" replace />;
  }

  // Se roles específicos são requeridos
  // After timeout, we use 'seller' as fallback - if that's not in allowedRoles, 
  // still allow access but show warning
  if (allowedRoles && !allowedRoles.includes(effectiveRole)) {
    // If using fallback, give benefit of the doubt and allow access with warning
    if (usingFallbackRole) {
      console.warn('[ProtectedRoute] Fallback role may not match required roles, allowing access with warning');
    } else {
      return <Navigate to="/access-denied" replace />;
    }
  }

  return (
    <>
      {usingFallbackRole && <FallbackRoleBanner />}
      <div className={usingFallbackRole ? 'pt-10' : ''}>
        {children}
      </div>
    </>
  );
}

/**
 * HOC para proteger rotas apenas para admin
 */
export function AdminOnly({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute allowedRoles={['admin']}>
      {children}
    </ProtectedRoute>
  );
}

/**
 * HOC para proteger rotas para seller (revendedor)
 */
export function SellerOnly({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute allowedRoles={['seller']}>
      {children}
    </ProtectedRoute>
  );
}

/**
 * HOC para proteger rotas que requerem acesso ao sistema (admin ou seller)
 */
export function SystemAccessRequired({ children }: { children: React.ReactNode }) {
  return (
    <ProtectedRoute requireSystemAccess>
      {children}
    </ProtectedRoute>
  );
}
