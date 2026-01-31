import { useState, useRef, useEffect, type ReactNode } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { toast } from 'sonner';
import { Plus, Loader2, Monitor, Mail, Package, Handshake, Smartphone, Hash, Download } from 'lucide-react';
import { useIsInsideDialog } from '@/contexts/DialogContext';
import { RESELLER_DEVICE_APPS_QUERY_KEY } from '@/hooks/useResellerDeviceApps';

/**
 * InlineDropdown - renders inline dropdown when inside Dialog to avoid portal conflicts
 */
function InlineDropdown({ 
  isOpen, 
  onOpenChange, 
  trigger, 
  children,
  placement = 'bottom',
}: { 
  isOpen: boolean; 
  onOpenChange: (open: boolean) => void;
  trigger: ReactNode;
  children: ReactNode;
  placement?: 'top' | 'bottom';
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const isInsideDialog = useIsInsideDialog();

  // Close on click outside
  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onOpenChange(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, onOpenChange]);

  // When inside Dialog, render inline to avoid portal conflicts
  if (isInsideDialog) {
    const placementClasses =
      placement === 'top'
        ? 'right-0 bottom-full mb-1 top-auto'
        : 'right-0 top-full mt-1';

    return (
      <div ref={containerRef} className="relative">
        <div onClick={(e) => { e.stopPropagation(); onOpenChange(!isOpen); }}>
          {trigger}
        </div>
        {isOpen && (
          <div 
            className={`absolute z-[9999] ${placementClasses} bg-popover border rounded-lg shadow-lg p-3`}
            onClick={(e) => e.stopPropagation()}
          >
            {children}
          </div>
        )}
      </div>
    );
  }

  // Normal Popover for standalone use
  return (
    <Popover open={isOpen} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        {trigger}
      </PopoverTrigger>
      <PopoverContent className="w-80 p-3" align="end">
        {children}
      </PopoverContent>
    </Popover>
  );
}

interface InlineExternalAppCreatorProps {
  sellerId: string;
  onCreated?: (appId: string) => void;
}

export function InlineExternalAppCreator({ sellerId, onCreated }: InlineExternalAppCreatorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [name, setName] = useState('');
  const [authType, setAuthType] = useState<'mac_key' | 'email_password'>('mac_key');
  const [websiteUrl, setWebsiteUrl] = useState('');
  const queryClient = useQueryClient();

  // AUDIT FIX: Use maybeSingle() instead of single() on insert
  const createMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.from('external_apps').insert([{
        name: name.trim().toUpperCase(),
        auth_type: authType,
        website_url: websiteUrl || null,
        seller_id: sellerId,
      }]).select('id').maybeSingle();
      if (error) throw error;
      if (!data) throw new Error('Falha ao criar app');
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['external-apps', sellerId] });
      toast.success('App criado!');
      onCreated?.(data.id);
      resetForm();
      setIsOpen(false);
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const resetForm = () => {
    setName('');
    setAuthType('mac_key');
    setWebsiteUrl('');
  };

  const trigger = (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="h-7 w-7 p-0 shrink-0"
      title="Criar novo app"
    >
      <Plus className="h-4 w-4" />
    </Button>
  );

  return (
    <InlineDropdown isOpen={isOpen} onOpenChange={setIsOpen} trigger={trigger}>
      <div className="space-y-3 w-64">
        <Label className="text-sm font-medium">Novo App Externo</Label>
        
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Nome *</Label>
          <Input
            placeholder="Ex: DUPLEX PLAY"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="h-8 text-sm"
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Tipo de Autenticação</Label>
          <RadioGroup
            value={authType}
            onValueChange={(v) => setAuthType(v as 'mac_key' | 'email_password')}
            className="flex gap-4"
          >
            <div className="flex items-center space-x-1.5">
              <RadioGroupItem value="mac_key" id="inline-mac" />
              <Label htmlFor="inline-mac" className="text-xs cursor-pointer flex items-center gap-1">
                <Monitor className="h-3 w-3" />
                MAC/Key
              </Label>
            </div>
            <div className="flex items-center space-x-1.5">
              <RadioGroupItem value="email_password" id="inline-email" />
              <Label htmlFor="inline-email" className="text-xs cursor-pointer flex items-center gap-1">
                <Mail className="h-3 w-3" />
                Email/Senha
              </Label>
            </div>
          </RadioGroup>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Site (opcional)</Label>
          <Input
            placeholder="https://..."
            value={websiteUrl}
            onChange={(e) => setWebsiteUrl(e.target.value)}
            className="h-8 text-sm"
          />
        </div>

        <Button
          type="button"
          size="sm"
          className="w-full h-8"
          onClick={() => createMutation.mutate()}
          disabled={!name.trim() || createMutation.isPending}
        >
          {createMutation.isPending ? (
            <Loader2 className="h-3 w-3 animate-spin mr-1" />
          ) : (
            <Plus className="h-3 w-3 mr-1" />
          )}
          Criar App
        </Button>
      </div>
    </InlineDropdown>
  );
}

