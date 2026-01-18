import { useState, useEffect } from 'react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Server, Store, Package, Handshake, Eye, EyeOff, AppWindow, Plus, ExternalLink } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { ClientExternalApps } from '@/components/ClientExternalApps';
import { useNavigate } from 'react-router-dom';

interface ServerApp {
  id: string;
  name: string;
  app_type: 'own' | 'partnership';
  icon: string;
  website_url: string | null;
  is_active: boolean;
}

interface ResellerApp {
  id: string;
  name: string;
  icon: string;
}

interface MacDevice {
  name: string;
  mac: string;
  device_key?: string;
}

interface ExternalAppAssignment {
  appId: string;
  devices: MacDevice[];
  email: string;
  password: string;
  expirationDate: string;
}

interface PaidAppsData {
  email: string;
  password: string;
  duration: string;
  expiration: string;
}

interface AppsSectionProps {
  category: string;
  serverId?: string;
  serverName?: string;
  serverApps: ServerApp[];
  resellerApps: ResellerApp[];
  appType: string;
  appName: string;
  onAppChange: (appType: string, appName: string) => void;
  // External apps
  clientId?: string;
  sellerId: string;
  externalApps: ExternalAppAssignment[];
  onExternalAppsChange: (apps: ExternalAppAssignment[]) => void;
  // Legacy paid apps
  hasPaidApps: boolean;
  paidAppsData: PaidAppsData;
  onPaidAppsChange: (hasPaidApps: boolean, data: PaidAppsData) => void;
}

type ViewMode = 'server' | 'reseller' | 'both';

const STORAGE_KEY_VIEW = 'apps-section-view-mode';
const STORAGE_KEY_RESELLER_VISIBLE = 'reseller-apps-visible';

