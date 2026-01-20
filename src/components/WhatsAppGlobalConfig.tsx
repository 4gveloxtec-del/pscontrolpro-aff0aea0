import { useState, useEffect } from 'react';
import { useWhatsAppGlobalConfig } from '@/hooks/useWhatsAppGlobalConfig';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { 
  Save, 
  Eye,
  EyeOff,
  Loader2,
  Shield,
  Power,
  PowerOff,
  Users,
  Clock
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Alert, AlertDescription } from '@/components/ui/alert';

export function WhatsAppGlobalConfig() {
  const { 
    config, 
    isLoading, 
    error: configError, 
    saveConfig, 
  } = useWhatsAppGlobalConfig();
  
  const [pendingSellersCount, setPendingSellersCount] = useState(0);
  
  const [showToken, setShowToken] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [formData, setFormData] = useState({
    api_url: '',
    api_token: '',
    is_active: true,
    instance_name: '',
  });

  // Load config into form
  useEffect(() => {
    if (config) {
      setFormData({
        api_url: config.api_url || '',
        api_token: config.api_token || '',
        is_active: config.is_active ?? true,
        instance_name: config.instance_name || '',
      });
    }
  }, [config]);

  // Fetch count of sellers waiting for API activation
  useEffect(() => {
    const fetchPendingSellers = async () => {
      const { count } = await supabase
        .from('whatsapp_seller_instances')
        .select('*', { count: 'exact', head: true })
        .eq('is_connected', false);
      
      setPendingSellersCount(count || 0);
    };
    
    fetchPendingSellers();
  }, []);

  // Save config
  const handleSave = async () => {
    if (!formData.api_url || !formData.api_token) {
      toast.error('Preencha URL e Token da API');
      return;
    }

    setIsSaving(true);
    try {
      const result = await saveConfig({
        api_url: formData.api_url,
        api_token: formData.api_token,
        is_active: formData.is_active,
        instance_name: formData.instance_name || null,
      });

      if (result.error) {
        toast.error('Erro ao salvar: ' + result.error);
      } else {
        toast.success('Configuração global salva!');
      }
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* API Status */}
      <div className={cn(
        "p-4 rounded-lg border flex items-center gap-4",
        formData.is_active 
          ? "bg-success/10 border-success/30" 
          : "bg-destructive/10 border-destructive/30"
      )}>
        <div className={cn(
          "w-12 h-12 rounded-full flex items-center justify-center",
          formData.is_active ? "bg-success/20" : "bg-destructive/20"
        )}>
          {formData.is_active ? (
            <Power className="h-6 w-6 text-success" />
          ) : (
            <PowerOff className="h-6 w-6 text-destructive" />
          )}
        </div>
        <div className="flex-1">
          <p className="font-medium">
            {formData.is_active ? 'API WhatsApp Ativa' : 'API WhatsApp Inativa'}
          </p>
          <p className="text-sm text-muted-foreground">
            {formData.is_active 
              ? 'Revendedores podem conectar suas instâncias' 
              : 'Todas as automações estão desativadas'}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <Badge variant={formData.is_active ? "default" : "destructive"}>
            {formData.is_active ? 'ATIVA' : 'INATIVA'}
          </Badge>
        </div>
      </div>

      {/* Pending Sellers Alert */}
      {pendingSellersCount > 0 && !formData.is_active && (
        <Alert className="border-warning bg-warning/10">
          <Clock className="h-4 w-4 text-warning" />
          <AlertDescription className="text-warning-foreground">
            <strong>{pendingSellersCount} revendedor(es)</strong> configuraram suas instâncias 
            e estão aguardando a ativação da API para conectar o WhatsApp.
          </AlertDescription>
        </Alert>
      )}

      {/* Active Sellers Info */}
      {pendingSellersCount > 0 && formData.is_active && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50 border">
          <Users className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">
            <strong>{pendingSellersCount}</strong> instância(s) aguardando conexão via QR Code
          </span>
        </div>
      )}

      {/* Admin Notice */}
      <Alert>
        <Shield className="h-4 w-4" />
        <AlertDescription>
          Esta configuração é global e será utilizada por todos os revendedores.
          Você define a API, os revendedores apenas conectam suas instâncias.
        </AlertDescription>
      </Alert>

      {/* Form */}
      <div className="space-y-4">
        <div className="space-y-2">
          <Label>URL da API Evolution</Label>
          <Input
            type="url"
            value={formData.api_url}
            onChange={(e) => setFormData({ ...formData, api_url: e.target.value })}
            placeholder="https://api.evolution.exemplo.com"
          />
        </div>

        <div className="space-y-2">
          <Label>Token da API (Global)</Label>
          <div className="relative">
            <Input
              type={showToken ? 'text' : 'password'}
              value={formData.api_token}
              onChange={(e) => setFormData({ ...formData, api_token: e.target.value })}
              placeholder="Token de acesso à API"
              className="pr-10"
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="absolute right-0 top-0 h-full px-3"
              onClick={() => setShowToken(!showToken)}
            >
              {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          <Label>Nome da Instância do Admin (Chatbot)</Label>
          <Input
            value={formData.instance_name}
            onChange={(e) => setFormData({ ...formData, instance_name: e.target.value })}
            placeholder="Ex: admin-chatbot ou deixe vazio para detecção automática"
          />
          <p className="text-xs text-muted-foreground">
            Opcional: Nome da sua instância WhatsApp para o chatbot interativo do admin. 
            Se vazio, o sistema detecta automaticamente baseado no usuário admin.
          </p>
        </div>

        <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50 border">
          <div>
            <Label>API Ativa</Label>
            <p className="text-sm text-muted-foreground">
              Desativar impede todos os revendedores de enviar mensagens
            </p>
          </div>
          <Switch
            checked={formData.is_active}
            onCheckedChange={(checked) => setFormData({ ...formData, is_active: checked })}
          />
        </div>

        <Button className="w-full" onClick={handleSave} disabled={isSaving}>
          {isSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
          Salvar Configuração Global
        </Button>
      </div>

      {/* Info */}
      <div className="p-4 rounded-lg bg-primary/5 border border-primary/20 space-y-2">
        <span className="font-medium text-sm">Arquitetura Centralizada</span>
        <ul className="text-sm text-muted-foreground space-y-1">
          <li>• <strong>Admin:</strong> Configura URL, Token e opcionalmente nome da instância</li>
          <li>• <strong>Revendedores:</strong> Conectam suas próprias instâncias via QR Code</li>
          <li>• <strong>Detecção:</strong> Sistema identifica automaticamente Admin vs Revendedor</li>
          <li>• <strong>Chatbots:</strong> Cada um tem seu próprio chatbot independente</li>
          <li>• <strong>Privacidade:</strong> Você não tem acesso às conversas dos revendedores</li>
        </ul>
      </div>
    </div>
  );
}
