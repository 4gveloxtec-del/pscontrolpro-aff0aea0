import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { 
  User, 
  Phone, 
  Mail, 
  Save, 
  Shield, 
  Palette, 
  Building2, 
  CreditCard, 
  Copy, 
  RefreshCw, 
  Share2,
  Bell,
  Info,
  Calendar,
  MessageCircle,
  ChevronRight,
  Download,
  HelpCircle,
  DollarSign,
  Monitor,
  ExternalLink,
} from 'lucide-react';
import { LayoutGrid, Trash2, Smartphone } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { ThemeSelector } from '@/components/ThemeSelector';
import { MenuStyleSelector } from '@/components/MenuStyleSelector';
import { InstallPWA } from '@/components/InstallPWA';
import { usePWA } from '@/hooks/usePWA';
import { NotificationSettings } from '@/components/NotificationSettings';
import { cn } from '@/lib/utils';
import { ResellerAppsManager } from '@/components/ResellerAppsManager';

// Setting item component for mobile-like appearance
function SettingItem({ 
  icon: Icon, 
  title, 
  description, 
  onClick, 
  rightElement,
  variant = 'default'
}: { 
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  onClick?: () => void;
  rightElement?: React.ReactNode;
  variant?: 'default' | 'success' | 'warning' | 'destructive';
}) {
  const variantClasses = {
    default: 'text-muted-foreground',
    success: 'text-success',
    warning: 'text-warning',
    destructive: 'text-destructive'
  };

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-4 p-4 hover:bg-muted/50 transition-colors text-left",
        !onClick && "cursor-default"
      )}
    >
      <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
        <Icon className="h-5 w-5 text-foreground" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-foreground">{title}</p>
        {description && (
          <p className={cn("text-sm truncate", variantClasses[variant])}>{description}</p>
        )}
      </div>
      {rightElement || (onClick && <ChevronRight className="h-5 w-5 text-muted-foreground" />)}
    </button>
  );
}

// Section component
function SettingSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-6">
      <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 mb-2">
        {title}
      </h2>
      <div className="bg-card rounded-xl border border-border divide-y divide-border overflow-hidden">
        {children}
      </div>
    </div>
  );
}

