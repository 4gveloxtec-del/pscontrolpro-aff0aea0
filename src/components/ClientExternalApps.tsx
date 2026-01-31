import { useState, useEffect, useMemo } from 'react';
import { useCrypto } from '@/hooks/useCrypto';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectGroup,
  SelectContent,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerTrigger } from '@/components/ui/drawer';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';
import { Plus, Trash2, Monitor, Mail, Key, ExternalLink, AppWindow, Copy, CalendarIcon, ChevronDown, ChevronUp } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { format, addMonths } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { type ExternalApp, FIXED_EXTERNAL_APPS } from './ExternalAppsManager';
import { InlineExternalAppCreator, InlineResellerAppCreator } from './InlineAppCreator';
import { RESELLER_DEVICE_APPS_QUERY_KEY, useResellerDeviceApps } from '@/hooks/useResellerDeviceApps';
import { useIsMobile } from '@/hooks/use-mobile';
import { AppSelectorMobile } from './AppSelectorMobile';

interface MacDevice {
  name: string;
  mac: string;
  device_key?: string;
}

interface ClientExternalApp {
  id: string;
  client_id: string;
  external_app_id: string | null;
  seller_id: string;
  devices: MacDevice[];
  email: string | null;
  password: string | null;
  notes: string | null;
  expiration_date: string | null;
  fixed_app_name: string | null;
  external_app?: ExternalApp;
}

interface ClientExternalAppsProps {
  clientId?: string;
  sellerId: string;
  onChange?: (apps: { appId: string; devices: MacDevice[]; email: string; password: string; expirationDate: string }[]) => void;
  initialApps?: { appId: string; devices: MacDevice[]; email: string; password: string; expirationDate: string }[];
}

