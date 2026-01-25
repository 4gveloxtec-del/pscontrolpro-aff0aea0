import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { toast } from 'sonner';
import { Plus, Loader2, Monitor, Mail, Package, Handshake, Smartphone, Hash, Download } from 'lucide-react';

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

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0 shrink-0"
          title="Criar novo app"
        >
          <Plus className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-3" align="end">
        <div className="space-y-3">
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
      </PopoverContent>
    </Popover>
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

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
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
      </PopoverTrigger>
      <PopoverContent className="w-72 p-3" align="end">
        <div className="space-y-3">
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
      </PopoverContent>
    </Popover>
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

  // AUDIT FIX: Use maybeSingle() instead of single() on insert
  const createMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase
        .from('custom_products')
        .insert([
          {
            name: `APP_REVENDEDOR:${name.trim()}`,
            icon: icon || '📱',
            download_url: downloadUrl.trim() ? downloadUrl.trim() : null,
            downloader_code: downloaderCode.trim() ? downloaderCode.trim() : null,
            seller_id: sellerId,
            is_active: true,
          },
        ])
        .select('id')
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error('Falha ao criar app');
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['reseller-apps', sellerId] });
      queryClient.invalidateQueries({ queryKey: ['reseller-apps-for-external', sellerId] });
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

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
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
      </PopoverTrigger>
      <PopoverContent className="w-80 p-3" align="end">
        <div className="space-y-3">
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
      </PopoverContent>
    </Popover>
  );
}