export default function Settings() {
  const { user, profile, isAdmin, isSeller } = useAuth();
  const { updateAvailable, checkForUpdates, applyUpdate, canInstall, isInstalled } = usePWA();
  const [isCheckingUpdates, setIsCheckingUpdates] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [showPriceSettings, setShowPriceSettings] = useState(false);
  const [showTrialSettings, setShowTrialSettings] = useState(false);
  const [showGerenciaAppSettings, setShowGerenciaAppSettings] = useState(false);
  const [appPrice, setAppPrice] = useState('25');
  const [trialDays, setTrialDays] = useState('5');
  const [gerenciaAppPanelUrl, setGerenciaAppPanelUrl] = useState('https://gerenciapp.top');
  const [gerenciaAppRegisterUrl, setGerenciaAppRegisterUrl] = useState('');
  const queryClient = useQueryClient();
  
  const [formData, setFormData] = useState({
    full_name: profile?.full_name || '',
    whatsapp: profile?.whatsapp || '',
    company_name: (profile as { company_name?: string })?.company_name || '',
    pix_key: (profile as { pix_key?: string })?.pix_key || '',
  });

  // Fetch app settings
  const { data: appSettings } = useQuery({
    queryKey: ['app-settings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('app_settings')
        .select('key, value');
      if (error) throw error;
      return data || [];
    },
    enabled: isAdmin,
  });

  useEffect(() => {
    if (appSettings) {
      const price = appSettings.find(s => s.key === 'app_monthly_price')?.value;
      if (price) setAppPrice(price);
      
      const trial = appSettings.find(s => s.key === 'seller_trial_days')?.value;
      if (trial) setTrialDays(trial);
      
      const panelUrl = appSettings.find(s => s.key === 'gerencia_app_panel_url')?.value;
      if (panelUrl) setGerenciaAppPanelUrl(panelUrl);
      
      const registerUrl = appSettings.find(s => s.key === 'gerencia_app_register_url')?.value;
      if (registerUrl) setGerenciaAppRegisterUrl(registerUrl);
    }
  }, [appSettings]);

  useEffect(() => {
    if (profile) {
      setFormData({
        full_name: profile.full_name || '',
        whatsapp: profile.whatsapp || '',
        company_name: (profile as { company_name?: string })?.company_name || '',
        pix_key: (profile as { pix_key?: string })?.pix_key || '',
      });
    }
  }, [profile]);

  const updateProfileMutation = useMutation({
    mutationFn: async (data: { full_name: string; whatsapp: string; company_name: string; pix_key: string }) => {
      const { error } = await supabase
        .from('profiles')
        .update(data)
        .eq('id', user!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profile'] });
      toast.success('Perfil atualizado com sucesso!');
      setShowProfile(false);
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateProfileMutation.mutate(formData);
  };

  const updatePriceMutation = useMutation({
    mutationFn: async (newPrice: string) => {
      const { error } = await supabase
        .from('app_settings')
        .update({ value: newPrice })
        .eq('key', 'app_monthly_price');
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['app-settings'] });
      toast.success('Valor do aplicativo atualizado!');
      setShowPriceSettings(false);
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const updateTrialDaysMutation = useMutation({
    mutationFn: async (newDays: string) => {
      const { error } = await supabase
        .from('app_settings')
        .update({ value: newDays })
        .eq('key', 'seller_trial_days');
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['app-settings'] });
      toast.success('Dias de teste atualizados!');
      setShowTrialSettings(false);
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const handleTrialDaysSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateTrialDaysMutation.mutate(trialDays);
  };

  const handlePriceSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updatePriceMutation.mutate(appPrice);
  };

  const updateGerenciaAppMutation = useMutation({
    mutationFn: async ({ panelUrl, registerUrl }: { panelUrl: string; registerUrl: string }) => {
      const { error: error1 } = await supabase
        .from('app_settings')
        .update({ value: panelUrl })
        .eq('key', 'gerencia_app_panel_url');
      if (error1) throw error1;
      
      const { error: error2 } = await supabase
        .from('app_settings')
        .update({ value: registerUrl })
        .eq('key', 'gerencia_app_register_url');
      if (error2) throw error2;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['app-settings'] });
      toast.success('Configurações do GerenciaApp atualizadas!');
      setShowGerenciaAppSettings(false);
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const handleGerenciaAppSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateGerenciaAppMutation.mutate({ 
      panelUrl: gerenciaAppPanelUrl, 
      registerUrl: gerenciaAppRegisterUrl 
    });
  };

  const copyPixKey = () => {
    if (formData.pix_key) {
      navigator.clipboard.writeText(formData.pix_key);
      toast.success('Chave PIX copiada!');
    }
  };

  const subscriptionStatus = () => {
    if (profile?.is_permanent) return { text: 'Permanente', color: 'success' as const };
    if (!profile?.subscription_expires_at) return { text: 'Não definido', color: 'default' as const };
    
    const expiresAt = new Date(profile.subscription_expires_at);
    const now = new Date();
    
    if (expiresAt < now) {
      return { text: 'Expirado', color: 'destructive' as const };
    }
    
    const daysLeft = Math.ceil((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    if (daysLeft <= 7) {
      return { 
        text: `Expira em ${daysLeft} dia${daysLeft > 1 ? 's' : ''}`, 
        color: 'warning' as const 
      };
    }
    
    return {
      text: format(expiresAt, "dd/MM/yyyy", { locale: ptBR }),
      color: 'success' as const
    };
  };

  const status = subscriptionStatus();

  const handleShare = async () => {
    const url = `${window.location.origin}/landing`;
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'PSControl',
          text: 'Confira este aplicativo de gerenciamento de clientes!',
          url: url,
        });
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          navigator.clipboard.writeText(url);
          toast.success('Link copiado!');
        }
      }
    } else {
      navigator.clipboard.writeText(url);
      toast.success('Link copiado!');
    }
  };

  const handleCheckUpdates = async () => {
    setIsCheckingUpdates(true);
    await checkForUpdates();
    setIsCheckingUpdates(false);
    if (!updateAvailable) {
      toast.success('Você está usando a versão mais recente!');
    }
  };

  const openAdminWhatsApp = () => {
    const phone = '5531998518865';
    const message = 'Olá! Preciso de ajuda com o PSControl.';
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, '_blank');
  };

  // Trial days settings view (Admin only)
  if (showTrialSettings && isAdmin) {
    return (
      <div className="space-y-6 animate-fade-in max-w-lg mx-auto">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => setShowTrialSettings(false)}>
            ← Voltar
          </Button>
          <h1 className="text-xl font-bold">Dias de Teste</h1>
        </div>

        <form onSubmit={handleTrialDaysSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="trial_days">Dias de Teste para Novos Revendedores</Label>
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <Input
                id="trial_days"
                type="number"
                value={trialDays}
                onChange={(e) => setTrialDays(e.target.value)}
                placeholder="5"
                min="1"
                max="30"
                step="1"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Novos revendedores terão acesso gratuito por este número de dias
            </p>
          </div>

          <Button type="submit" className="w-full" disabled={updateTrialDaysMutation.isPending}>
            <Save className="h-4 w-4 mr-2" />
            Salvar Dias de Teste
          </Button>
        </form>
      </div>
    );
  }

  // Price settings view (Admin only)
  if (showPriceSettings && isAdmin) {
    return (
      <div className="space-y-6 animate-fade-in max-w-lg mx-auto">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => setShowPriceSettings(false)}>
            ← Voltar
          </Button>
          <h1 className="text-xl font-bold">Valor do Aplicativo</h1>
        </div>

        <form onSubmit={handlePriceSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="app_price">Valor Mensal (R$)</Label>
            <div className="flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-muted-foreground" />
              <Input
                id="app_price"
                type="number"
                value={appPrice}
                onChange={(e) => setAppPrice(e.target.value)}
                placeholder="25"
                min="0"
                step="1"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Este valor será exibido para vendedores quando precisarem renovar a assinatura
            </p>
          </div>

          <Button type="submit" className="w-full" disabled={updatePriceMutation.isPending}>
            <Save className="h-4 w-4 mr-2" />
            Salvar Valor
          </Button>
        </form>
      </div>
    );
  }

  // GerenciaApp settings view (Admin only)
  if (showGerenciaAppSettings && isAdmin) {
    return (
      <div className="space-y-6 animate-fade-in max-w-lg mx-auto">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => setShowGerenciaAppSettings(false)}>
            ← Voltar
          </Button>
          <h1 className="text-xl font-bold">Configurações GerenciaApp</h1>
        </div>

        <form onSubmit={handleGerenciaAppSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="gerencia_panel_url">URL do Painel</Label>
            <div className="flex items-center gap-2">
              <ExternalLink className="h-4 w-4 text-muted-foreground" />
              <Input
                id="gerencia_panel_url"
                type="url"
                value={gerenciaAppPanelUrl}
                onChange={(e) => setGerenciaAppPanelUrl(e.target.value)}
                placeholder="https://gerenciapp.top"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Link de acesso rápido ao painel de gerenciamento
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="gerencia_register_url">Link de Cadastro (Afiliado)</Label>
            <div className="flex items-center gap-2">
              <User className="h-4 w-4 text-muted-foreground" />
              <Input
                id="gerencia_register_url"
                type="url"
                value={gerenciaAppRegisterUrl}
                onChange={(e) => setGerenciaAppRegisterUrl(e.target.value)}
                placeholder="https://gerenciapp.top/register?ref=seu_codigo"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Link de cadastro para revendedores (aparece na página de Painéis)
            </p>
          </div>

          {gerenciaAppPanelUrl && (
            <Button 
              type="button" 
              variant="outline" 
              className="w-full"
              onClick={() => window.open(gerenciaAppPanelUrl, '_blank')}
            >
              <ExternalLink className="h-4 w-4 mr-2" />
              Acessar Painel
            </Button>
          )}

          <Button type="submit" className="w-full" disabled={updateGerenciaAppMutation.isPending}>
            <Save className="h-4 w-4 mr-2" />
            Salvar Configurações
          </Button>
        </form>
      </div>
    );
  }

  // Profile edit view
  if (showProfile) {
    return (
      <div className="space-y-6 animate-fade-in max-w-lg mx-auto">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => setShowProfile(false)}>
            ← Voltar
          </Button>
          <h1 className="text-xl font-bold">Editar Perfil</h1>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <div className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-muted-foreground" />
              <Input
                id="email"
                value={profile?.email || ''}
                disabled
                className="bg-muted"
              />
            </div>
            <p className="text-xs text-muted-foreground">O email não pode ser alterado</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="full_name">Nome Completo</Label>
            <Input
              id="full_name"
              value={formData.full_name}
              onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="whatsapp">WhatsApp</Label>
            <div className="flex items-center gap-2">
              <Phone className="h-4 w-4 text-muted-foreground" />
              <Input
                id="whatsapp"
                value={formData.whatsapp}
                onChange={(e) => setFormData({ ...formData, whatsapp: e.target.value })}
                placeholder="+55 11 99999-9999"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="company_name">Nome da Empresa</Label>
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-muted-foreground" />
              <Input
                id="company_name"
                value={formData.company_name}
                onChange={(e) => setFormData({ ...formData, company_name: e.target.value })}
                placeholder="Minha Revenda IPTV"
              />
            </div>
            <p className="text-xs text-muted-foreground">Usado como {'{empresa}'} nos templates</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="pix_key">Chave PIX</Label>
            <div className="flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-muted-foreground" />
              <Input
                id="pix_key"
                value={formData.pix_key}
                onChange={(e) => setFormData({ ...formData, pix_key: e.target.value })}
                placeholder="email@exemplo.com, CPF, CNPJ ou chave aleatória"
                className="flex-1"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={copyPixKey}
                disabled={!formData.pix_key}
                title="Copiar chave PIX"
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">Usado como {'{pix}'} nas mensagens de cobrança</p>
          </div>

          <Button type="submit" className="w-full" disabled={updateProfileMutation.isPending}>
            <Save className="h-4 w-4 mr-2" />
            Salvar Alterações
          </Button>
        </form>
      </div>
    );
  }

  return (
    <div className="space-y-2 animate-fade-in max-w-lg mx-auto pb-6">
      {/* Header */}
      <div className="text-center py-6">
        <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-3">
          <User className="h-10 w-10 text-primary" />
        </div>
        <h1 className="text-xl font-bold">{profile?.full_name || 'Usuário'}</h1>
        <p className="text-sm text-muted-foreground">{profile?.email}</p>
        <span className="inline-block mt-2 px-3 py-1 bg-primary/10 text-primary text-xs font-medium rounded-full">
          {isAdmin ? 'Administrador' : 'Vendedor'}
        </span>
      </div>

      {/* Account Section */}
      <SettingSection title="Conta">
        <SettingItem
          icon={User}
          title="Meu Perfil"
          description="Editar informações pessoais"
          onClick={() => setShowProfile(true)}
        />
        {isSeller && (
          <SettingItem
            icon={Calendar}
            title="Vencimento"
            description={status.text}
            variant={status.color}
          />
        )}
        <SettingItem
          icon={Shield}
          title="Membro desde"
          description={profile?.created_at
            ? format(new Date(profile.created_at), "dd/MM/yyyy", { locale: ptBR })
            : 'Não disponível'}
        />
      </SettingSection>

      {/* App Section */}
      <SettingSection title="Aplicativo">
        <div className="p-4 border-b border-border">
          <NotificationSettings />
        </div>
        <SettingItem
          icon={RefreshCw}
          title="Atualizações"
          description={updateAvailable ? 'Nova versão disponível!' : 'Verificar atualizações'}
          variant={updateAvailable ? 'success' : 'default'}
          onClick={updateAvailable ? applyUpdate : handleCheckUpdates}
          rightElement={
            isCheckingUpdates ? (
              <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
            ) : undefined
          }
        />
        <SettingItem
          icon={Trash2}
          title="Limpar Cache"
          description="Resolver problemas de dados antigos"
          onClick={() => {
            // Clear all localStorage except essential items
            const keysToKeep = ['app-theme-cache'];
            const allKeys = Object.keys(localStorage);
            allKeys.forEach(key => {
              if (!keysToKeep.includes(key)) {
                localStorage.removeItem(key);
              }
            });
            
            // Clear sessionStorage
            sessionStorage.clear();
            
            // Clear React Query cache
            queryClient.clear();
            
            toast.success('Cache limpo! Recarregando...');
            setTimeout(() => window.location.reload(), 1000);
          }}
        />
        <SettingItem
          icon={RefreshCw}
          title="Recarregar App"
          description="Atualizar dados e interface"
          onClick={() => window.location.reload()}
        />
        {(canInstall || !isInstalled) && (
          <SettingItem
            icon={Download}
            title="Instalar App"
            description={isInstalled ? 'Já instalado' : 'Adicionar à tela inicial'}
            variant={isInstalled ? 'success' : 'default'}
          />
        )}
        <SettingItem
          icon={Share2}
          title="Compartilhar"
          description="Enviar link do aplicativo"
          onClick={handleShare}
        />
      </SettingSection>

      {/* Menu Style Section - For all users */}
      <SettingSection title="Personalização">
        <div className="p-4">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
              <LayoutGrid className="h-5 w-5 text-foreground" />
            </div>
            <div>
              <p className="font-medium text-foreground">Estilo do Menu</p>
              <p className="text-sm text-muted-foreground">Escolha como exibir o menu</p>
            </div>
          </div>
          <MenuStyleSelector />
        </div>
      </SettingSection>

      {/* Reseller Apps Section - For all sellers */}
      {user && !isAdmin && (
        <SettingSection title="Meus Aplicativos">
          <div className="p-4">
            <ResellerAppsManager sellerId={user.id} />
          </div>
        </SettingSection>
      )}

      {isAdmin && (
        <SettingSection title="Administração">
          <SettingItem
            icon={DollarSign}
            title="Valor do Aplicativo"
            description={`R$ ${appPrice},00/mês`}
            onClick={() => setShowPriceSettings(true)}
          />
          <SettingItem
            icon={Calendar}
            title="Dias de Teste"
            description={`${trialDays} dias para novos revendedores`}
            onClick={() => setShowTrialSettings(true)}
          />
          <SettingItem
            icon={Monitor}
            title="GerenciaApp"
            description="Configurar painel de apps"
            onClick={() => setShowGerenciaAppSettings(true)}
          />
        </SettingSection>
      )}

      {/* Appearance Section - Admin Only */}
      {isAdmin && (
        <SettingSection title="Aparência">
          <div className="p-4">
            <div className="flex items-center gap-4 mb-4">
              <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                <Palette className="h-5 w-5 text-foreground" />
              </div>
              <div>
                <p className="font-medium text-foreground">Tema do Sistema</p>
                <p className="text-sm text-muted-foreground">Personalize as cores</p>
              </div>
            </div>
            <ThemeSelector />
          </div>
        </SettingSection>
      )}

      {/* Support Section */}
      <SettingSection title="Suporte">
        <SettingItem
          icon={MessageCircle}
          title="Dúvidas? Chame o ADM"
          description="WhatsApp: (31) 99851-8865"
          onClick={openAdminWhatsApp}
        />
        <SettingItem
          icon={RefreshCw}
          title="Limpar Cache e Recarregar"
          description="Corrigir problemas de permissão ou dados antigos"
          onClick={() => {
            try {
              localStorage.removeItem('cached_profile');
              localStorage.removeItem('cached_role');
              localStorage.removeItem('cached_user_id');
              toast.success('Cache limpo! Recarregando...');
              setTimeout(() => window.location.reload(), 500);
            } catch {
              window.location.reload();
            }
          }}
        />
        <SettingItem
          icon={Info}
          title="Sobre"
          description="PSControl • v1.0.0"
        />
      </SettingSection>

      {/* PWA Install - Show if applicable */}
      <div className="px-4">
        <InstallPWA />
      </div>
    </div>
  );
}