export function AppsSection({
  category,
  serverId,
  serverName,
  serverApps,
  resellerApps,
  appType,
  appName,
  onAppChange,
  clientId,
  sellerId,
  externalApps,
  onExternalAppsChange,
  hasPaidApps,
  paidAppsData,
  onPaidAppsChange,
}: AppsSectionProps) {
  const navigate = useNavigate();
  
  // View mode state
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    const saved = localStorage.getItem(STORAGE_KEY_VIEW);
    return (saved as ViewMode) || 'server';
  });

  // Reseller apps visibility
  const [isResellerVisible, setIsResellerVisible] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEY_RESELLER_VISIBLE);
    return saved === 'true';
  });

  // Server app selection (own or partnership)
  const [serverAppFilter, setServerAppFilter] = useState<'all' | 'own' | 'partnership'>('all');

  // Save preferences
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_VIEW, viewMode);
  }, [viewMode]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_RESELLER_VISIBLE, String(isResellerVisible));
  }, [isResellerVisible]);

  // Filter server apps
  const ownApps = serverApps.filter(a => a.app_type === 'own' && a.is_active);
  const partnershipApps = serverApps.filter(a => a.app_type === 'partnership' && a.is_active);

  const filteredServerApps = serverAppFilter === 'all' 
    ? serverApps.filter(a => a.is_active)
    : serverApps.filter(a => a.app_type === serverAppFilter && a.is_active);

  // Only show for IPTV/P2P categories
  const showServerApps = (category === 'IPTV' || category === 'P2P') && serverId;

  return (
    <div className="space-y-3">
      {/* View Mode Control */}
      <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/50 border border-border">
        <div className="flex items-center gap-2">
          <AppWindow className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium">Exibição de Apps</span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant={viewMode === 'server' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setViewMode('server')}
            className="h-7 text-xs px-2"
          >
            <Server className="h-3 w-3 mr-1" />
            Servidor
          </Button>
          <Button
            type="button"
            variant={viewMode === 'reseller' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setViewMode('reseller')}
            className="h-7 text-xs px-2"
          >
            <Store className="h-3 w-3 mr-1" />
            Revendedor
          </Button>
          <Button
            type="button"
            variant={viewMode === 'both' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setViewMode('both')}
            className="h-7 text-xs px-2"
          >
            Ambos
          </Button>
        </div>
      </div>

      {/* Server Apps Section */}
      {(viewMode === 'server' || viewMode === 'both') && showServerApps && (
        <div className="space-y-3 p-4 rounded-lg bg-card border border-border">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-md bg-primary/10">
                <Server className="h-4 w-4 text-primary" />
              </div>
              <span className="font-medium text-sm">Apps do Servidor</span>
              {serverName && (
                <Badge variant="secondary" className="text-xs font-normal">
                  {serverName}
                </Badge>
              )}
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => navigate('/servers')}
              className="h-7 text-xs gap-1 text-muted-foreground hover:text-primary"
            >
              <Plus className="h-3 w-3" />
              Gerenciar Apps
              <ExternalLink className="h-3 w-3" />
            </Button>
          </div>

          {serverApps.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-3">
              <p className="text-xs text-muted-foreground text-center">
                Nenhum app cadastrado para este servidor.
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => navigate('/servers')}
                className="h-7 text-xs gap-1"
              >
                <Plus className="h-3 w-3" />
                Cadastrar Apps do Servidor
              </Button>
            </div>
          ) : (
            <>
              {/* Filter by app type */}
              <div className="flex items-center gap-2">
                <RadioGroup
                  value={serverAppFilter}
                  onValueChange={(v) => setServerAppFilter(v as 'all' | 'own' | 'partnership')}
                  className="flex gap-3"
                >
                  <div className="flex items-center space-x-1">
                    <RadioGroupItem value="all" id="filter-all" />
                    <Label htmlFor="filter-all" className="text-xs cursor-pointer">Todos</Label>
                  </div>
                  {ownApps.length > 0 && (
                    <div className="flex items-center space-x-1">
                      <RadioGroupItem value="own" id="filter-own" />
                      <Label htmlFor="filter-own" className="text-xs cursor-pointer flex items-center gap-1">
                        <Package className="h-3 w-3" />
                        Próprios ({ownApps.length})
                      </Label>
                    </div>
                  )}
                  {partnershipApps.length > 0 && (
                    <div className="flex items-center space-x-1">
                      <RadioGroupItem value="partnership" id="filter-partnership" />
                      <Label htmlFor="filter-partnership" className="text-xs cursor-pointer flex items-center gap-1">
                        <Handshake className="h-3 w-3" />
                        Parceria ({partnershipApps.length})
                      </Label>
                    </div>
                  )}
                </RadioGroup>
              </div>

              {/* App Selection */}
              <Select
                value={
                  appName && filteredServerApps.some(a => a.name === appName)
                    ? `serverapp_${appName}`
                    : appType === 'server' ? 'server_default' : ''
                }
                onValueChange={(v) => {
                  if (v === 'server_default') {
                    onAppChange('server', '');
                  } else if (v.startsWith('serverapp_')) {
                    const name = v.replace('serverapp_', '');
                    onAppChange('server', name);
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o app do servidor" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="server_default">📡 App Padrão do Servidor</SelectItem>
                  {filteredServerApps.map((app) => (
                    <SelectItem key={app.id} value={`serverapp_${app.name}`}>
                      <div className="flex items-center gap-2">
                        <span>{app.icon}</span>
                        <span>{app.name}</span>
                        <Badge variant="secondary" className="text-[10px] ml-1">
                          {app.app_type === 'own' ? 'Próprio' : 'Parceria'}
                        </Badge>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </>
          )}
        </div>
      )}

      {/* Reseller Apps Section */}
      {(viewMode === 'reseller' || viewMode === 'both') && (
        <Collapsible open={isResellerVisible} onOpenChange={setIsResellerVisible}>
          <div className="space-y-3 p-4 rounded-lg bg-card border border-border">
            <div className="flex items-center justify-between">
              <CollapsibleTrigger asChild>
                <div className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity">
                  <div className="p-1.5 rounded-md bg-accent/10">
                    <Store className="h-4 w-4 text-accent-foreground" />
                  </div>
                  <span className="font-medium text-sm">Apps do Revendedor</span>
                  <Badge variant="secondary" className="text-xs font-normal">
                    {externalApps.length + (hasPaidApps ? 1 : 0)} app(s)
                  </Badge>
                  <Button type="button" variant="ghost" size="sm" className="gap-1 h-6 px-2 text-xs text-muted-foreground hover:text-foreground">
                    {isResellerVisible ? (
                      <>
                        <EyeOff className="h-3 w-3" />
                        Ocultar
                      </>
                    ) : (
                      <>
                        <Eye className="h-3 w-3" />
                        Mostrar
                      </>
                    )}
                  </Button>
                </div>
              </CollapsibleTrigger>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  navigate('/external-apps');
                }}
                className="h-7 text-xs gap-1 text-muted-foreground hover:text-primary"
              >
                <Plus className="h-3 w-3" />
                Gerenciar Apps
                <ExternalLink className="h-3 w-3" />
              </Button>
            </div>

            <CollapsibleContent className="space-y-4 pt-2">
              {/* External Apps */}
              <ClientExternalApps
                clientId={clientId}
                sellerId={sellerId}
                onChange={onExternalAppsChange}
                initialApps={externalApps}
              />

              {/* Legacy Paid Apps */}
              <div className="space-y-3 pt-3 border-t border-border/50">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <AppWindow className="h-4 w-4 text-muted-foreground" />
                    <Label htmlFor="has_paid_apps" className="cursor-pointer text-sm text-muted-foreground">
                      Apps Pagos (Legado)
                    </Label>
                  </div>
                  <Switch
                    id="has_paid_apps"
                    checked={hasPaidApps}
                    onCheckedChange={(checked) => 
                      onPaidAppsChange(checked, { email: '', password: '', duration: '', expiration: '' })
                    }
                  />
                </div>
                <p className="text-xs text-muted-foreground/70">
                  Para novos cadastros, use "Apps Externos" acima.
                </p>

                {hasPaidApps && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">E-mail ou MAC</Label>
                      <Input
                        value={paidAppsData.email}
                        onChange={(e) => onPaidAppsChange(true, { ...paidAppsData, email: e.target.value })}
                        placeholder="email@exemplo.com"
                        className="h-9"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">Senha</Label>
                      <Input
                        value={paidAppsData.password}
                        onChange={(e) => onPaidAppsChange(true, { ...paidAppsData, password: e.target.value })}
                        placeholder="Senha do app"
                        className="h-9"
                      />
                    </div>
                  </div>
                )}
              </div>
            </CollapsibleContent>
          </div>
        </Collapsible>
      )}

      {/* Custom App Name (when not using server/reseller app) */}
      {appType === 'own' && !resellerApps.some(a => a.name === appName) && !serverApps.some(a => a.name === appName) && (
        <div className="space-y-2">
          <Label className="text-xs">Nome do Aplicativo Personalizado</Label>
          <Input
            value={appName}
            onChange={(e) => onAppChange('own', e.target.value)}
            placeholder="Ex: IPTV Smarters, Sparkle TV..."
            className="h-9"
          />
        </div>
      )}
    </div>
  );
}
