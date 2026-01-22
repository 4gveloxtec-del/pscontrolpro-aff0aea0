import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useCrypto } from '@/hooks/useCrypto';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabaseExternal as supabase } from '@/lib/supabase-external';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { toast } from 'sonner';
import { Plus, Trash2, Monitor, Mail, Key, ExternalLink, Loader2, AppWindow, Copy, CalendarIcon, Lock } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { format, addMonths } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import type { ExternalApp } from './ExternalAppsManager';

// Apps fixos visíveis para todos os revendedores - NÃO podem ser editados ou removidos
const FIXED_EXTERNAL_APPS: ExternalApp[] = [
  // Apps em destaque (principais)
  { id: 'fixed-clouddy', name: 'CLOUDDY', website_url: 'https://clouddy.online/', download_url: null, auth_type: 'mac_key', is_active: true, seller_id: 'system', price: 0, cost: 0 },
  { id: 'fixed-ibo-pro', name: 'IBO PRO', website_url: 'https://iboproapp.com/', download_url: null, auth_type: 'mac_key', is_active: true, seller_id: 'system', price: 0, cost: 0 },
  { id: 'fixed-ibo-player', name: 'IBO PLAYER', website_url: 'https://iboplayer.com/', download_url: null, auth_type: 'mac_key', is_active: true, seller_id: 'system', price: 0, cost: 0 },
  { id: 'fixed-smartone', name: 'SMARTONE', website_url: 'https://smartone-iptv.com/', download_url: null, auth_type: 'mac_key', is_active: true, seller_id: 'system', price: 0, cost: 0 },
  // Demais apps em ordem alfabética
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
  clientId?: string; // For editing existing client
  sellerId: string;
  onChange?: (apps: { appId: string; devices: MacDevice[]; email: string; password: string; expirationDate: string }[]) => void;
  initialApps?: { appId: string; devices: MacDevice[]; email: string; password: string; expirationDate: string }[];
}

