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
import { toast } from 'sonner';
import { Plus, Trash2, Monitor, Mail, Key, ExternalLink, AppWindow, Copy, CalendarIcon, ChevronDown, ChevronUp } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { format, addMonths } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import type { ExternalApp } from './ExternalAppsManager';
import { InlineExternalAppCreator, InlineResellerAppCreator } from './InlineAppCreator';

// Apps fixos visíveis para todos os revendedores
const FIXED_EXTERNAL_APPS: ExternalApp[] = [
  { id: 'fixed-clouddy', name: 'CLOUDDY', website_url: 'https://clouddy.online/', download_url: null, auth_type: 'mac_key', is_active: true, seller_id: 'system', price: 0, cost: 0 },
  { id: 'fixed-ibo-pro', name: 'IBO PRO', website_url: 'https://iboproapp.com/', download_url: null, auth_type: 'mac_key', is_active: true, seller_id: 'system', price: 0, cost: 0 },
  { id: 'fixed-ibo-player', name: 'IBO PLAYER', website_url: 'https://iboplayer.com/', download_url: null, auth_type: 'mac_key', is_active: true, seller_id: 'system', price: 0, cost: 0 },
  { id: 'fixed-smartone', name: 'SMARTONE', website_url: 'https://smartone-iptv.com/', download_url: null, auth_type: 'mac_key', is_active: true, seller_id: 'system', price: 0, cost: 0 },
  { id: 'fixed-abe-player', name: 'ABE PLAYER', website_url: 'https://abeplayertv.com/', download_url: null, auth_type: 'mac_key', is_active: true, seller_id: 'system', price: 0, cost: 0 },
  { id: 'fixed-all-player', name: 'ALL PLAYER', website_url: 'https://iptvallplayer.com/', download_url: null, auth_type: 'mac_key', is_active: true, seller_id: 'system', price: 0, cost: 0 },
  { id: 'fixed-bay-iptv', name: 'BAY IPTV', website_url: 'https://cms.bayip.tv/user/manage/playlist', download_url: null, auth_type: 'mac_key', is_active: true, seller_id: 'system', price: 0, cost: 0 },
  { id: 'fixed-bob-player', name: 'BOB PLAYER', website_url: 'https://bobplayer.com/', download_url: null, auth_type: 'mac_key', is_active: true, seller_id: 'system', price: 0, cost: 0 },
  { id: 'fixed-duplecast', name: 'DUPLECAST', website_url: 'https://duplecast.com/', download_url: null, auth_type: 'mac_key', is_active: true, seller_id: 'system', price: 0, cost: 0 },
  { id: 'fixed-duplex-play', name: 'DUPLEX PLAY', website_url: 'https://edit.duplexplay.com/Default', download_url: null, auth_type: 'mac_key', is_active: true, seller_id: 'system', price: 0, cost: 0 },
  { id: 'fixed-easy-player', name: 'EASY PLAYER', website_url: 'https://easyplayer.io/#/home', download_url: null, auth_type: 'mac_key', is_active: true, seller_id: 'system', price: 0, cost: 0 },
  { id: 'fixed-family-player', name: 'FAMILY PLAYER', website_url: 'https://www.family4kplayer.com/', download_url: null, auth_type: 'mac_key', is_active: true, seller_id: 'system', price: 0, cost: 0 },
  { id: 'fixed-hot-iptv', name: 'HOT IPTV', website_url: 'https://hotplayer.app/', download_url: null, auth_type: 'mac_key', is_active: true, seller_id: 'system', price: 0, cost: 0 },
  { id: 'fixed-hush-play', name: 'HUSH PLAY', website_url: 'https://www.hushplayer.com/', download_url: null, auth_type: 'mac_key', is_active: true, seller_id: 'system', price: 0, cost: 0 },
  { id: 'fixed-iboss-player', name: 'IBOSS PLAYER', website_url: 'https://ibossiptv.com/', download_url: null, auth_type: 'mac_key', is_active: true, seller_id: 'system', price: 0, cost: 0 },
  { id: 'fixed-iboxx-player', name: 'IBOXX PLAYER', website_url: 'https://iboxxiptv.com/', download_url: null, auth_type: 'mac_key', is_active: true, seller_id: 'system', price: 0, cost: 0 },
  { id: 'fixed-king4k-player', name: 'KING4K PLAYER', website_url: 'https://king4kplayer.com/', download_url: null, auth_type: 'mac_key', is_active: true, seller_id: 'system', price: 0, cost: 0 },
  { id: 'fixed-ktn-player', name: 'KTN PLAYER', website_url: 'https://ktntvplayer.com/', download_url: null, auth_type: 'mac_key', is_active: true, seller_id: 'system', price: 0, cost: 0 },
  { id: 'fixed-lumina-player', name: 'LUMINA PLAYER', website_url: 'https://luminaplayer.com/#/home', download_url: null, auth_type: 'mac_key', is_active: true, seller_id: 'system', price: 0, cost: 0 },
  { id: 'fixed-mac-player', name: 'MAC PLAYER', website_url: 'https://mactvplayer.com/', download_url: null, auth_type: 'mac_key', is_active: true, seller_id: 'system', price: 0, cost: 0 },
  { id: 'fixed-mika-player', name: 'MIKA PLAYER', website_url: 'https://mikaplayer.com/', download_url: null, auth_type: 'mac_key', is_active: true, seller_id: 'system', price: 0, cost: 0 },
  { id: 'fixed-quick-player', name: 'QUICK PLAYER', website_url: 'https://quickplayer.app/#/home', download_url: null, auth_type: 'mac_key', is_active: true, seller_id: 'system', price: 0, cost: 0 },
  { id: 'fixed-rivolut-player', name: 'RIVOLUT PLAYER', website_url: 'https://rivolutplayer.com/', download_url: null, auth_type: 'mac_key', is_active: true, seller_id: 'system', price: 0, cost: 0 },
  { id: 'fixed-virginia-player', name: 'VIRGINIA PLAYER', website_url: 'https://virginia-player.com/', download_url: null, auth_type: 'mac_key', is_active: true, seller_id: 'system', price: 0, cost: 0 },
  { id: 'fixed-vu-player-pro', name: 'VU PLAYER PRO', website_url: 'https://vuplayer.pro/reseller/login', download_url: null, auth_type: 'mac_key', is_active: true, seller_id: 'system', price: 0, cost: 0 },
];

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

  // Fetch reseller apps from custom_products table (apps created in ResellerAppsManager)
  const { data: resellerApps = [] } = useQuery({
    queryKey: ['reseller-apps-for-external', sellerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('custom_products')
        .select('*')
        .eq('seller_id', sellerId)
        .like('name', 'APP_REVENDEDOR:%')
        .eq('is_active', true)
        .order('created_at');
      if (error) throw error;
      // Map to ExternalApp format
      return (data || []).map(item => ({
        id: item.id,
        name: item.name.replace('APP_REVENDEDOR:', ''),
        website_url: null,
        download_url: item.download_url,
        auth_type: 'mac_key' as const,
        is_active: true,
        seller_id: item.seller_id,
        price: 0,
        cost: 0,
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
          appId = 'fixed-' + la.fixed_app_name.toLowerCase().replace(/\s+/g, '-');
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
  }, [clientId, linkedApps]);

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
    <div className="space-y-2">
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
              queryClient.invalidateQueries({ queryKey: ['reseller-apps-for-external', sellerId] });
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
              <div key={appIndex} className="border rounded-lg bg-card overflow-hidden">
                {/* Header - Always visible */}
                <div 
                  className="flex items-center gap-2 p-2 cursor-pointer hover:bg-muted/50 transition-colors"
                  onClick={() => app.appId && toggleExpanded(appIndex)}
                >
                  <div className="flex-1 min-w-0">
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
                      <SelectContent className="max-h-[400px] min-w-[500px] p-0">
                        <div className="grid grid-cols-2 divide-x divide-border">
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
                    {/* Website link */}
                    {appDetails?.website_url && (
                      <a
                        href={appDetails.website_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 text-xs text-primary hover:underline pt-2"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <ExternalLink className="h-3 w-3" />
                        Abrir site do app
                      </a>
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

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copiado!`);
  };

  return (
    <div className="space-y-1.5 mt-2">
      {linkedApps.map((app) => {
        const appName = app.external_app?.name || app.fixed_app_name || 'App';
        const isMacType = app.external_app?.auth_type === 'mac_key' || app.fixed_app_name;
        const appLink = app.external_app?.website_url || app.external_app?.download_url;
        const hasLink = !!appLink;
        
        const handleAppClick = () => {
          if (hasLink && appLink) {
            window.open(appLink, '_blank', 'noopener,noreferrer');
            toast.success(`Abrindo: ${appName}`);
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
                title={hasLink ? `Clique para abrir ${appName}` : appName}
              >
                <AppWindow className="h-3 w-3" />
                {appName}
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
