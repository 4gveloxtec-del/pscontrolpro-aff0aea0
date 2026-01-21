import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Shield, Eye, EyeOff, Loader2, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

export default function AdminAuth() {
  const navigate = useNavigate();
  const { signIn, user, role, loading: authLoading, isAdmin, authState } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Se já logado como admin, redirecionar para dashboard admin
  // CRITICAL: Only redirect when authState is 'authenticated' to prevent premature redirects
  useEffect(() => {
    if (authState === 'authenticated' && user && isAdmin) {
      navigate('/admin/dashboard', { replace: true });
    }
  }, [user, isAdmin, authState, navigate]);

  // Se logado mas não é admin, mostrar erro
  useEffect(() => {
    if (authState === 'authenticated' && user && role && !isAdmin) {
      setError('Acesso negado. Esta área é exclusiva para administradores.');
    }
  }, [user, role, isAdmin, authState]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const { error } = await signIn(email, password);
    
    if (error) {
      setError(error.message === 'Invalid login credentials' 
        ? 'Email ou senha incorretos' 
        : error.message);
      setLoading(false);
      return;
    }

    // O useEffect vai verificar se é admin e redirecionar
    setLoading(false);
  };

  // CRITICAL: Show loading while auth is being verified
  if (authLoading || authState === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
          <p className="text-slate-300 text-sm">Verificando sessão...</p>
        </div>
      </div>
    );
  }

  // Se acabou de logar, pode levar alguns instantes para carregar a role
  if (authState === 'authenticated' && user && !role) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
          <p className="text-slate-300 text-sm">Verificando permissões...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-4">
      <Card className="w-full max-w-md border-slate-700 bg-slate-800/50 backdrop-blur">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 w-16 h-16 rounded-2xl bg-blue-600 flex items-center justify-center">
            <Shield className="h-8 w-8 text-white" />
          </div>
          <CardTitle className="text-2xl text-white">Painel ADM</CardTitle>
          <CardDescription className="text-slate-400">
            Acesso exclusivo para administradores
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                {error}
              </div>
            )}
            
            <div className="space-y-2">
              <Label htmlFor="email" className="text-slate-300">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@exemplo.com"
                className="bg-slate-700/50 border-slate-600 text-white placeholder:text-slate-500"
                required
                autoComplete="email"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-slate-300">Senha</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="bg-slate-700/50 border-slate-600 text-white placeholder:text-slate-500 pr-10"
                  required
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              className="w-full bg-blue-600 hover:bg-blue-700 text-white"
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Entrando...
                </>
              ) : (
                'Entrar no Painel ADM'
              )}
            </Button>
          </form>

          <div className="mt-6 pt-4 border-t border-slate-700 text-center">
            <p className="text-xs text-slate-500">
              Área restrita. Acesso não autorizado será registrado.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
