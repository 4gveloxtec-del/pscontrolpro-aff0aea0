import { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { toast } from 'sonner';
import { Plus, Trash2, ChevronDown, ChevronUp, Handshake, Key, User, Building2, Copy, Server } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ServerApp {
  id: string;
  name: string;
  icon: string;
  app_type: 'own' | 'partnership';
  auth_type: 'code' | 'user_password' | 'provider_user_password';
  provider_name: string | null;
  compatible_devices: string[];
  is_active: boolean;
}

interface AppCredential {
  serverAppId: string;
  authCode?: string;
  username?: string;
  password?: string;
  provider?: string;
}

interface ServerAppsConfig {
  serverId: string;
  serverName: string;
  apps: AppCredential[];
}

interface ServerPartnerAppsSectionProps {
  sellerId: string;
  servers: { id: string; name: string }[];
  selectedDevices: string;
  serverAppsConfig: ServerAppsConfig[];
  onChange: (config: ServerAppsConfig[]) => void;
}

// Map UI device names to database device types
const DEVICE_TYPE_MAPPING: Record<string, string> = {
  'Smart TV': 'smart_tv',
  'TV Android': 'tv_box',
  'Celular': 'celular',
  'TV Box': 'tv_box',
  'Video Game': 'tv_box',
  'PC': 'pc',
  'Notebook': 'pc',
  'Fire Stick': 'fire_stick',
  'Projetor Android': 'projetor',
};

export function ServerPartnerAppsSection({
  sellerId,
  servers,
  selectedDevices,
  serverAppsConfig,
  onChange,
}: ServerPartnerAppsSectionProps) {
  const [expandedServers, setExpandedServers] = useState<Set<string>>(new Set());

  // Convert UI device names to database device types
  const deviceTypes = useMemo(() => {
    if (!selectedDevices || selectedDevices.length === 0) return [];
    const devicesArray = selectedDevices.split(', ').filter(Boolean);
    return devicesArray
      .map(d => DEVICE_TYPE_MAPPING[d] || d.toLowerCase().replace(/\s+/g, '_'))
      .filter(Boolean);
  }, [selectedDevices]);

  // Fetch all server apps for the servers
  const { data: allServerApps = {} } = useQuery({
    queryKey: ['server-partner-apps', servers.map(s => s.id).join(',')],
    queryFn: async () => {
      if (!servers.length) return {};
      
      const result: Record<string, ServerApp[]> = {};
      
      for (const server of servers) {
        const { data, error } = await supabase
          .from('server_apps' as any)
          .select('*')
          .eq('server_id', server.id)
          .eq('app_type', 'partnership')
          .eq('is_active', true)
          .order('name');
        
        if (error) throw error;
        result[server.id] = (data || []) as unknown as ServerApp[];
      }
      
      return result;
    },
    enabled: servers.length > 0,
  });

  // Filter apps by device compatibility
  const getCompatibleApps = (serverId: string): ServerApp[] => {
    const apps = allServerApps[serverId] || [];
    if (!deviceTypes.length) return apps;
    
    return apps.filter(app => {
      const appDevices = app.compatible_devices || [];
      // Check if any of the client's devices are compatible
      return deviceTypes.some(d => appDevices.includes(d));
    });
  };

  const toggleServer = (serverId: string) => {
    const newExpanded = new Set(expandedServers);
    if (newExpanded.has(serverId)) {
      newExpanded.delete(serverId);
    } else {
      newExpanded.add(serverId);
    }
    setExpandedServers(newExpanded);
  };

  const addApp = (serverId: string, serverName: string, app: ServerApp) => {
    const existingConfig = serverAppsConfig.find(c => c.serverId === serverId);
    
    if (existingConfig) {
      // Check if app already added
      if (existingConfig.apps.some(a => a.serverAppId === app.id)) {
        toast.error('Este app já foi adicionado');
        return;
      }
      
      const newConfig = serverAppsConfig.map(c => 
        c.serverId === serverId
          ? { ...c, apps: [...c.apps, { serverAppId: app.id }] }
          : c
      );
      onChange(newConfig);
    } else {
      onChange([
        ...serverAppsConfig,
        { serverId, serverName, apps: [{ serverAppId: app.id }] }
      ]);
    }
    
    // Auto-expand
    setExpandedServers(new Set([...expandedServers, serverId]));
  };

  const removeApp = (serverId: string, serverAppId: string) => {
    const newConfig = serverAppsConfig.map(c => 
      c.serverId === serverId
        ? { ...c, apps: c.apps.filter(a => a.serverAppId !== serverAppId) }
        : c
    ).filter(c => c.apps.length > 0);
    onChange(newConfig);
  };

  const updateAppCredential = (serverId: string, serverAppId: string, field: keyof AppCredential, value: string) => {
    const newConfig = serverAppsConfig.map(c => 
      c.serverId === serverId
        ? {
            ...c,
            apps: c.apps.map(a => 
              a.serverAppId === serverAppId
                ? { ...a, [field]: value }
                : a
            )
          }
        : c
    );
    onChange(newConfig);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copiado!');
  };

  // Get app details by ID
  const getAppById = (serverId: string, appId: string): ServerApp | undefined => {
    return (allServerApps[serverId] || []).find(a => a.id === appId);
  };

  // Count total configured apps
  const totalApps = serverAppsConfig.reduce((acc, c) => acc + c.apps.length, 0);

  if (servers.length === 0) {
    return null;
  }

  return (
    <div className="space-y-3 p-3 rounded-lg bg-card border border-border">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-md bg-amber-500/10">
            <Handshake className="h-4 w-4 text-amber-600" />
          </div>
          <span className="font-medium text-sm">Apps Parceiros do Servidor</span>
          {totalApps > 0 && (
            <Badge variant="secondary" className="text-xs font-normal">
              {totalApps} app(s)
            </Badge>
          )}
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Configure os apps parceiros disponíveis para cada servidor vinculado ao cliente.
        {selectedDevices.length > 0 && ` Mostrando apps compatíveis com: ${selectedDevices}.`}
      </p>

      <div className="space-y-2">
        {servers.map(server => {
          const compatibleApps = getCompatibleApps(server.id);
          const configuredApps = serverAppsConfig.find(c => c.serverId === server.id)?.apps || [];
          const isExpanded = expandedServers.has(server.id);

          return (
            <Collapsible
              key={server.id}
              open={isExpanded}
              onOpenChange={() => toggleServer(server.id)}
            >
              <div className="rounded-lg border bg-muted/30">
                <CollapsibleTrigger className="w-full">
                  <div className="flex items-center justify-between p-3 hover:bg-muted/50 transition-colors">
                    <div className="flex items-center gap-2">
                      <Server className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium text-sm">{server.name}</span>
                      {configuredApps.length > 0 && (
                        <Badge variant="default" className="text-[10px]">
                          {configuredApps.length} app(s)
                        </Badge>
                      )}
                      <Badge variant="outline" className="text-[10px]">
                        {compatibleApps.length} disponíveis
                      </Badge>
                    </div>
                    {isExpanded ? (
                      <ChevronUp className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>
                </CollapsibleTrigger>

                <CollapsibleContent>
                  <div className="px-3 pb-3 space-y-3 border-t">
                    {/* Available apps to add */}
                    {compatibleApps.length > 0 && (
                      <div className="pt-3">
                        <Label className="text-xs text-muted-foreground mb-2 block">
                          Adicionar app parceiro:
                        </Label>
                        <div className="flex flex-wrap gap-1">
                          {compatibleApps.map(app => {
                            const isAdded = configuredApps.some(a => a.serverAppId === app.id);
                            return (
                              <Button
                                key={app.id}
                                type="button"
                                variant={isAdded ? "default" : "outline"}
                                size="sm"
                                onClick={() => !isAdded && addApp(server.id, server.name, app)}
                                className={cn(
                                  "h-7 text-xs gap-1",
                                  isAdded && "opacity-50 cursor-not-allowed"
                                )}
                                disabled={isAdded}
                              >
                                <span>{app.icon}</span>
                                {app.name}
                                {!isAdded && <Plus className="h-3 w-3" />}
                              </Button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {compatibleApps.length === 0 && (
                      <p className="text-xs text-muted-foreground text-center py-3">
                        Nenhum app parceiro compatível com os dispositivos selecionados.
                      </p>
                    )}

                    {/* Configured apps with credentials */}
                    {configuredApps.length > 0 && (
                      <div className="space-y-2 pt-2">
                        <Label className="text-xs text-muted-foreground">Apps configurados:</Label>
                        {configuredApps.map(appConfig => {
                          const app = getAppById(server.id, appConfig.serverAppId);
                          if (!app) return null;

                          return (
                            <div 
                              key={appConfig.serverAppId} 
                              className="p-3 rounded-lg bg-background border space-y-2"
                            >
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <span className="text-lg">{app.icon}</span>
                                  <span className="font-medium text-sm">{app.name}</span>
                                  <Badge variant="secondary" className="text-[10px]">
                                    {app.auth_type === 'code' && 'Código'}
                                    {app.auth_type === 'user_password' && 'Usuário/Senha'}
                                    {app.auth_type === 'provider_user_password' && 'Provedor'}
                                  </Badge>
                                </div>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => removeApp(server.id, appConfig.serverAppId)}
                                  className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>

                              {/* Credential fields based on auth type */}
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                {app.auth_type === 'code' && (
                                  <div className="space-y-1 sm:col-span-2">
                                    <Label className="text-xs flex items-center gap-1">
                                      <Key className="h-3 w-3" />
                                      Código de Acesso
                                    </Label>
                                    <div className="flex gap-1">
                                      <Input
                                        value={appConfig.authCode || ''}
                                        onChange={(e) => updateAppCredential(
                                          server.id, 
                                          appConfig.serverAppId, 
                                          'authCode', 
                                          e.target.value
                                        )}
                                        placeholder="Ex: tes41"
                                        className="h-8 text-sm font-mono"
                                      />
                                      {appConfig.authCode && (
                                        <Button
                                          type="button"
                                          variant="ghost"
                                          size="icon"
                                          onClick={() => copyToClipboard(appConfig.authCode!)}
                                          className="h-8 w-8"
                                        >
                                          <Copy className="h-3 w-3" />
                                        </Button>
                                      )}
                                    </div>
                                  </div>
                                )}

                                {app.auth_type === 'user_password' && (
                                  <>
                                    <div className="space-y-1">
                                      <Label className="text-xs flex items-center gap-1">
                                        <User className="h-3 w-3" />
                                        Usuário
                                      </Label>
                                      <div className="flex gap-1">
                                        <Input
                                          value={appConfig.username || ''}
                                          onChange={(e) => updateAppCredential(
                                            server.id, 
                                            appConfig.serverAppId, 
                                            'username', 
                                            e.target.value
                                          )}
                                          placeholder="Ex: 424161626"
                                          className="h-8 text-sm font-mono"
                                        />
                                        {appConfig.username && (
                                          <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => copyToClipboard(appConfig.username!)}
                                            className="h-8 w-8"
                                          >
                                            <Copy className="h-3 w-3" />
                                          </Button>
                                        )}
                                      </div>
                                    </div>
                                    <div className="space-y-1">
                                      <Label className="text-xs flex items-center gap-1">
                                        <Key className="h-3 w-3" />
                                        Senha
                                      </Label>
                                      <div className="flex gap-1">
                                        <Input
                                          value={appConfig.password || ''}
                                          onChange={(e) => updateAppCredential(
                                            server.id, 
                                            appConfig.serverAppId, 
                                            'password', 
                                            e.target.value
                                          )}
                                          placeholder="Ex: 53626633"
                                          className="h-8 text-sm font-mono"
                                        />
                                        {appConfig.password && (
                                          <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => copyToClipboard(appConfig.password!)}
                                            className="h-8 w-8"
                                          >
                                            <Copy className="h-3 w-3" />
                                          </Button>
                                        )}
                                      </div>
                                    </div>
                                  </>
                                )}

                                {app.auth_type === 'provider_user_password' && (
                                  <>
                                    <div className="space-y-1 sm:col-span-2">
                                      <Label className="text-xs flex items-center gap-1">
                                        <Building2 className="h-3 w-3" />
                                        Provedor
                                      </Label>
                                      <Input
                                        value={appConfig.provider || app.provider_name || ''}
                                        onChange={(e) => updateAppCredential(
                                          server.id, 
                                          appConfig.serverAppId, 
                                          'provider', 
                                          e.target.value
                                        )}
                                        placeholder={app.provider_name || "Ex: suquita34"}
                                        className="h-8 text-sm font-mono"
                                      />
                                    </div>
                                    <div className="space-y-1">
                                      <Label className="text-xs flex items-center gap-1">
                                        <User className="h-3 w-3" />
                                        Usuário
                                      </Label>
                                      <Input
                                        value={appConfig.username || ''}
                                        onChange={(e) => updateAppCredential(
                                          server.id, 
                                          appConfig.serverAppId, 
                                          'username', 
                                          e.target.value
                                        )}
                                        placeholder="Usuário"
                                        className="h-8 text-sm font-mono"
                                      />
                                    </div>
                                    <div className="space-y-1">
                                      <Label className="text-xs flex items-center gap-1">
                                        <Key className="h-3 w-3" />
                                        Senha
                                      </Label>
                                      <Input
                                        value={appConfig.password || ''}
                                        onChange={(e) => updateAppCredential(
                                          server.id, 
                                          appConfig.serverAppId, 
                                          'password', 
                                          e.target.value
                                        )}
                                        placeholder="Senha"
                                        className="h-8 text-sm font-mono"
                                      />
                                    </div>
                                  </>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </CollapsibleContent>
              </div>
            </Collapsible>
          );
        })}
      </div>
    </div>
  );
}