export function ClientExternalApps({ clientId, sellerId, onChange, initialApps = [] }: ClientExternalAppsProps) {
  const { decrypt } = useCrypto();
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();
  
  const [localApps, setLocalApps] = useState<{ appId: string; devices: MacDevice[]; email: string; password: string; expirationDate: string }[]>(initialApps);
  const [expandedApps, setExpandedApps] = useState<Set<number>>(new Set());

  // Fetch custom external apps from external_apps table
  const { data: customApps = [] } = useQuery({
    queryKey: ['external-apps', sellerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('external_apps')
        .select('*')
        .eq('seller_id', sellerId)
        .eq('is_active', true)
        .order('name');
      if (error) throw error;
      return data as ExternalApp[];
    },
    enabled: !!sellerId,
  });

  // Fetch reseller apps from reseller_device_apps table (UNIFIED source)
  const { data: resellerApps = [] } = useQuery({
    queryKey: [RESELLER_DEVICE_APPS_QUERY_KEY, sellerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('reseller_device_apps' as any)
        .select('*')
        .eq('seller_id', sellerId)
        .eq('is_gerencia_app', false)
        .eq('is_active', true)
        .order('created_at');
      if (error) throw error;
      // Map to ExternalApp format
      return ((data || []) as any[]).map(item => ({
        id: item.id,
        name: item.name,
        website_url: null,
        download_url: item.download_url,
        auth_type: 'mac_key' as const,
        is_active: true,
        seller_id: item.seller_id,
        price: 0,
        cost: 0,
        // Keep extra fields for display
        icon: item.icon,
        downloader_code: item.downloader_code,
      })) as ExternalApp[];
    },
    enabled: !!sellerId,
  });

  // Group apps by source for better organization
  const groupedApps = useMemo(() => {
    return {
      system: FIXED_EXTERNAL_APPS,
      custom: customApps,
      reseller: resellerApps,
    };
  }, [customApps, resellerApps]);

  const availableApps = useMemo(() => {
    return [...FIXED_EXTERNAL_APPS, ...customApps, ...resellerApps];
  }, [customApps, resellerApps]);

  const { data: linkedApps = [] } = useQuery({
    queryKey: ['client-external-apps', clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('client_external_apps')
        .select(`*, external_app:external_apps(*)`)
        .eq('client_id', clientId!);
      if (error) throw error;
      
      const apps = data as unknown as ClientExternalApp[];
      for (const app of apps) {
        if (app.password) {
          try {
            app.password = await decrypt(app.password);
          } catch { /* keep as is */ }
        }
        app.devices = (app.devices as unknown as MacDevice[]) || [];
      }
      return apps;
    },
    enabled: !!clientId,
  });

  useEffect(() => {
    onChange?.(localApps);
  }, [localApps, onChange]);

  useEffect(() => {
    if (clientId && linkedApps.length > 0) {
      setLocalApps(linkedApps.map(la => {
        let appId = la.external_app_id || '';
        if (!appId && la.fixed_app_name) {
          // Check if it's a reseller app (prefixed with "RESELLER:")
          if (la.fixed_app_name.startsWith('RESELLER:')) {
            const resellerAppName = la.fixed_app_name.replace('RESELLER:', '');
            // Find the reseller app by name
            const matchingApp = resellerApps.find(ra => ra.name === resellerAppName);
            appId = matchingApp?.id || '';
          } else {
            // It's a fixed system app
            appId = 'fixed-' + la.fixed_app_name.toLowerCase().replace(/\s+/g, '-');
          }
        }
        return {
          appId,
          devices: la.devices || [],
          email: la.email || '',
          password: la.password || '',
          expirationDate: la.expiration_date || '',
        };
      }));
    }
  }, [clientId, linkedApps, resellerApps]);

  const toggleExpanded = (index: number) => {
    const newExpanded = new Set(expandedApps);
    if (newExpanded.has(index)) {
      newExpanded.delete(index);
    } else {
      newExpanded.add(index);
    }
    setExpandedApps(newExpanded);
  };

  const addApp = () => {
    if (availableApps.length === 0) {
      toast.error('Cadastre um app primeiro em Apps Pagos');
      return;
    }
    const newIndex = localApps.length;
    setLocalApps([...localApps, { appId: '', devices: [], email: '', password: '', expirationDate: '' }]);
    setExpandedApps(new Set([...expandedApps, newIndex]));
  };

  const removeApp = (index: number) => {
    setLocalApps(localApps.filter((_, i) => i !== index));
    const newExpanded = new Set<number>();
    expandedApps.forEach(i => {
      if (i < index) newExpanded.add(i);
      else if (i > index) newExpanded.add(i - 1);
    });
    setExpandedApps(newExpanded);
  };

  const updateApp = (index: number, updates: Partial<{ appId: string; devices: MacDevice[]; email: string; password: string; expirationDate: string }>) => {
    const newApps = [...localApps];
    newApps[index] = { ...newApps[index], ...updates };
    setLocalApps(newApps);
  };

  const addDevice = (appIndex: number) => {
    const newApps = [...localApps];
    if (newApps[appIndex].devices.length < 5) {
      newApps[appIndex].devices = [...newApps[appIndex].devices, { name: '', mac: '', device_key: '' }];
      setLocalApps(newApps);
    }
  };

  const removeDevice = (appIndex: number, deviceIndex: number) => {
    const newApps = [...localApps];
    newApps[appIndex].devices = newApps[appIndex].devices.filter((_, i) => i !== deviceIndex);
    setLocalApps(newApps);
  };

  const updateDevice = (appIndex: number, deviceIndex: number, updates: Partial<MacDevice>) => {
    const newApps = [...localApps];
    newApps[appIndex].devices[deviceIndex] = { ...newApps[appIndex].devices[deviceIndex], ...updates };
    setLocalApps(newApps);
  };

  const formatMacAddress = (value: string): string => {
    const cleaned = value.replace(/[^a-fA-F0-9]/g, '').toUpperCase();
    const formatted = cleaned.match(/.{1,2}/g)?.join(':') || cleaned;
    return formatted.slice(0, 17);
  };

  const getAppDetails = (appId: string) => availableApps.find(a => a.id === appId);

  return (
    <div className="space-y-2 w-full max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <Label className="flex items-center gap-1.5 text-sm">
          <AppWindow className="h-3.5 w-3.5 text-muted-foreground" />
          Apps Externos
          {localApps.length > 0 && (
            <Badge variant="secondary" className="text-xs h-5 px-1.5">
              {localApps.length}
            </Badge>
          )}
        </Label>
        <div className="flex items-center gap-1">
          <InlineResellerAppCreator
            sellerId={sellerId}
            onCreated={(_id) => {
              queryClient.invalidateQueries({ queryKey: [RESELLER_DEVICE_APPS_QUERY_KEY, sellerId] });
            }}
          />
          <InlineExternalAppCreator 
            sellerId={sellerId}
            onCreated={(_id) => {
              queryClient.invalidateQueries({ queryKey: ['external-apps', sellerId] });
            }}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addApp}
            className="h-7 text-xs gap-1"
          >
            <Plus className="h-3 w-3" />
            Vincular App
          </Button>
        </div>
      </div>

      {localApps.length === 0 ? (
        <div 
          className="text-center py-4 text-xs text-muted-foreground border border-dashed rounded-lg cursor-pointer hover:bg-muted/30 hover:border-primary/50 transition-colors"
          onClick={addApp}
        >
          <Plus className="h-5 w-5 mx-auto mb-1 opacity-50" />
          <p>Clique para vincular um app ao cliente</p>
          <p className="text-[10px] mt-1 opacity-70">{availableApps.length} apps disponíveis</p>
        </div>
      ) : (
        <div className="space-y-2">
          {localApps.map((app, appIndex) => {
            const appDetails = getAppDetails(app.appId);
            const isMacType = appDetails?.auth_type === 'mac_key';
            const isExpanded = expandedApps.has(appIndex);
            
            return (
              <div key={appIndex} className="border rounded-lg bg-card">
                {/* Header - Always visible */}
                <div 
                  className="flex items-center gap-2 p-2 cursor-pointer hover:bg-muted/50 transition-colors"
                  onClick={() => app.appId && toggleExpanded(appIndex)}
                >
                  <div className="flex-1 min-w-0">
                    {isMobile ? (
                      <AppSelectorMobile
                        value={app.appId}
                        onValueChange={(value) => {
                          const newApp = availableApps.find(a => a.id === value);
                          updateApp(appIndex, { 
                            appId: value,
                            devices: newApp?.auth_type === 'mac_key' ? [] : app.devices,
                            email: newApp?.auth_type === 'email_password' ? app.email : '',
                          });
                          if (value) setExpandedApps(new Set([...expandedApps, appIndex]));
                        }}
                        groupedApps={groupedApps}
                        availableApps={availableApps}
                      />
                    ) : (
                      <Select
                        value={app.appId}
                        onValueChange={(value) => {
                          const newApp = availableApps.find(a => a.id === value);
                          updateApp(appIndex, { 
                            appId: value,
                            devices: newApp?.auth_type === 'mac_key' ? [] : app.devices,
                            email: newApp?.auth_type === 'email_password' ? app.email : '',
                          });
                          if (value) setExpandedApps(new Set([...expandedApps, appIndex]));
                        }}
                      >
                        <SelectTrigger className="h-8 text-sm" onClick={(e) => e.stopPropagation()}>
                          <SelectValue placeholder="Selecione um app" />
                        </SelectTrigger>
                        <SelectContent className="max-h-[400px] w-[min(500px,calc(100vw-2rem))] p-0">
                          <div className="grid grid-cols-1 sm:grid-cols-2 sm:divide-x divide-border">
                            {/* Coluna Esquerda - Apps do Revendedor + Personalizados */}
                            <div className="max-h-[380px] overflow-y-auto">
                              <SelectGroup>
                                <SelectLabel className="text-xs font-semibold text-primary sticky top-0 bg-popover py-2 px-2 border-b">
                                  🏪 Apps do Revendedor
                                </SelectLabel>
                                {groupedApps.reseller.length === 0 ? (
                                  <div className="px-2 py-3 text-xs text-muted-foreground italic text-center">
                                    Nenhum app cadastrado
                                  </div>
                                ) : (
                                  groupedApps.reseller.map((availableApp) => (
                                    <SelectItem key={availableApp.id} value={availableApp.id} className="py-2">
                                      <div className="flex items-center gap-1.5">
                                        {availableApp.auth_type === 'mac_key' ? (
                                          <Monitor className="h-3 w-3 text-primary" />
                                        ) : (
                                          <Mail className="h-3 w-3 text-primary" />
                                        )}
                                        <span className="truncate font-medium">{availableApp.name}</span>
                                      </div>
                                    </SelectItem>
                                  ))
                                )}
                              </SelectGroup>

                              {/* Meus Apps Personalizados */}
                              {groupedApps.custom.length > 0 && (
                                <SelectGroup>
                                  <SelectLabel className="text-xs font-semibold text-accent-foreground sticky top-0 bg-popover py-2 px-2 border-y mt-1">
                                    ⭐ Meus Apps
                                  </SelectLabel>
                                  {groupedApps.custom.map((availableApp) => (
                                    <SelectItem key={availableApp.id} value={availableApp.id} className="py-2">
                                      <div className="flex items-center gap-1.5">
                                        {availableApp.auth_type === 'mac_key' ? (
                                          <Monitor className="h-3 w-3 text-accent-foreground" />
                                        ) : (
                                          <Mail className="h-3 w-3 text-accent-foreground" />
                                        )}
                                        <span className="truncate">{availableApp.name}</span>
                                        {(availableApp.price || 0) > 0 && (
                                          <Badge variant="outline" className="text-[9px] h-4 px-1 ml-1">
                                            R$ {availableApp.price}
                                          </Badge>
                                        )}
                                      </div>
                                    </SelectItem>
                                  ))}
                                </SelectGroup>
                              )}
                            </div>

                            {/* Coluna Direita - Apps do Sistema */}
                            <div className="max-h-[380px] overflow-y-auto">
                              <SelectGroup>
                                <SelectLabel className="text-xs text-muted-foreground sticky top-0 bg-popover py-2 px-2 border-b">
                                  📦 Apps do Sistema ({groupedApps.system.length})
                                </SelectLabel>
                                {groupedApps.system.map((availableApp) => (
                                  <SelectItem key={availableApp.id} value={availableApp.id} className="py-1.5">
                                    <div className="flex items-center gap-1.5">
                                      {availableApp.auth_type === 'mac_key' ? (
                                        <Monitor className="h-3 w-3 text-muted-foreground" />
                                      ) : (
                                        <Mail className="h-3 w-3 text-muted-foreground" />
                                      )}
                                      <span className="truncate text-sm">{availableApp.name}</span>
                                    </div>
                                  </SelectItem>
                                ))}
                              </SelectGroup>
                            </div>
                          </div>
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                  
                  {app.appId && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 shrink-0"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleExpanded(appIndex);
                      }}
                    >
                      {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </Button>
                  )}
                  
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeApp(appIndex);
                    }}
                    className="h-7 w-7 p-0 text-destructive hover:text-destructive hover:bg-destructive/10 shrink-0"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>

                {/* Expanded Content */}
                {app.appId && isExpanded && (
                  <div className="px-2 pb-2 space-y-2 border-t bg-muted/30">
                    {/* Links Section */}
                    {(appDetails?.website_url || appDetails?.download_url) && (
                      <div className="flex flex-wrap items-center gap-3 pt-2">
                        {/* Website link */}
                        {appDetails?.website_url && (
                          <a
                            href={appDetails.website_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1.5 text-xs text-primary hover:underline"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <ExternalLink className="h-3 w-3" />
                            Abrir site do app
                          </a>
                        )}
                        {/* Download link */}
                        {appDetails?.download_url && (
                          <a
                            href={appDetails.download_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1.5 text-xs text-green-600 dark:text-green-400 hover:underline"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <ExternalLink className="h-3 w-3" />
                            Download do App
                          </a>
                        )}
                      </div>
                    )}

                    {/* MAC Authentication */}
                    {isMacType && (
                      <div className="space-y-2 pt-1">
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-muted-foreground">Dispositivos ({app.devices.length}/5)</span>
                          {app.devices.length < 5 && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                addDevice(appIndex);
                              }}
                              className="h-6 text-xs gap-1 px-2"
                            >
                              <Plus className="h-3 w-3" />
                              Dispositivo
                            </Button>
                          )}
                        </div>
                        
                        {app.devices.map((device, deviceIndex) => (
                          <div key={deviceIndex} className="flex gap-1.5 items-start bg-background rounded p-1.5">
                            <div className="flex-1 grid grid-cols-3 gap-1.5">
                              <Input
                                value={device.name}
                                onChange={(e) => updateDevice(appIndex, deviceIndex, { name: e.target.value })}
                                placeholder="Nome"
                                className="h-7 text-xs"
                              />
                              <Input
                                value={device.mac}
                                onChange={(e) => updateDevice(appIndex, deviceIndex, { mac: formatMacAddress(e.target.value) })}
                                placeholder="MAC"
                                className="h-7 text-xs font-mono"
                                maxLength={17}
                              />
                              <Input
                                value={device.device_key || ''}
                                onChange={(e) => updateDevice(appIndex, deviceIndex, { device_key: e.target.value })}
                                placeholder="Key"
                                className="h-7 text-xs"
                              />
                            </div>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                removeDevice(appIndex, deviceIndex);
                              }}
                              className="h-7 w-7 p-0 text-destructive hover:bg-destructive/10"
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        ))}
                        
                        {app.devices.length === 0 && (
                          <p className="text-xs text-muted-foreground text-center py-2">
                            Clique em "Dispositivo" para adicionar
                          </p>
                        )}
                      </div>
                    )}

                    {/* Email + Password Authentication */}
                    {!isMacType && (
                      <div className="grid grid-cols-2 gap-2 pt-1">
                        <Input
                          type="email"
                          value={app.email}
                          onChange={(e) => updateApp(appIndex, { email: e.target.value })}
                          placeholder="E-mail"
                          className="h-8 text-sm"
                        />
                        <Input
                          type="text"
                          value={app.password}
                          onChange={(e) => updateApp(appIndex, { password: e.target.value })}
                          placeholder="Senha"
                          className="h-8 text-sm"
                        />
                      </div>
                    )}

                    {/* Expiration - Compact */}
                    <div className="flex items-center gap-2 flex-wrap pt-1">
                      <span className="text-xs text-muted-foreground">Vence:</span>
                      <div className="flex gap-1 flex-wrap">
                        {[6, 12].map((months) => (
                          <Button
                            key={months}
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-6 text-xs px-2"
                            onClick={(e) => {
                              e.stopPropagation();
                              const newDate = addMonths(new Date(), months);
                              updateApp(appIndex, { expirationDate: format(newDate, 'yyyy-MM-dd') });
                            }}
                          >
                            {months}m
                          </Button>
                        ))}
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className={cn(
                                "h-6 text-xs gap-1 px-2",
                                !app.expirationDate && "text-muted-foreground"
                              )}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <CalendarIcon className="h-3 w-3" />
                              {app.expirationDate
                                ? format(new Date(app.expirationDate + 'T12:00:00'), 'dd/MM/yy', { locale: ptBR })
                                : 'Data'}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <Calendar
                              mode="single"
                              selected={app.expirationDate ? new Date(app.expirationDate + 'T12:00:00') : undefined}
                              onSelect={(date) => {
                                if (date) {
                                  updateApp(appIndex, { expirationDate: format(date, 'yyyy-MM-dd') });
                                }
                              }}
                              initialFocus
                              className="p-2"
                            />
                          </PopoverContent>
                        </Popover>
                      </div>
                      {app.expirationDate && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-6 text-xs px-1 text-muted-foreground"
                          onClick={(e) => {
                            e.stopPropagation();
                            updateApp(appIndex, { expirationDate: '' });
                          }}
                        >
                          ×
                        </Button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Display component for showing linked apps in client cards
interface ClientExternalAppsDisplayProps {
  clientId: string;
}

export function ClientExternalAppsDisplay({ clientId }: ClientExternalAppsDisplayProps) {
  const { decrypt } = useCrypto();
  
  // Fetch reseller apps to get icon and download_url - uses same query key as ResellerAppsManager for cache sync
  const { data: resellerApps = [] } = useResellerDeviceApps(undefined);
  
  const { data: linkedApps = [], isLoading } = useQuery({
    queryKey: ['client-external-apps-display', clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('client_external_apps')
        .select(`*, external_app:external_apps(*)`)
        .eq('client_id', clientId);
      if (error) throw error;
      
      const apps = data as unknown as ClientExternalApp[];
      for (const app of apps) {
        if (app.password) {
          try {
            app.password = await decrypt(app.password);
          } catch { /* keep as is */ }
        }
        app.devices = (app.devices as unknown as MacDevice[]) || [];
      }
      return apps;
    },
    enabled: !!clientId,
    staleTime: 60000,
  });

  if (isLoading || linkedApps.length === 0) return null;

  // Helper to get reseller app info by name
  const getResellerAppInfo = (fixedName: string) => {
    if (!fixedName?.startsWith('RESELLER:')) return null;
    const appName = fixedName.replace('RESELLER:', '');
    return resellerApps.find(ra => ra.name === appName) || { name: appName, icon: '📱', download_url: null };
  };
  
  // Helper to get fixed system app info by name
  const getFixedAppInfo = (fixedName: string) => {
    if (!fixedName || fixedName.startsWith('RESELLER:')) return null;
    return FIXED_EXTERNAL_APPS.find(fa => fa.name === fixedName);
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copiado!`);
  };

  return (
    <div className="space-y-1.5 mt-2">
      {linkedApps.map((app) => {
        // Check if it's a reseller app and get its info
        const resellerInfo = app.fixed_app_name ? getResellerAppInfo(app.fixed_app_name) : null;
        // Check if it's a fixed system app
        const fixedAppInfo = app.fixed_app_name ? getFixedAppInfo(app.fixed_app_name) : null;
        
        // Display name: remove RESELLER: prefix, use reseller app name, or fallback
        let displayName = app.external_app?.name || 'App';
        let appIcon: string | null = null;
        let appLink = app.external_app?.website_url || app.external_app?.download_url;
        
        if (resellerInfo) {
          displayName = resellerInfo.name;
          appIcon = resellerInfo.icon;
          appLink = resellerInfo.download_url || appLink;
        } else if (fixedAppInfo) {
          // Fixed system app - use its website_url or download_url
          displayName = fixedAppInfo.name;
          appLink = fixedAppInfo.website_url || fixedAppInfo.download_url || appLink;
        } else if (app.fixed_app_name && !app.fixed_app_name.startsWith('RESELLER:')) {
          // Fallback for fixed system app not found in list
          displayName = app.fixed_app_name;
        }
        
        const isMacType = app.external_app?.auth_type === 'mac_key' || app.fixed_app_name;
        const hasLink = !!appLink;
        
        const handleAppClick = () => {
          if (hasLink && appLink) {
            window.open(appLink, '_blank', 'noopener,noreferrer');
            toast.success(`Abrindo: ${displayName}`);
          }
        };
        
        return (
          <div key={app.id} className="text-xs bg-muted/50 rounded p-1.5">
            <div className="flex items-center justify-between mb-1">
              {/* App name badge - clickable if has link */}
              <button
                onClick={handleAppClick}
                disabled={!hasLink}
                className={`inline-flex items-center gap-1 font-medium transition-colors ${
                  hasLink 
                    ? 'text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300 cursor-pointer' 
                    : 'text-foreground cursor-default'
                }`}
                title={hasLink ? `Clique para abrir ${displayName}` : displayName}
              >
                {appIcon ? (
                  <span className="text-sm">{appIcon}</span>
                ) : (
                  <AppWindow className="h-3 w-3" />
                )}
                {displayName}
                {hasLink && <ExternalLink className="h-2.5 w-2.5 opacity-70" />}
              </button>
              {app.expiration_date && (
                <Badge variant="outline" className="text-[10px] h-4 px-1">
                  {format(new Date(app.expiration_date + 'T12:00:00'), 'dd/MM/yy')}
                </Badge>
              )}
            </div>
            
            {isMacType && app.devices?.length > 0 && (
              <div className="space-y-0.5">
                {app.devices.map((device, i) => (
                  <div key={i} className="flex items-center gap-1 text-muted-foreground">
                    <Monitor className="h-3 w-3 text-green-500 flex-shrink-0" />
                    <span className="truncate">{device.name || `Disp ${i+1}`}:</span>
                    <button
                      onClick={() => copyToClipboard(device.mac, 'MAC')}
                      className="font-mono text-foreground hover:text-primary"
                    >
                      {device.mac}
                    </button>
                  </div>
                ))}
              </div>
            )}
            
            {!isMacType && app.email && (
              <div className="flex items-center gap-1 text-muted-foreground">
                <Mail className="h-3 w-3 flex-shrink-0" />
                <button
                  onClick={() => copyToClipboard(app.email!, 'Email')}
                  className="hover:text-primary truncate"
                >
                  {app.email}
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
