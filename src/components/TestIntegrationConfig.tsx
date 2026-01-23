import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Settings, Server, Link2, UserPlus, Loader2, Save, RefreshCw, Activity } from 'lucide-react';

interface TestApi {
  id: string;
  name: string;
  api_url: string;
  is_active: boolean;
}

interface ServerData {
  id: string;
  name: string;
  dns?: string;
  is_active: boolean;
}

interface TestIntegrationConfigData {
  id: string;
  seller_id: string;
  api_id: string | null;
  server_id: string | null;
  server_name: string | null;
  map_login_path: string;
  map_password_path: string;
  map_dns_path: string;
  map_expiration_path: string;
  category: string;
  client_name_prefix: string;
  test_counter: number;
  auto_create_client: boolean;
  send_welcome_message: boolean;
  detect_renewal_enabled: boolean;
  detect_renewal_keywords: string[] | null;
  logs_enabled: boolean;
  is_active: boolean;
}

export function TestIntegrationConfig() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [selectedApiId, setSelectedApiId] = useState<string>('');

  // Fetch APIs
  const { data: apis = [], isLoading: apisLoading } = useQuery({
    queryKey: ['test-apis', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('test_apis')
        .select('id, name, api_url, is_active')
        .eq('owner_id', user!.id)
        .eq('is_active', true)
        .order('name');
      if (error) throw error;
      return data as TestApi[];
    },
    enabled: !!user?.id,
  });

  // Fetch Servers
  const { data: servers = [], isLoading: serversLoading } = useQuery({
    queryKey: ['servers', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('servers')
        .select('id, name, is_active')
        .eq('seller_id', user!.id)
        .eq('is_active', true)
        .order('name');
      if (error) throw error;
      return (data || []).map(s => ({ ...s, dns: undefined })) as ServerData[];
    },
    enabled: !!user?.id,
  });

  // Fetch existing config
  const { data: config, isLoading: configLoading, refetch: refetchConfig } = useQuery({
    queryKey: ['test-integration-config', user?.id, selectedApiId],
    queryFn: async () => {
      if (!selectedApiId) return null;
      
      const { data, error } = await supabase
        .from('test_integration_config')
        .select('*')
        .eq('seller_id', user!.id)
        .eq('api_id', selectedApiId)
        .maybeSingle();
      
      if (error) throw error;
      return data as TestIntegrationConfigData | null;
    },
    enabled: !!user?.id && !!selectedApiId,
  });

  // Form state
  const [formData, setFormData] = useState({
    server_id: '',
    category: 'IPTV',
    client_name_prefix: 'Teste',
    map_login_path: 'username',
    map_password_path: 'password',
    map_dns_path: 'dns',
    map_expiration_path: 'expiresAtFormatted',
    auto_create_client: true,
    send_welcome_message: false,
    detect_renewal_enabled: true,
    detect_renewal_keywords: 'renovado,renovação,renovacao,renewed,prorrogado,estendido',
    logs_enabled: true,
  });

  // Update form when config loads - using useEffect properly
  useEffect(() => {
    if (config) {
      setFormData({
        server_id: config.server_id || '',
        category: config.category || 'IPTV',
        client_name_prefix: config.client_name_prefix || 'Teste',
        map_login_path: config.map_login_path || 'username',
        map_password_path: config.map_password_path || 'password',
        map_dns_path: config.map_dns_path || 'dns',
        map_expiration_path: config.map_expiration_path || 'expiresAtFormatted',
        auto_create_client: config.auto_create_client ?? true,
        send_welcome_message: config.send_welcome_message ?? false,
        detect_renewal_enabled: config.detect_renewal_enabled ?? true,
        detect_renewal_keywords: config.detect_renewal_keywords?.join(',') || 'renovado,renovação,renovacao,renewed,prorrogado,estendido',
        logs_enabled: config.logs_enabled ?? true,
      });
    }
  }, [config]);
  
  // Reset form when API selection changes
  useEffect(() => {
    if (!selectedApiId) {
      setFormData({
        server_id: '',
        category: 'IPTV',
        client_name_prefix: 'Teste',
        map_login_path: 'username',
        map_password_path: 'password',
        map_dns_path: 'dns',
        map_expiration_path: 'expiresAtFormatted',
        auto_create_client: true,
        send_welcome_message: false,
        detect_renewal_enabled: true,
        detect_renewal_keywords: 'renovado,renovação,renovacao,renewed,prorrogado,estendido',
        logs_enabled: true,
      });
    }
  }, [selectedApiId]);

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!selectedApiId) throw new Error('Selecione uma API');

      const selectedServer = servers.find(s => s.id === formData.server_id);
      
      // Parse keywords from comma-separated string
      const keywordsArray = formData.detect_renewal_keywords
        .split(',')
        .map(k => k.trim())
        .filter(k => k.length > 0);
      
      const payload = {
        seller_id: user!.id,
        api_id: selectedApiId,
        server_id: formData.server_id || null,
        server_name: selectedServer?.name || null,
        category: formData.category,
        client_name_prefix: formData.client_name_prefix,
        map_login_path: formData.map_login_path,
        map_password_path: formData.map_password_path,
        map_dns_path: formData.map_dns_path,
        map_expiration_path: formData.map_expiration_path,
        auto_create_client: formData.auto_create_client,
        send_welcome_message: formData.send_welcome_message,
        detect_renewal_enabled: formData.detect_renewal_enabled,
        detect_renewal_keywords: keywordsArray,
        logs_enabled: formData.logs_enabled,
        is_active: true,
      };

      if (config?.id) {
        const { error } = await supabase
          .from('test_integration_config')
          .update(payload)
          .eq('id', config.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('test_integration_config')
          .insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success('Configuração salva!');
      queryClient.invalidateQueries({ queryKey: ['test-integration-config'] });
      refetchConfig();
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  // Reset counter mutation
  const resetCounterMutation = useMutation({
    mutationFn: async () => {
      if (!config?.id) throw new Error('Configuração não encontrada');
      
      const { error } = await supabase
        .from('test_integration_config')
        .update({ test_counter: 0 })
        .eq('id', config.id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Contador zerado!');
      refetchConfig();
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  if (apisLoading || serversLoading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (apis.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          <Link2 className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>Cadastre uma API primeiro na aba "APIs".</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Settings className="h-5 w-5" />
          Integração Automática de Testes
        </CardTitle>
        <CardDescription>
          Configure para criar clientes automaticamente quando um teste for gerado via WhatsApp
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* API Selection */}
        <div className="space-y-2">
          <Label>API de Teste</Label>
          <Select value={selectedApiId} onValueChange={setSelectedApiId}>
            <SelectTrigger>
              <SelectValue placeholder="Selecione a API" />
            </SelectTrigger>
            <SelectContent>
              {apis.map((api) => (
                <SelectItem key={api.id} value={api.id}>
                  {api.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {selectedApiId && (
          <>
            {configLoading ? (
              <div className="flex justify-center py-4">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : (
              <>
                {/* Auto Create Toggle */}
                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <div className="flex items-center gap-3">
                    <UserPlus className="h-5 w-5 text-primary" />
                    <div>
                      <p className="font-medium">Criar cliente automaticamente</p>
                      <p className="text-sm text-muted-foreground">
                        Ao receber teste da API, criar cliente no app
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={formData.auto_create_client}
                    onCheckedChange={(checked) => setFormData({ ...formData, auto_create_client: checked })}
                  />
                </div>

                {formData.auto_create_client && (
                  <>
                    {/* Server Selection - Auto-save on change */}
                    <div className="space-y-2">
                      <Label className="flex items-center gap-2">
                        <Server className="h-4 w-4" />
                        Servidor para Clientes de Teste
                      </Label>
                      {servers.length === 0 ? (
                        <p className="text-sm text-yellow-600">
                          ⚠️ Cadastre um servidor primeiro em "Servidores"
                        </p>
                      ) : (
                        <Select
                          value={formData.server_id}
                          onValueChange={(value) => {
                            setFormData({ ...formData, server_id: value });
                            // Auto-save when server is selected
                            const selectedServer = servers.find(s => s.id === value);
                            if (selectedServer && selectedApiId) {
                              toast.success(`Servidor "${selectedServer.name}" selecionado! Clique em Salvar para confirmar.`);
                            }
                          }}
                        >
                          <SelectTrigger className={formData.server_id ? 'border-green-500' : ''}>
                            <SelectValue placeholder="Selecione o servidor" />
                          </SelectTrigger>
                          <SelectContent>
                            {servers.map((server) => (
                              <SelectItem key={server.id} value={server.id}>
                                {server.name} {server.dns && `(${server.dns})`}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                      {formData.server_id && (
                        <p className="text-xs text-green-600">
                          ✓ Servidor configurado - clientes de teste serão vinculados a ele
                        </p>
                      )}
                    </div>

                    {/* Category */}
                    <div className="space-y-2">
                      <Label>Categoria do Cliente</Label>
                      <Select
                        value={formData.category}
                        onValueChange={(value) => setFormData({ ...formData, category: value })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="IPTV">IPTV</SelectItem>
                          <SelectItem value="P2P">P2P</SelectItem>
                          <SelectItem value="SSH">SSH</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Client Name Prefix */}
                    <div className="space-y-2">
                      <Label>Prefixo do Nome</Label>
                      <Input
                        value={formData.client_name_prefix}
                        onChange={(e) => setFormData({ ...formData, client_name_prefix: e.target.value })}
                        placeholder="Teste"
                      />
                      <p className="text-xs text-muted-foreground">
                        Clientes serão nomeados: {formData.client_name_prefix}1, {formData.client_name_prefix}2...
                      </p>
                    </div>

                    {/* Counter Info */}
                    {config && (
                      <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
                        <div>
                          <p className="font-medium">Testes criados</p>
                          <p className="text-2xl font-bold text-primary">{config.test_counter || 0}</p>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => resetCounterMutation.mutate()}
                          disabled={resetCounterMutation.isPending}
                        >
                          <RefreshCw className={`h-4 w-4 mr-2 ${resetCounterMutation.isPending ? 'animate-spin' : ''}`} />
                          Zerar
                        </Button>
                      </div>
                    )}

                    {/* Advanced Mapping */}
                    <details className="space-y-4">
                      <summary className="cursor-pointer text-sm font-medium text-muted-foreground hover:text-foreground">
                        ⚙️ Mapeamento Avançado (opcional)
                      </summary>
                      <div className="grid gap-4 mt-4 pt-4 border-t">
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label>Campo Login</Label>
                            <Input
                              value={formData.map_login_path}
                              onChange={(e) => setFormData({ ...formData, map_login_path: e.target.value })}
                              placeholder="username"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>Campo Senha</Label>
                            <Input
                              value={formData.map_password_path}
                              onChange={(e) => setFormData({ ...formData, map_password_path: e.target.value })}
                              placeholder="password"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>Campo DNS</Label>
                            <Input
                              value={formData.map_dns_path}
                              onChange={(e) => setFormData({ ...formData, map_dns_path: e.target.value })}
                              placeholder="dns"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>Campo Vencimento</Label>
                            <Input
                              value={formData.map_expiration_path}
                              onChange={(e) => setFormData({ ...formData, map_expiration_path: e.target.value })}
                              placeholder="expiresAtFormatted"
                            />
                          </div>
                        </div>
                      </div>
                    </details>
                  </>
                )}

                {/* Renewal Detection Section */}
                <div className="border-t pt-6 mt-6 space-y-4">
                  <div className="flex items-center justify-between p-4 border rounded-lg bg-green-50 dark:bg-green-950/20">
                    <div className="flex items-center gap-3">
                      <RefreshCw className="h-5 w-5 text-green-600" />
                      <div>
                        <p className="font-medium">Sincronizar renovação automática</p>
                        <p className="text-sm text-muted-foreground">
                          Quando a API do servidor enviar mensagem de renovação, renovar cliente no app (sem duplicar notificação)
                        </p>
                      </div>
                    </div>
                    <Switch
                      checked={formData.detect_renewal_enabled}
                      onCheckedChange={(checked) => setFormData({ ...formData, detect_renewal_enabled: checked })}
                    />
                  </div>

                  {formData.detect_renewal_enabled && (
                    <div className="space-y-2">
                      <Label>Palavras-chave de renovação</Label>
                      <Input
                        value={formData.detect_renewal_keywords}
                        onChange={(e) => setFormData({ ...formData, detect_renewal_keywords: e.target.value })}
                        placeholder="renovado,renovação,renewed..."
                      />
                      <p className="text-xs text-muted-foreground">
                        Separe as palavras por vírgula. Quando detectar essas palavras em mensagens enviadas, o cliente será renovado no app.
                      </p>
                    </div>
                  )}

                  {/* Logs Toggle */}
                  <div className="flex items-center justify-between p-4 border rounded-lg bg-orange-50 dark:bg-orange-950/20">
                    <div className="flex items-center gap-3">
                      <Activity className="h-5 w-5 text-orange-600" />
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-medium">Salvar logs de comandos</p>
                          <Badge variant="secondary" className="text-[10px]">BETA</Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          Quando ativado, registra cada execução de comando para debug
                        </p>
                      </div>
                    </div>
                    <Switch
                      checked={formData.logs_enabled}
                      onCheckedChange={(checked) => setFormData({ ...formData, logs_enabled: checked })}
                    />
                  </div>
                </div>

                <Button
                  onClick={() => saveMutation.mutate()}
                  disabled={saveMutation.isPending}
                  className="w-full"
                >
                  {saveMutation.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4 mr-2" />
                  )}
                  Salvar Configuração
                </Button>

                {config && (
                  <div className="text-center">
                    <Badge variant={config.is_active ? 'default' : 'secondary'}>
                      {config.is_active ? '✅ Ativo' : '⚪ Inativo'}
                    </Badge>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