export function ClientExternalApps({ clientId, sellerId, onChange, initialApps = [] }: ClientExternalAppsProps) {
  const { encrypt, decrypt } = useCrypto();
  const queryClient = useQueryClient();
  
  // Local state for form (when creating new client)
  const [localApps, setLocalApps] = useState<{ appId: string; devices: MacDevice[]; email: string; password: string; expirationDate: string }[]>(initialApps);

  // Fetch available external apps (custom ones from reseller)
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

  // Combine fixed apps with custom apps
  const availableApps = useMemo(() => {
    return [...FIXED_EXTERNAL_APPS, ...customApps];
  }, [customApps]);

  // Fetch client's linked apps (only when editing)
  const { data: linkedApps = [], isLoading: isLoadingLinked } = useQuery({
    queryKey: ['client-external-apps', clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('client_external_apps')
        .select(`
          *,
          external_app:external_apps(*)
        `)
        .eq('client_id', clientId!);
      if (error) throw error;
      
      // Cast and decrypt passwords
      const apps = data as unknown as ClientExternalApp[];
      for (const app of apps) {
        if (app.password) {
          try {
            app.password = await decrypt(app.password);
          } catch {
            // Keep as is if decryption fails
          }
        }
        // Cast devices from JSON
        app.devices = (app.devices as unknown as MacDevice[]) || [];
      }
      return apps;
    },
    enabled: !!clientId,
  });

  // Sync with onChange when local apps change
  useEffect(() => {
    onChange?.(localApps);
  }, [localApps, onChange]);

  // Initialize local apps from linked apps when editing
  useEffect(() => {
    if (clientId && linkedApps.length > 0) {
      setLocalApps(linkedApps.map(la => {
        // Determine appId: use external_app_id if available, otherwise reconstruct fixed-* id from fixed_app_name
        let appId = la.external_app_id || '';
        if (!appId && la.fixed_app_name) {
          // Reconstruct the fixed-* id from the app name
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

  const addApp = () => {
    if (availableApps.length === 0) {
      toast.error('Cadastre um app primeiro em Apps Pagos');
      return;
    }
    setLocalApps([...localApps, { appId: '', devices: [], email: '', password: '', expirationDate: '' }]);
  };

  const removeApp = (index: number) => {
    const newApps = localApps.filter((_, i) => i !== index);
    setLocalApps(newApps);
  };

  const updateApp = (index: number, updates: Partial<{ appId: string; devices: MacDevice[]; email: string; password: string; expirationDate: string }>) => {
    const newApps = [...localApps];
    newApps[index] = { ...newApps[index], ...updates };
    setLocalApps(newApps);
  };

  const setQuickExpiration = (appIndex: number, months: number) => {
    const newDate = addMonths(new Date(), months);
    updateApp(appIndex, { expirationDate: format(newDate, 'yyyy-MM-dd') });
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

  // Auto-format MAC address with colons
  const formatMacAddress = (value: string): string => {
    // Remove all non-hex characters
    const cleaned = value.replace(/[^a-fA-F0-9]/g, '').toUpperCase();
    // Add colons every 2 characters
    const formatted = cleaned.match(/.{1,2}/g)?.join(':') || cleaned;
    // Limit to 17 characters (XX:XX:XX:XX:XX:XX)
    return formatted.slice(0, 17);
  };

  const getAppDetails = (appId: string) => availableApps.find(a => a.id === appId);

  if (availableApps.length === 0) {
    return (
      <div className="text-center py-4 text-sm text-muted-foreground border border-dashed rounded-lg">
        <AppWindow className="h-8 w-8 mx-auto mb-2 opacity-50" />
        <p>Nenhum app cadastrado.</p>
        <p className="text-xs mt-1">Cadastre apps no menu "Apps Pagos"</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Label className="flex items-center gap-2">
          <AppWindow className="h-4 w-4 text-muted-foreground" />
          Apps Externos
        </Label>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={addApp}
          className="h-7 text-xs gap-1"
        >
          <Plus className="h-3 w-3" />
          Adicionar App
        </Button>
      </div>

      {localApps.length === 0 ? (
        <div className="text-center py-4 text-sm text-muted-foreground border border-dashed rounded-lg">
          Nenhum app vinculado. Clique em "Adicionar App" para começar.
        </div>
      ) : (
        <div className="space-y-4">
          {localApps.map((app, appIndex) => {
            const appDetails = getAppDetails(app.appId);
            const isMacType = appDetails?.auth_type === 'mac_key';
            
            return (
              <Card key={appIndex} className="border-primary/20">
                <CardContent className="p-4 space-y-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 space-y-2">
                      <Label className="text-xs text-muted-foreground">Aplicativo</Label>
                      <Select
                        value={app.appId}
                        onValueChange={(value) => {
                          const newApp = availableApps.find(a => a.id === value);
                          updateApp(appIndex, { 
                            appId: value,
                            // Reset fields when changing app type
                            devices: newApp?.auth_type === 'mac_key' ? [] : app.devices,
                            email: newApp?.auth_type === 'email_password' ? app.email : '',
                            password: app.password,
                          });
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione um app" />
                        </SelectTrigger>
                        <SelectContent>
                          {availableApps.map((availableApp) => (
                            <SelectItem key={availableApp.id} value={availableApp.id}>
                              <div className="flex items-center gap-2">
                                {availableApp.auth_type === 'mac_key' ? (
                                  <Monitor className="h-4 w-4" />
                                ) : (
                                  <Mail className="h-4 w-4" />
                                )}
                                <span>{availableApp.name}</span>
                                {(availableApp.price ?? 0) > 0 && (
                                  <span className="text-xs text-muted-foreground ml-auto">
                                    R$ {(availableApp.price ?? 0).toFixed(2)}
                                  </span>
                                )}
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {appDetails && ((appDetails.price ?? 0) > 0 || (appDetails.cost ?? 0) > 0) && (
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs text-muted-foreground">
                            Venda: R$ {(appDetails.price ?? 0).toFixed(2)}
                          </span>
                          <span className="text-xs text-green-600 font-medium">
                            Lucro: R$ {((appDetails.price ?? 0) - (appDetails.cost ?? 0)).toFixed(2)}
                          </span>
                        </div>
                      )}
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeApp(appIndex)}
                      className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10 mt-5"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>

                  {app.appId && (
                    <>
                      {/* Show app website if available */}
                      {appDetails?.website_url && (
                        <div className="flex items-center gap-2 p-2 rounded bg-primary/5 border border-primary/10">
                          <ExternalLink className="h-4 w-4 text-primary" />
                          <a
                            href={appDetails.website_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm text-primary hover:underline truncate"
                          >
                            {appDetails.website_url}
                          </a>
                        </div>
                      )}

                      {/* MAC + Device Key Authentication */}
                      {isMacType && (
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <Label className="text-xs text-muted-foreground flex items-center gap-1">
                              <Monitor className="h-3 w-3" />
                              Dispositivos (até 5)
                            </Label>
                            {app.devices.length < 5 && (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => addDevice(appIndex)}
                                className="h-6 text-xs gap-1"
                              >
                                <Plus className="h-3 w-3" />
                                Adicionar
                              </Button>
                            )}
                          </div>
                          
                          {app.devices.length === 0 ? (
                            <div className="text-center py-3 text-xs text-muted-foreground border border-dashed rounded-lg">
                              Nenhum dispositivo. Clique em "Adicionar".
                            </div>
                          ) : (
                            <div className="space-y-2">
                              {app.devices.map((device, deviceIndex) => (
                                <div key={deviceIndex} className="flex gap-2 items-start p-2 rounded bg-muted/50 border">
                                  <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-2">
                                                <div className="space-y-1">
                                                  <Label className="text-xs text-muted-foreground">Nome/Aparelho</Label>
                                                  <Input
                                                    value={device.name}
                                                    onChange={(e) => updateDevice(appIndex, deviceIndex, { name: e.target.value })}
                                                    placeholder="TV Sala, Quarto, Celular..."
                                                    className="h-8 text-sm"
                                                  />
                                                </div>
                                    <div className="space-y-1">
                                      <Label className="text-xs text-muted-foreground">MAC</Label>
                                      <Input
                                        value={device.mac}
                                        onChange={(e) => updateDevice(appIndex, deviceIndex, { mac: formatMacAddress(e.target.value) })}
                                        placeholder="001A2B3C4D5E"
                                        className="h-8 text-sm font-mono"
                                        maxLength={17}
                                      />
                                    </div>
                                    <div className="space-y-1">
                                      <Label className="text-xs text-muted-foreground">Device Key</Label>
                                      <Input
                                        value={device.device_key || ''}
                                        onChange={(e) => updateDevice(appIndex, deviceIndex, { device_key: e.target.value })}
                                        placeholder="Chave..."
                                        className="h-8 text-sm"
                                      />
                                    </div>
                                  </div>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => removeDevice(appIndex, deviceIndex)}
                                    className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10 mt-4"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Email + Password Authentication */}
                      {!isMacType && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label className="text-xs text-muted-foreground flex items-center gap-1">
                              <Mail className="h-3 w-3" />
                              E-mail
                            </Label>
                            <Input
                              type="email"
                              value={app.email}
                              onChange={(e) => updateApp(appIndex, { email: e.target.value })}
                              placeholder="email@exemplo.com"
                              className="h-9"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label className="text-xs text-muted-foreground flex items-center gap-1">
                              <Key className="h-3 w-3" />
                              Senha
                            </Label>
                            <Input
                              type="text"
                              value={app.password}
                              onChange={(e) => updateApp(appIndex, { password: e.target.value })}
                              placeholder="Senha do app"
                              className="h-9"
                            />
                          </div>
                        </div>
                      )}

                      {/* Expiration Date Section */}
                      <div className="space-y-2 pt-2 border-t">
                        <Label className="text-xs text-muted-foreground flex items-center gap-1">
                          <CalendarIcon className="h-3 w-3" />
                          Data de Vencimento
                        </Label>
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="flex gap-1 flex-wrap">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-7 text-xs"
                              onClick={() => setQuickExpiration(appIndex, 6)}
                            >
                              6 meses
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-7 text-xs"
                              onClick={() => setQuickExpiration(appIndex, 12)}
                            >
                              1 ano
                            </Button>
                            {/* Quick year selectors - show next 4 years */}
                            {[2027, 2028, 2029, 2030].map((year) => (
                              <Button
                                key={year}
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-7 text-xs"
                                onClick={() => {
                                  const date = new Date(year, 0, 1);
                                  updateApp(appIndex, { expirationDate: format(date, 'yyyy-MM-dd') });
                                }}
                              >
                                {year}
                              </Button>
                            ))}
                          </div>
                          <Popover>
                            <PopoverTrigger asChild>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className={cn(
                                  "h-7 text-xs gap-1 min-w-[140px] justify-start",
                                  !app.expirationDate && "text-muted-foreground"
                                )}
                              >
                                <CalendarIcon className="h-3 w-3" />
                                {app.expirationDate
                                  ? format(new Date(app.expirationDate + 'T12:00:00'), 'dd/MM/yyyy', { locale: ptBR })
                                  : 'Escolher data'}
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
                                className={cn("p-3 pointer-events-auto")}
                              />
                            </PopoverContent>
                          </Popover>
                          {app.expirationDate && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-7 text-xs text-muted-foreground hover:text-destructive"
                              onClick={() => updateApp(appIndex, { expirationDate: '' })}
                            >
                              Limpar
                            </Button>
                          )}
                        </div>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Component to display external apps in client card
export function ClientExternalAppsDisplay({ clientId, sellerId }: { clientId: string; sellerId: string }) {
  const { decrypt } = useCrypto();
  
  const { data: linkedApps = [], isLoading } = useQuery({
    queryKey: ['client-external-apps-display', clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('client_external_apps')
        .select(`
          *,
          external_app:external_apps(*)
        `)
        .eq('client_id', clientId);
      if (error) throw error;
      
      const apps: (ClientExternalApp & { external_app: ExternalApp })[] = [];
      for (const item of data) {
        const app = item as unknown as ClientExternalApp & { external_app: ExternalApp };
        app.devices = (app.devices as unknown as MacDevice[]) || [];
        
        // Decrypt password if exists
        if (app.password) {
          try {
            app.password = await decrypt(app.password);
          } catch {
            // Keep as is
          }
        }
        apps.push(app);
      }
      return apps;
    },
    enabled: !!clientId,
  });

  if (isLoading || linkedApps.length === 0) return null;

  return (
    <div className="space-y-2 mt-2">
      {linkedApps.map((app) => {
        // Get app name - from external_app relation or fixed_app_name
        const appName = app.external_app?.name || app.fixed_app_name || 'App';
        const websiteUrl = app.external_app?.website_url || 
          (app.fixed_app_name ? FIXED_EXTERNAL_APPS.find(f => f.name === app.fixed_app_name)?.website_url : null);
        const authType = app.external_app?.auth_type || 'mac_key';
        
        return (
          <div key={app.id} className="space-y-1.5 p-2 rounded-lg bg-violet-500/5 border border-violet-500/20">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {/* App name as clickable link like servers */}
                {websiteUrl ? (
                  <span 
                    className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-violet-500/10 text-violet-600 dark:text-violet-400 border border-violet-500/20 cursor-pointer hover:bg-violet-500/20 transition-colors"
                    onClick={() => window.open(websiteUrl, '_blank')}
                    title={`Abrir painel ${appName}`}
                  >
                    <AppWindow className="h-3.5 w-3.5" />
                    {appName}
                    <ExternalLink className="h-3 w-3 opacity-60" />
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-violet-500/10 text-violet-600 dark:text-violet-400 border border-violet-500/20">
                    <AppWindow className="h-3.5 w-3.5" />
                    {appName}
                  </span>
                )}
                {app.expiration_date && (
                  <Badge variant="outline" className="text-[10px] px-1.5 border-violet-500/30 text-violet-600 dark:text-violet-400">
                    <CalendarIcon className="h-2.5 w-2.5 mr-0.5" />
                    {format(new Date(app.expiration_date + 'T12:00:00'), 'dd/MM/yy', { locale: ptBR })}
                  </Badge>
                )}
              </div>
            </div>
          
            {/* MAC + Device Key display */}
            {authType === 'mac_key' && app.devices.length > 0 && (
            <div className="space-y-1">
              {app.devices.map((device, idx) => (
                <div key={idx} className="flex items-center justify-between gap-2 p-1.5 rounded bg-muted/50 text-xs">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <Monitor className="h-3 w-3 text-violet-500 flex-shrink-0" />
                    <span className="font-medium truncate">{device.name || `Dispositivo ${idx + 1}`}</span>
                    <span className="font-mono text-muted-foreground truncate">{device.mac}</span>
                    {device.device_key && (
                      <Badge variant="outline" className="text-[10px] px-1">
                        <Key className="h-2 w-2 mr-0.5" />
                        Key
                      </Badge>
                    )}
                  </div>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-xs"
                      onClick={() => {
                        navigator.clipboard.writeText(device.mac);
                        toast.success(`MAC copiado: ${device.mac}`);
                      }}
                    >
                      <Copy className="h-3 w-3" />
                    </Button>
                    {device.device_key && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-xs"
                        onClick={() => {
                          navigator.clipboard.writeText(device.device_key!);
                          toast.success(`Device Key copiada`);
                        }}
                      >
                        <Key className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
          
          {/* Email + Password display */}
          {authType === 'email_password' && (app.email || app.password) && (
            <div className="flex items-center gap-2 p-1.5 rounded bg-muted/50 text-xs">
              <Mail className="h-3 w-3 text-violet-500" />
              <span className="font-mono text-muted-foreground truncate">{app.email}</span>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 ml-auto"
                onClick={() => {
                  const text = `${app.email}\n${app.password}`;
                  navigator.clipboard.writeText(text);
                  toast.success('Credenciais copiadas!');
                }}
              >
                <Copy className="h-3 w-3" />
              </Button>
            </div>
          )}
        </div>
        )
      })}
    </div>
  );
}

export default ClientExternalApps;
