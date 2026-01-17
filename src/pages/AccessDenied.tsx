import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ShieldX, LogOut, Clock, Mail, MessageCircle, AlertTriangle, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

export default function AccessDenied() {
  const { profile, signOut, role, hasSystemAccess } = useAuth();
  const navigate = useNavigate();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  // Se o usuário ainda está em período de teste, redirecionar para dashboard
  useEffect(() => {
    if (hasSystemAccess) {
      navigate('/dashboard');
    }
  }, [hasSystemAccess, navigate]);

  const openAdminWhatsApp = () => {
    const phone = '5531998518865';
    const message = `Olá! Me chamo ${profile?.full_name || profile?.email} e gostaria de continuar usando o sistema PSControl como revendedor. Meu período de teste expirou.`;
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, '_blank');
  };

  const handleSignOut = async () => {
    try {
      setIsLoggingOut(true);
      await signOut();
      toast.success('Sessão encerrada com sucesso!');
      // Force navigation to auth page after logout
      window.location.href = '/auth';
    } catch (error) {
      console.error('Erro ao sair:', error);
      toast.error('Erro ao encerrar sessão. Tente novamente.');
      setIsLoggingOut(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="absolute inset-0 bg-gradient-to-br from-destructive/5 via-transparent to-warning/10 pointer-events-none" />

      <Card className="w-full max-w-md relative z-10 border-destructive/50">
        <CardHeader className="text-center">
          <div className="mx-auto w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mb-4">
            <AlertTriangle className="w-8 h-8 text-destructive" />
          </div>
          <CardTitle className="text-2xl">Período de Teste Expirado</CardTitle>
          <CardDescription>
            Seu teste gratuito de 5 dias terminou. Entre em contato para continuar usando o sistema.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          <div className="bg-muted/50 rounded-lg p-4 space-y-2">
            <div className="flex items-center gap-2 text-sm">
              <Mail className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">Email:</span>
              <span className="font-medium">{profile?.email}</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">Status:</span>
              <span className="text-destructive font-medium">Teste expirado</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <ShieldX className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">Permissão atual:</span>
              <span className="font-medium capitalize">{role || 'user'}</span>
            </div>
          </div>

          <div className="text-center text-sm text-muted-foreground">
            <p>
              Gostou do sistema? Entre em contato para ativar sua conta como <strong>Revendedor</strong> e continuar gerenciando seus clientes!
            </p>
          </div>

          <div className="flex flex-col gap-3">
            <Button
              onClick={openAdminWhatsApp}
              className="w-full gap-2 bg-success text-success-foreground hover:bg-success/90"
            >
              <MessageCircle className="h-4 w-4" />
              Ativar Conta via WhatsApp
            </Button>

            <Button 
              variant="ghost" 
              onClick={handleSignOut} 
              disabled={isLoggingOut}
              className="w-full gap-2"
            >
              {isLoggingOut ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <LogOut className="h-4 w-4" />
              )}
              {isLoggingOut ? 'Saindo...' : 'Sair da Conta'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
