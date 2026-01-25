import { useState, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Play, Loader2, RefreshCw, AlertTriangle, CheckCircle, Clock, Server } from 'lucide-react';

interface TestConfig {
  id: string;
  server_id: string | null;
  server_name: string | null;
  post_endpoint: string | null;
  get_endpoint: string | null;
  api_key: string | null;
  test_counter: number;
  client_name_prefix: string;
}

interface GeneratedTest {
  username: string;
  password: string;
  expiration?: string;
  dns?: string;
}

export function TestGeneratorPanel() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [selectedConfigId, setSelectedConfigId] = useState<string>('');
  const [generatingTest, setGeneratingTest] = useState(false);
  const [lastGeneratedTest, setLastGeneratedTest] = useState<GeneratedTest | null>(null);

  // Fetch all test configs with endpoints configured
  const { data: configs = [], isLoading: configsLoading } = useQuery({
    queryKey: ['test-configs-with-endpoints', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('test_integration_config')
        .select('id, server_id, server_name, post_endpoint, get_endpoint, api_key, test_counter, client_name_prefix')
        .eq('seller_id', user!.id)
        .eq('is_active', true)
        .order('server_name');
      if (error) throw error;
      return (data || []).filter(c => c.post_endpoint || c.get_endpoint) as TestConfig[];
    },
    enabled: !!user?.id,
  });

  const selectedConfig = configs.find(c => c.id === selectedConfigId);

  // Generate test mutation
  const generateTestMutation = useMutation({
    mutationFn: async () => {
      if (!selectedConfig) throw new Error('Selecione um servidor');
      if (!selectedConfig.post_endpoint) throw new Error('POST endpoint não configurado');

      const testNumber = (selectedConfig.test_counter || 0) + 1;
      const username = `${selectedConfig.client_name_prefix || 'teste'}${testNumber}`;
      const password = generatePassword();

      // Build request headers
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (selectedConfig.api_key) {
        headers['apikey'] = selectedConfig.api_key;
        headers['Authorization'] = `Bearer ${selectedConfig.api_key}`;
      }

      // Make POST request to create test
      const response = await fetch(selectedConfig.post_endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          action: 'usercreate',
          username,
          password,
          trial: 1,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Erro ao criar teste: ${response.status} - ${errorText}`);
      }

      const result = await response.json();

      // Increment counter
      await supabase
        .from('test_integration_config')
        .update({ test_counter: testNumber })
        .eq('id', selectedConfig.id);

      return {
        username: result.username || username,
        password: result.password || password,
        expiration: result.expiration || result.expiresAt || result.exp_date,
        dns: result.dns || result.server_url,
      } as GeneratedTest;
    },
    onSuccess: (data) => {
      setLastGeneratedTest(data);
      queryClient.invalidateQueries({ queryKey: ['test-configs-with-endpoints'] });
      queryClient.invalidateQueries({ queryKey: ['test-generation-logs'] });
      toast.success('Teste criado com sucesso!');
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  // List tests via GET
  const fetchTestsMutation = useMutation({
    mutationFn: async () => {
      if (!selectedConfig) throw new Error('Selecione um servidor');
      if (!selectedConfig.get_endpoint) throw new Error('GET endpoint não configurado');

      const headers: Record<string, string> = {};
      if (selectedConfig.api_key) {
        headers['apikey'] = selectedConfig.api_key;
        headers['Authorization'] = `Bearer ${selectedConfig.api_key}`;
      }

      const url = new URL(selectedConfig.get_endpoint);
      url.searchParams.set('seller_id', user!.id);
      url.searchParams.set('status', 'active');

      const response = await fetch(url.toString(), { headers });

      if (!response.ok) {
        throw new Error(`Erro ao listar testes: ${response.status}`);
      }

      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['test-generation-logs'] });
      toast.success('Lista de testes atualizada!');
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const handleGenerateTest = useCallback(async () => {
    if (!selectedConfig) {
      toast.error('Selecione um servidor');
      return;
    }
    if (!selectedConfig.post_endpoint) {
      toast.error('Servidor precisa POST endpoint configurado!');
      return;
    }
    setGeneratingTest(true);
    try {
      await generateTestMutation.mutateAsync();
    } finally {
      setGeneratingTest(false);
    }
  }, [selectedConfig, generateTestMutation]);

  if (configsLoading) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="flex justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (configs.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          <AlertTriangle className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p className="font-medium">Nenhum servidor com endpoints configurados</p>
          <p className="text-sm mt-2">Configure POST/GET endpoints na aba "Integração"</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Play className="h-5 w-5" />
          Gerador de Testes Automáticos
        </CardTitle>
        <CardDescription>
          Crie testes diretamente via API com um clique
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Server Selection */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Servidor</label>
          <Select value={selectedConfigId} onValueChange={setSelectedConfigId}>
            <SelectTrigger>
              <SelectValue placeholder="Selecione o servidor" />
            </SelectTrigger>
            <SelectContent>
              {configs.map((config) => (
                <SelectItem key={config.id} value={config.id}>
                  <div className="flex items-center gap-2">
                    <Server className="h-4 w-4" />
                    {config.server_name || 'Servidor sem nome'}
                    <div className="flex gap-1 ml-2">
                      {config.post_endpoint && (
                        <Badge variant="outline" className="text-[10px]">POST</Badge>
                      )}
                      {config.get_endpoint && (
                        <Badge variant="outline" className="text-[10px]">GET</Badge>
                      )}
                    </div>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {selectedConfig && (
          <>
            {/* Endpoints Status */}
            <div className="grid grid-cols-2 gap-4">
              <div className={`p-3 rounded-lg border ${selectedConfig.post_endpoint ? 'bg-green-50 dark:bg-green-950/20 border-green-200' : 'bg-muted'}`}>
                <div className="flex items-center gap-2">
                  {selectedConfig.post_endpoint ? (
                    <CheckCircle className="h-4 w-4 text-green-600" />
                  ) : (
                    <AlertTriangle className="h-4 w-4 text-muted-foreground" />
                  )}
                  <span className="text-sm font-medium">POST (Criar)</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1 truncate">
                  {selectedConfig.post_endpoint || 'Não configurado'}
                </p>
              </div>
              <div className={`p-3 rounded-lg border ${selectedConfig.get_endpoint ? 'bg-blue-50 dark:bg-blue-950/20 border-blue-200' : 'bg-muted'}`}>
                <div className="flex items-center gap-2">
                  {selectedConfig.get_endpoint ? (
                    <CheckCircle className="h-4 w-4 text-blue-600" />
                  ) : (
                    <AlertTriangle className="h-4 w-4 text-muted-foreground" />
                  )}
                  <span className="text-sm font-medium">GET (Listar)</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1 truncate">
                  {selectedConfig.get_endpoint || 'Não configurado'}
                </p>
              </div>
            </div>

            {/* Counter */}
            <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4" />
                <span className="text-sm">Testes gerados:</span>
              </div>
              <Badge variant="secondary" className="text-lg">
                {selectedConfig.test_counter || 0}
              </Badge>
            </div>

            {/* Action Buttons */}
            <div className="grid grid-cols-2 gap-4">
              <Button
                onClick={handleGenerateTest}
                disabled={generatingTest || !selectedConfig.post_endpoint}
                className="w-full"
              >
                {generatingTest ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Play className="h-4 w-4 mr-2" />
                )}
                Gerar Teste
              </Button>
              <Button
                variant="outline"
                onClick={() => fetchTestsMutation.mutate()}
                disabled={fetchTestsMutation.isPending || !selectedConfig.get_endpoint}
              >
                {fetchTestsMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-2" />
                )}
                Atualizar Lista
              </Button>
            </div>

            {/* Last Generated Test */}
            {lastGeneratedTest && (
              <div className="p-4 bg-green-50 dark:bg-green-950/20 rounded-lg border border-green-200">
                <p className="font-medium text-green-800 dark:text-green-200 mb-2">
                  ✅ Último teste gerado:
                </p>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="text-muted-foreground">Usuário:</span>
                    <span className="ml-2 font-mono">{lastGeneratedTest.username}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Senha:</span>
                    <span className="ml-2 font-mono">{lastGeneratedTest.password}</span>
                  </div>
                  {lastGeneratedTest.expiration && (
                    <div className="col-span-2">
                      <span className="text-muted-foreground">Vencimento:</span>
                      <span className="ml-2">{lastGeneratedTest.expiration}</span>
                    </div>
                  )}
                  {lastGeneratedTest.dns && (
                    <div className="col-span-2">
                      <span className="text-muted-foreground">DNS:</span>
                      <span className="ml-2 font-mono">{lastGeneratedTest.dns}</span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

// Helper function to generate random password
function generatePassword(length = 8): string {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let password = '';
  for (let i = 0; i < length; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}