interface InlineServerAppCreatorProps {
  sellerId: string;
  serverId: string;
  serverName?: string;
  onCreated?: (appId: string) => void;
}

export function InlineServerAppCreator({ sellerId, serverId, serverName, onCreated }: InlineServerAppCreatorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [name, setName] = useState('');
  const [appType, setAppType] = useState<'own' | 'partnership'>('own');
  const [icon, setIcon] = useState('📱');
  const queryClient = useQueryClient();

  // AUDIT FIX: Use maybeSingle() instead of single() on insert
  const createMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.from('server_apps').insert([{
        name: name.trim(),
        app_type: appType,
        icon: icon || '📱',
        server_id: serverId,
        seller_id: sellerId,
        is_active: true,
      }]).select('id').maybeSingle();
      if (error) throw error;
      if (!data) throw new Error('Falha ao criar app');
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['server-apps', serverId] });
      toast.success('App do servidor criado!');
      onCreated?.(data.id);
      resetForm();
      setIsOpen(false);
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const resetForm = () => {
    setName('');
    setAppType('own');
    setIcon('📱');
  };

  const emojis = ['📱', '📺', '🎬', '🎮', '💎', '⭐', '🔥', '💫'];

  if (!serverId) return null;

  const trigger = (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="h-7 text-xs gap-1 px-2"
      title="Criar app do servidor"
    >
      <Plus className="h-3 w-3" />
      Novo App
    </Button>
  );

  return (
    <InlineDropdown
      isOpen={isOpen}
      onOpenChange={setIsOpen}
      trigger={trigger}
      placement="top"
    >
      <div className="space-y-3 w-64">
        <Label className="text-sm font-medium">
          Novo App do Servidor
          {serverName && <span className="text-muted-foreground font-normal ml-1">({serverName})</span>}
        </Label>
        
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Nome *</Label>
          <Input
            placeholder="Ex: IPTV Smarters"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="h-8 text-sm"
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Tipo</Label>
          <RadioGroup
            value={appType}
            onValueChange={(v) => setAppType(v as 'own' | 'partnership')}
            className="flex gap-4"
          >
            <div className="flex items-center space-x-1.5">
              <RadioGroupItem value="own" id="inline-own" />
              <Label htmlFor="inline-own" className="text-xs cursor-pointer flex items-center gap-1">
                <Package className="h-3 w-3" />
                Próprio
              </Label>
            </div>
            <div className="flex items-center space-x-1.5">
              <RadioGroupItem value="partnership" id="inline-partnership" />
              <Label htmlFor="inline-partnership" className="text-xs cursor-pointer flex items-center gap-1">
                <Handshake className="h-3 w-3" />
                Parceria
              </Label>
            </div>
          </RadioGroup>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Ícone</Label>
          <div className="flex gap-1 flex-wrap">
            {emojis.map((emoji) => (
              <Button
                key={emoji}
                type="button"
                variant={icon === emoji ? 'default' : 'outline'}
                size="sm"
                className="h-8 w-8 p-0 text-base"
                onClick={() => setIcon(emoji)}
              >
                {emoji}
              </Button>
            ))}
          </div>
        </div>

        <Button
          type="button"
          size="sm"
          className="w-full h-8"
          onClick={() => createMutation.mutate()}
          disabled={!name.trim() || createMutation.isPending}
        >
          {createMutation.isPending ? (
            <Loader2 className="h-3 w-3 animate-spin mr-1" />
          ) : (
            <Plus className="h-3 w-3 mr-1" />
          )}
          Criar App
        </Button>
      </div>
    </InlineDropdown>
  );
}

