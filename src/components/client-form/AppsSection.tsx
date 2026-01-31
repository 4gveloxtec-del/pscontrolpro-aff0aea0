import { useState, useEffect } from 'react';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Server, Store, Package, Handshake, AppWindow, Plus, ExternalLink } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ClientExternalApps } from '@/components/ClientExternalApps';
import { InlineServerAppCreator } from '@/components/InlineAppCreator';
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
  // Legacy paid apps (keeping for backwards compatibility but hidden)
  hasPaidApps: boolean;
  paidAppsData: PaidAppsData;
  onPaidAppsChange: (hasPaidApps: boolean, data: PaidAppsData) => void;
}

export function AppsSection({
  category,
  serverId,
  serverName,
  serverApps,
  appType,
  appName,
  onAppChange,
  clientId,
  sellerId,
  externalApps,
  onExternalAppsChange,
}: AppsSectionProps) {
  const navigate = useNavigate();
  
  // Server app selection (own or partnership)
  const [serverAppFilter, setServerAppFilter] = useState<'all' | 'own' | 'partnership'>('all');

  // Filter server apps
  const ownApps = serverApps.filter(a => a.app_type === 'own' && a.is_active);
  const partnershipApps = serverApps.filter(a => a.app_type === 'partnership' && a.is_active);

  const filteredServerApps = serverAppFilter === 'all' 
    ? serverApps.filter(a => a.is_active)
    : serverApps.filter(a => a.app_type === serverAppFilter && a.is_active);

  // Only show server apps for IPTV/P2P categories
  const showServerApps = (category === 'IPTV' || category === 'P2P') && serverId;

  return (
    <div className="space-y-4 w-full max-w-4xl mx-auto">
      {/* Server Apps Section - Only for IPTV/P2P */}
      {showServerApps && (
        <div className="space-y-3 p-3 rounded-lg bg-card border border-border">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-md bg-primary/10">
                <Server className="h-4 w-4 text-primary" />
              </div>
              <span className="font-medium text-sm">App do Servidor</span>
              {serverName && (
                <Badge variant="secondary" className="text-xs font-normal">
                  {serverName}
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  navigate('/servers');
                }}
                className="h-7 text-xs gap-1 text-muted-foreground hover:text-primary"
              >
                <ExternalLink className="h-3 w-3" />
                Servidores
              </Button>
              <InlineServerAppCreator
                sellerId={sellerId}
                serverId={serverId || ''}
                serverName={serverName}
              />
            </div>
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
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  navigate('/servers');
                }}
                className="h-7 text-xs gap-1"
              >
                <Plus className="h-3 w-3" />
                Cadastrar Apps
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              {/* Quick filter chips */}
              {(ownApps.length > 0 && partnershipApps.length > 0) && (
                <div className="flex flex-wrap gap-1">
                  <Button
                    type="button"
                    variant={serverAppFilter === 'all' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setServerAppFilter('all')}
                    className="h-6 text-xs px-2"
                  >
                    Todos ({ownApps.length + partnershipApps.length})
                  </Button>
                  <Button
                    type="button"
                    variant={serverAppFilter === 'own' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setServerAppFilter('own')}
                    className="h-6 text-xs px-2 gap-1"
                  >
                    <Package className="h-3 w-3" />
                    Próprios ({ownApps.length})
                  </Button>
                  <Button
                    type="button"
                    variant={serverAppFilter === 'partnership' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setServerAppFilter('partnership')}
                    className="h-6 text-xs px-2 gap-1"
                  >
                    <Handshake className="h-3 w-3" />
                    Parceria ({partnershipApps.length})
                  </Button>
                </div>
              )}

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
                <SelectTrigger className="h-9">
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
            </div>
          )}
        </div>
      )}

      {/* Apps do Cliente (Pagos + Revendedor) - Unified Section */}
      <div className="space-y-3 p-3 rounded-lg bg-card border border-border">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-md bg-accent/10">
              <AppWindow className="h-4 w-4 text-accent-foreground" />
            </div>
            <span className="font-medium text-sm">Apps do Cliente</span>
            {externalApps.length > 0 && (
              <Badge variant="secondary" className="text-xs font-normal">
                {externalApps.length} app(s)
              </Badge>
            )}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => navigate('/external-apps')}
            className="h-7 text-xs gap-1 text-muted-foreground hover:text-primary"
          >
            <Store className="h-3 w-3" />
            Gerenciar Apps
          </Button>
        </div>

        <p className="text-xs text-muted-foreground">
          Vincule apps ao cliente (Apps do Sistema, Apps do Revendedor e seus Apps Personalizados)
        </p>

        {/* External Apps Manager - Now unified */}
        <ClientExternalApps
          clientId={clientId}
          sellerId={sellerId}
          onChange={onExternalAppsChange}
          initialApps={externalApps}
        />
      </div>
    </div>
  );
}
