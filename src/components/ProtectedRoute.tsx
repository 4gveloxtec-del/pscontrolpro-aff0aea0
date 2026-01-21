import { Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';

type AllowedRole = 'admin' | 'seller' | 'user';

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: AllowedRole[];
  requireSystemAccess?: boolean; // Require admin or seller
}

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
 */
export function ProtectedRoute({ 
  children, 
  allowedRoles,
  requireSystemAccess = false 
}: ProtectedRouteProps) {
  const { role, loading, hasSystemAccess, authState, user } = useAuth();

  // CRITICAL: NEVER redirect while authentication is being verified
  // This prevents logout on page reload
  if (loading || authState === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-muted-foreground">Verificando permissões...</p>
        </div>
      </div>
    );
  }

  // Only redirect to auth if explicitly unauthenticated (no user)
  if (authState === 'unauthenticated' || !user) {
    return <Navigate to="/auth" replace />;
  }

  // Se requer acesso ao sistema (admin ou seller)
  if (requireSystemAccess && !hasSystemAccess) {
    return <Navigate to="/access-denied" replace />;
  }

  // Se roles específicos são requeridos
  if (allowedRoles && role && !allowedRoles.includes(role)) {
    return <Navigate to="/access-denied" replace />;
  }

  // Se não tem role nenhum após autenticação confirmada, também bloqueia
  if (!role) {
    return <Navigate to="/access-denied" replace />;
  }

  return <>{children}</>;
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
