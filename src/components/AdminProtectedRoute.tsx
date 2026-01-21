import { Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Loader2 } from 'lucide-react';

interface AdminProtectedRouteProps {
  children: React.ReactNode;
}

/**
 * Componente que protege rotas do painel ADM
 * Apenas usuários com role=admin podem acessar
 * 
 * IMPORTANTE: NÃO redireciona enquanto authState está em 'loading'
 * para evitar logout intermitente ao recarregar a página.
 */
export function AdminProtectedRoute({ children }: AdminProtectedRouteProps) {
  const { user, loading, isAdmin, authState } = useAuth();

  // CRITICAL: Wait for auth verification to complete
  // Never redirect while loading - this prevents logout on page reload
  if (loading || authState === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
          <p className="text-slate-400">Verificando permissões...</p>
        </div>
      </div>
    );
  }

  // Se não está logado (authState confirmed as unauthenticated), redireciona para login do admin
  if (authState === 'unauthenticated' || !user) {
    return <Navigate to="/admin" replace />;
  }

  // Se não é admin após confirmação de autenticação, redireciona para página de acesso negado
  if (!isAdmin) {
    return <Navigate to="/admin/access-denied" replace />;
  }

  return <>{children}</>;
}