interface InlineResellerAppCreatorProps {
  sellerId: string;
  onCreated?: (appId: string) => void;
}

export function InlineResellerAppCreator({ sellerId, onCreated }: InlineResellerAppCreatorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('📱');
  const [downloadUrl, setDownloadUrl] = useState('');
  const [downloaderCode, setDownloaderCode] = useState('');
  const queryClient = useQueryClient();

  // UNIFIED: Now uses reseller_device_apps table instead of custom_products
  const createMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase
        .from('reseller_device_apps' as any)
        .insert({
          name: name.trim(),
          icon: icon || '📱',
          download_url: downloadUrl.trim() ? downloadUrl.trim() : null,
          downloader_code: downloaderCode.trim() ? downloaderCode.trim() : null,
          seller_id: sellerId,
          is_active: true,
          is_gerencia_app: false,
          device_types: ['android_tv', 'celular_android', 'smart_tv'],
          app_source: 'direct',
        })
        .select('id')
        .maybeSingle();
      if (error) throw error;
      const result = data as unknown as { id: string } | null;
      if (!result) throw new Error('Falha ao criar app');
      return result;
    },
    onSuccess: (data) => {
      // Unified query key for all reseller apps
      queryClient.invalidateQueries({ queryKey: [RESELLER_DEVICE_APPS_QUERY_KEY, sellerId] });
      queryClient.invalidateQueries({ queryKey: [RESELLER_DEVICE_APPS_QUERY_KEY] });
      toast.success('App do revendedor criado!');
      onCreated?.(data.id);
      setName('');
      setIcon('📱');
      setDownloadUrl('');
      setDownloaderCode('');
      setIsOpen(false);
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Erro ao criar app do revendedor');
    },
  });

  const emojis = ['📱', '📺', '🎬', '🎮', '📡', '🌐', '⚡', '🔥', '💎', '🎯'];

  const trigger = (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="h-7 text-xs gap-1 px-2"
      title="Criar app do revendedor"
    >
      <Plus className="h-3 w-3" />
      <Smartphone className="h-3 w-3" />
      Novo (Revendedor)
    </Button>
  );

  return (
    <InlineDropdown isOpen={isOpen} onOpenChange={setIsOpen} trigger={trigger}>
      <div className="space-y-3 w-72">
        <Label className="text-sm font-medium">Novo App do Revendedor</Label>

        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Ícone</Label>
          <div className="flex gap-1 flex-wrap">
            {emojis.map((emoji) => (
              <Button
                key={emoji}
                type="button"
                variant={icon === emoji ? 'default' : 'outline'}
                size="sm"
                className="h-8 w-8 p-0 text-base"
                onClick={() => setIcon(emoji)}
              >
                {emoji}
              </Button>
            ))}
          </div>
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Nome *</Label>
          <Input
            placeholder="Ex: Sandel"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="h-8 text-sm"
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground flex items-center gap-1">
            <Download className="h-3 w-3" />
            Link de Download (opcional)
          </Label>
          <Input
            placeholder="https://..."
            value={downloadUrl}
            onChange={(e) => setDownloadUrl(e.target.value)}
            className="h-8 text-sm"
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground flex items-center gap-1">
            <Hash className="h-3 w-3" />
            Código Downloader (opcional)
          </Label>
          <Input
            placeholder="Ex: 12345"
            value={downloaderCode}
            onChange={(e) => setDownloaderCode(e.target.value)}
            className="h-8 text-sm"
          />
        </div>

        <Button
          type="button"
          size="sm"
          className="w-full h-8"
          onClick={() => createMutation.mutate()}
          disabled={!name.trim() || createMutation.isPending}
        >
          {createMutation.isPending ? (
            <Loader2 className="h-3 w-3 animate-spin mr-1" />
          ) : (
            <Plus className="h-3 w-3 mr-1" />
          )}
          Criar App do Revendedor
        </Button>
      </div>
    </InlineDropdown>
  );
}
