import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ShieldX, LogOut, Clock, Mail, MessageCircle } from 'lucide-react';

export default function AccessDenied() {
  const { profile, signOut, role } = useAuth();

  const openAdminWhatsApp = () => {
    const phone = '5531998518865';
    const message = `Olá! Me chamo ${profile?.full_name || profile?.email} e gostaria de ter acesso ao sistema PSControl como revendedor.`;
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, '_blank');
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="absolute inset-0 bg-gradient-to-br from-destructive/5 via-transparent to-warning/10 pointer-events-none" />
      
      <Card className="w-full max-w-md relative z-10 border-warning/50">
        <CardHeader className="text-center">
          <div className="mx-auto w-16 h-16 rounded-full bg-warning/10 flex items-center justify-center mb-4">
            <ShieldX className="w-8 h-8 text-warning" />
          </div>
          <CardTitle className="text-2xl">Acesso Pendente</CardTitle>
          <CardDescription>
            Sua conta foi criada, mas você ainda não tem permissão para acessar o sistema.
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
              <span className="text-warning font-medium">Aguardando aprovação</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <ShieldX className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">Permissão atual:</span>
              <span className="font-medium capitalize">{role || 'user'}</span>
            </div>
          </div>

          <div className="text-center text-sm text-muted-foreground">
            <p>Entre em contato com o administrador para solicitar acesso como <strong>Revendedor</strong>.</p>
          </div>

          <div className="flex flex-col gap-3">
            <Button 
              onClick={openAdminWhatsApp}
              className="w-full gap-2 bg-green-600 hover:bg-green-700"
            >
              <MessageCircle className="h-4 w-4" />
              Solicitar Acesso via WhatsApp
            </Button>
            
            <Button 
              variant="outline" 
              onClick={signOut}
              className="w-full gap-2"
            >
              <LogOut className="h-4 w-4" />
              Sair da Conta
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
