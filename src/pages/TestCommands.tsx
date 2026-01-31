import { useState, useRef, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { Plus, Edit, Trash2, Terminal, Link2, Activity, Clock, CheckCircle, XCircle, Loader2, Settings, Play, Eye, MessageSquare, AlertTriangle, Stethoscope, Users, Rocket } from 'lucide-react';
import { TestIntegrationConfig } from '@/components/TestIntegrationConfig';
import { TestLogsManager } from '@/components/TestLogsManager';
import { TestGeneratorPanel } from '@/components/TestGeneratorPanel';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface TestApi {
  id: string;
  owner_id: string;
  name: string;
  description: string | null;
  api_url: string;
  api_method: string;
  api_headers: Record<string, string>;
  api_body_template: Record<string, unknown> | null;
  response_path: string | null;
  custom_response_template: string | null;
  use_custom_response: boolean;
  last_test_response: Record<string, unknown> | null;
  last_test_at: string | null;
  is_active: boolean;
  created_at: string;
}

interface WhatsAppCommand {
  id: string;
  owner_id: string;
  api_id: string;
  command: string;
  description: string | null;
  response_template: string;
  is_active: boolean;
  usage_count: number;
  created_at: string;
  test_apis?: { name: string } | null;
}

interface CommandLog {
  id: string;
  command_text: string;
  sender_phone: string;
  success: boolean;
  error_message: string | null;
  execution_time_ms: number | null;
  created_at: string;
}

interface DiagnosisResult {
  is_connected: boolean;
  critical_issues?: string[];
  recommendations?: string[];
  webhook?: {
    configured: boolean;
    url_correct: boolean;
    has_messages_event: boolean;
    url?: string;
    expected_url?: string;
    events_enabled?: string[];
    raw_config?: unknown;
    error?: string;
  };
  commands?: { active: number };
  recent_events?: { message_events: number };
  recent_commands?: {
    total: number;
    logs: Array<{ command: string; success: boolean; error?: string }>;
  };
}

// Constants moved outside component to prevent re-allocation
const DEFAULT_TEMPLATE = `✅ *Teste Gerado com Sucesso!*

👤 *Usuário:* {usuario}
🔑 *Senha:* {senha}
📅 *Validade:* {vencimento}

📥 *Baixe seu aplicativo:*
{links}

🏢 {empresa}
📲 Qualquer dúvida, estamos à disposição!`;

const API_TEST_TIMEOUT_MS = 15000;

export default function TestCommands() {
  const { user } = useAuth();
  const { dialogProps, confirm } = useConfirmDialog();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('generator');
  
  // API Dialog State
  const [apiDialogOpen, setApiDialogOpen] = useState(false);
  const [editingApi, setEditingApi] = useState<TestApi | null>(null);
  const [apiForm, setApiForm] = useState({
    name: '',
    description: '',
    api_url: '',
    api_method: 'GET',
    api_headers: '{}',
    api_body_template: '',
    response_path: '',
    custom_response_template: '',
    use_custom_response: false,
    is_active: true,
  });
  
  // API Test State
  const [testingApi, setTestingApi] = useState(false);
  const [testResponse, setTestResponse] = useState<Record<string, unknown> | null>(null);
  const [previewMessage, setPreviewMessage] = useState('');
  
  // Ref for template textarea to track cursor position
  const templateTextareaRef = useRef<HTMLTextAreaElement>(null);
  

  // Command Dialog State
  const [commandDialogOpen, setCommandDialogOpen] = useState(false);
  const [editingCommand, setEditingCommand] = useState<WhatsAppCommand | null>(null);
  const [commandForm, setCommandForm] = useState({
    api_id: '',
    command: '',
    description: '',
    response_template: '✅ *Teste Gerado!*\n\n{response}',
    is_active: true,
  });

  // Diagnosis State
  const [diagnosing, setDiagnosing] = useState(false);
  const [diagnosisResult, setDiagnosisResult] = useState<DiagnosisResult | null>(null);

  // Fetch APIs
  const { data: apis = [], isLoading: apisLoading } = useQuery({
    queryKey: ['test-apis', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('test_apis')
        .select('*')
        .eq('owner_id', user!.id)
        .order('name');
      if (error) throw error;
      return data as TestApi[];
    },
    enabled: !!user?.id,
  });

  // Fetch Commands
  const { data: commands = [], isLoading: commandsLoading } = useQuery({
    queryKey: ['whatsapp-commands', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('whatsapp_commands')
        .select('*, test_apis(name)')
        .eq('owner_id', user!.id)
        .order('command');
      if (error) throw error;
      return data as WhatsAppCommand[];
    },
    enabled: !!user?.id,
  });

  // Fetch Logs
  const { data: logs = [], isLoading: logsLoading, refetch: refetchLogs } = useQuery({
    queryKey: ['command-logs', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('command_logs')
        .select('id, command_text, sender_phone, success, error_message, execution_time_ms, created_at')
        .eq('owner_id', user!.id)
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return data as CommandLog[];
    },
    enabled: !!user?.id,
  });

  // Fetch global logs_enabled setting
  const { data: logsConfig, refetch: refetchLogsConfig } = useQuery({
    queryKey: ['logs-config', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('test_integration_config')
        .select('id, logs_enabled')
        .eq('seller_id', user!.id)
        .eq('is_active', true)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
  });

  // Toggle logs mutation
  const toggleLogsMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      if (!logsConfig?.id) {
        throw new Error('Configuração não encontrada');
      }
      const { error } = await supabase
        .from('test_integration_config')
        .update({ logs_enabled: enabled })
        .eq('id', logsConfig.id);
      if (error) throw error;
    },
    onSuccess: (_data, enabled) => {
      refetchLogsConfig();
      toast.success(enabled ? 'Logs ativados' : 'Logs desativados');
    },
    onError: (error: Error) => {
      toast.error('Erro ao alterar configuração: ' + error.message);
    },
  });

  // API Mutations
  const createApiMutation = useMutation({
    mutationFn: async (data: typeof apiForm) => {
      let parsedHeaders: Record<string, string> = {};
      let parsedBody: Record<string, unknown> | null = null;
      
      try {
        parsedHeaders = JSON.parse(data.api_headers || '{}');
      } catch {
        throw new Error('Headers JSON inválido');
      }
      
      if (data.api_body_template) {
        try {
          parsedBody = JSON.parse(data.api_body_template);
        } catch {
          throw new Error('Body JSON inválido');
        }
      }
      
      const { error } = await supabase.from('test_apis').insert([{
        owner_id: user!.id,
        name: data.name,
        description: data.description || null,
        api_url: data.api_url,
        api_method: data.api_method,
        api_headers: parsedHeaders as Json,
        api_body_template: parsedBody as Json | null,
        response_path: data.response_path || null,
        custom_response_template: data.custom_response_template || null,
        use_custom_response: data.use_custom_response,
        last_test_response: testResponse as Json | null,
        last_test_at: testResponse ? new Date().toISOString() : null,
        is_active: data.is_active,
      }]);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['test-apis'] });
      toast.success('API cadastrada com sucesso!');
      resetApiForm();
      setApiDialogOpen(false);
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const updateApiMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: typeof apiForm }) => {
      // Safe JSON.parse with try-catch to prevent crashes
      let parsedHeaders: Record<string, string> = {};
      let parsedBody: Record<string, unknown> | null = null;
      
      try {
        parsedHeaders = JSON.parse(data.api_headers || '{}');
      } catch (e) {
        console.error('[updateApiMutation] Invalid JSON in headers:', e);
        throw new Error('Headers JSON inválido');
      }
      
      if (data.api_body_template) {
        try {
          parsedBody = JSON.parse(data.api_body_template);
        } catch (e) {
          console.error('[updateApiMutation] Invalid JSON in body:', e);
          throw new Error('Body JSON inválido');
        }
      }
      
      const { error } = await supabase.from('test_apis').update({
        name: data.name,
        description: data.description || null,
        api_url: data.api_url,
        api_method: data.api_method,
        api_headers: parsedHeaders,
        api_body_template: parsedBody,
        response_path: data.response_path || null,
        custom_response_template: data.custom_response_template || null,
        use_custom_response: data.use_custom_response,
        last_test_response: testResponse as any,
        last_test_at: testResponse ? new Date().toISOString() : null,
        is_active: data.is_active,
      } as any).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['test-apis'] });
      toast.success('API atualizada!');
      resetApiForm();
      setApiDialogOpen(false);
      setEditingApi(null);
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const deleteApiMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('test_apis').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['test-apis'] });
      queryClient.invalidateQueries({ queryKey: ['whatsapp-commands'] });
      toast.success('API removida!');
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  // Command Mutations
  const createCommandMutation = useMutation({
    mutationFn: async (data: typeof commandForm) => {
      const cmd = data.command.startsWith('/') ? data.command : `/${data.command}`;
      const { error } = await supabase.from('whatsapp_commands').insert([{
        owner_id: user!.id,
        api_id: data.api_id,
        command: cmd.toLowerCase(),
        description: data.description || null,
        response_template: data.response_template,
        is_active: data.is_active,
      }]);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp-commands'] });
      toast.success('Comando criado!');
      resetCommandForm();
      setCommandDialogOpen(false);
    },
    onError: (error: Error) => {
      if (error.message.includes('duplicate')) {
        toast.error('Este comando já existe!');
      } else {
        toast.error(error.message);
      }
    },
  });

  const updateCommandMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: typeof commandForm }) => {
      const cmd = data.command.startsWith('/') ? data.command : `/${data.command}`;
      const { error } = await supabase.from('whatsapp_commands').update({
        api_id: data.api_id,
        command: cmd.toLowerCase(),
        description: data.description || null,
        response_template: data.response_template,
        is_active: data.is_active,
      }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp-commands'] });
      toast.success('Comando atualizado!');
      resetCommandForm();
      setCommandDialogOpen(false);
      setEditingCommand(null);
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const deleteCommandMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('whatsapp_commands').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp-commands'] });
      toast.success('Comando removido!');
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const clearLogsMutation = useMutation({
    mutationFn: async () => {
      // Delete all logs for this user - don't use .select() after .delete()
      const { error } = await supabase
        .from('command_logs')
        .delete()
        .eq('owner_id', user!.id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['command-logs'] });
      refetchLogs();
      toast.success('Logs limpos com sucesso!');
    },
    onError: (error: Error) => {
      console.error('[clearLogs] Error:', error);
      toast.error('Erro ao limpar logs: ' + error.message);
    },
  });

  const resetApiForm = () => {
    setApiForm({
      name: '',
      description: '',
      api_url: '',
      api_method: 'GET',
      api_headers: '{}',
      api_body_template: '',
      response_path: '',
      custom_response_template: '',
      use_custom_response: false,
      is_active: true,
    });
    setTestResponse(null);
    setPreviewMessage('');
  };

  const resetCommandForm = () => {
    setCommandForm({
      api_id: '',
      command: '',
      description: '',
      response_template: '✅ *Teste Gerado!*\n\n{response}',
      is_active: true,
    });
  };

  const handleEditApi = (api: TestApi) => {
    setEditingApi(api);
    setApiForm({
      name: api.name,
      description: api.description || '',
      api_url: api.api_url,
      api_method: api.api_method,
      api_headers: JSON.stringify(api.api_headers, null, 2),
      api_body_template: api.api_body_template ? JSON.stringify(api.api_body_template, null, 2) : '',
      response_path: api.response_path || '',
      custom_response_template: api.custom_response_template || '',
      use_custom_response: api.use_custom_response || false,
      is_active: api.is_active,
    });
    // Load last test response if available
    if (api.last_test_response) {
      setTestResponse(api.last_test_response);
    } else {
      setTestResponse(null);
    }
    setPreviewMessage('');
    setApiDialogOpen(true);
  };

  // Function to test the API and get preview - with timeout
  const handleTestApi = useCallback(async () => {
    if (!apiForm.api_url) {
      toast.error('Informe a URL da API');
      return;
    }
    
    setTestingApi(true);
    setTestResponse(null);
    setPreviewMessage('');
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), API_TEST_TIMEOUT_MS);
    
    try {
      // Safe JSON.parse with try-catch for headers
      let parsedHeaders: Record<string, string> = {};
      try {
        parsedHeaders = JSON.parse(apiForm.api_headers || '{}');
      } catch (e) {
        console.error('[handleTestApi] Invalid JSON in headers:', e);
        toast.error('Headers JSON inválido');
        setTestingApi(false);
        clearTimeout(timeoutId);
        return;
      }
      
      const fetchOptions: RequestInit = {
        method: apiForm.api_method,
        headers: {
          'Content-Type': 'application/json',
          ...parsedHeaders,
        },
        signal: controller.signal,
      };
      
      if ((apiForm.api_method === 'POST' || apiForm.api_method === 'BOTH') && apiForm.api_body_template) {
        fetchOptions.body = apiForm.api_body_template;
      }
      
      const response = await fetch(apiForm.api_url, fetchOptions);
      clearTimeout(timeoutId);
      
      const responseText = await response.text();
      
      let parsedResponse: Record<string, unknown>;
      try {
        parsedResponse = JSON.parse(responseText);
      } catch {
        parsedResponse = { reply: responseText };
      }
      
      setTestResponse(parsedResponse);
      
      // Generate preview message
      if (apiForm.use_custom_response && apiForm.custom_response_template) {
        const preview = applyTemplatePreview(apiForm.custom_response_template, parsedResponse);
        setPreviewMessage(preview);
      }
      
      toast.success('API testada com sucesso!');
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === 'AbortError') {
        toast.error('Timeout: API não respondeu em 15 segundos');
      } else {
        toast.error('Erro ao testar API: ' + (error instanceof Error ? error.message : String(error)));
      }
    } finally {
      setTestingApi(false);
    }
  }, [apiForm.api_url, apiForm.api_method, apiForm.api_headers, apiForm.api_body_template, apiForm.use_custom_response, apiForm.custom_response_template]);

  // Apply template with variables for preview
  const applyTemplatePreview = (template: string, data: Record<string, unknown>): string => {
    // Variables that come from API response
    const apiVariableMapping: Record<string, string[]> = {
      usuario: ['username', 'user', 'login', 'usuario'],
      senha: ['password', 'pass', 'senha'],
      vencimento: ['expiresAtFormatted', 'expiresAt', 'expires', 'expiration', 'vencimento', 'validade'],
      dns: ['dns', 'server', 'host', 'url'],
      pacote: ['package', 'plan', 'plano', 'pacote'],
      nome: ['name', 'nome', 'client_name'],
      mac: ['mac', 'mac_address', 'device_mac'],
      valor: ['price', 'value', 'valor', 'amount'],
      dias_restantes: ['days_remaining', 'remaining_days', 'dias_restantes'],
    };

    let result = template;

    // Replace API variables
    for (const [varName, possibleKeys] of Object.entries(apiVariableMapping)) {
      let value = '';
      for (const key of possibleKeys) {
        if (data[key] !== undefined && data[key] !== null) {
          value = String(data[key]);
          break;
        }
      }
      const regex = new RegExp(`\\{${varName}\\}`, 'gi');
      result = result.replace(regex, value);
    }
    
    // System variables (will be replaced in backend with actual seller data)
    // Show placeholders for preview
    const systemVars = ['empresa', 'pix', 'servidor', 'plano', 'apps', 'links'];
    for (const varName of systemVars) {
      const regex = new RegExp(`\\{${varName}\\}`, 'gi');
      if (result.match(regex)) {
        result = result.replace(regex, `[${varName}]`);
      }
    }
    
    return result;
  };

  // Update preview when template changes
  const handleTemplateChange = (template: string) => {
    setApiForm({ ...apiForm, custom_response_template: template });
    if (testResponse) {
      const preview = applyTemplatePreview(template, testResponse);
      setPreviewMessage(preview);
    }
  };

  const handleEditCommand = (cmd: WhatsAppCommand) => {
    setEditingCommand(cmd);
    setCommandForm({
      api_id: cmd.api_id,
      command: cmd.command,
      description: cmd.description || '',
      response_template: cmd.response_template,
      is_active: cmd.is_active,
    });
    setCommandDialogOpen(true);
  };

  const handleApiSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      JSON.parse(apiForm.api_headers || '{}');
      if (apiForm.api_body_template) JSON.parse(apiForm.api_body_template);
    } catch {
      toast.error('JSON inválido nos headers ou body');
      return;
    }
    if (editingApi) {
      updateApiMutation.mutate({ id: editingApi.id, data: apiForm });
    } else {
      createApiMutation.mutate(apiForm);
    }
  };

  const handleCommandSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!commandForm.api_id) {
      toast.error('Selecione uma API');
      return;
    }
    if (editingCommand) {
      updateCommandMutation.mutate({ id: editingCommand.id, data: commandForm });
    } else {
      createCommandMutation.mutate(commandForm);
    }
  };

  // Diagnose function
  const handleDiagnose = async () => {
    if (!user?.id) return;
    
    setDiagnosing(true);
    setDiagnosisResult(null);
    
    try {
      const { data, error } = await supabase.functions.invoke('connection-heartbeat', {
        body: { action: 'diagnose', seller_id: user.id },
      });
      
      if (error) throw error;
      
      setDiagnosisResult(data?.diagnosis || null);
      
      const hasCritical = data?.diagnosis?.critical_issues?.length > 0;
      const hasRecommendations = data?.diagnosis?.recommendations?.length > 0;
      
      if (hasCritical) {
        toast.error('Problemas críticos detectados! O bot não funcionará até corrigir.');
      } else if (hasRecommendations) {
        toast.warning('Atenção: Alguns ajustes recomendados.');
      } else {
        toast.success('Tudo configurado corretamente!');
      }
    } catch (error) {
      toast.error('Erro ao diagnosticar: ' + (error instanceof Error ? error.message : String(error)));
    } finally {
      setDiagnosing(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Terminal className="h-5 w-5 text-primary" />
            Comandos de Teste
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            Configure comandos para gerar testes via WhatsApp
          </p>
        </div>
        <Button 
          variant="outline" 
          size="sm" 
          onClick={handleDiagnose}
          disabled={diagnosing}
          className="self-start sm:self-center"
        >
          {diagnosing ? (
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
          ) : (
            <Stethoscope className="h-4 w-4 mr-2" />
          )}
          Diagnosticar
        </Button>
      </div>

      {/* Diagnosis Result */}
      {diagnosisResult && (
        <Card className={`border-2 ${
          diagnosisResult.critical_issues?.length > 0 
            ? 'border-red-500 bg-red-500/10' 
            : diagnosisResult.recommendations?.length > 0 
              ? 'border-amber-500 bg-amber-500/10' 
              : 'border-green-500 bg-green-500/10'
        }`}>
          <CardContent className="py-4">
            <div className="flex items-start gap-3">
              {diagnosisResult.critical_issues?.length > 0 ? (
                <XCircle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
              ) : diagnosisResult.recommendations?.length > 0 ? (
                <AlertTriangle className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
              ) : (
                <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0 mt-0.5" />
              )}
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-sm mb-2">
                  {diagnosisResult.critical_issues?.length > 0 
                    ? '🚨 Problemas Críticos!' 
                    : diagnosisResult.recommendations?.length > 0 
                      ? '⚠️ Atenção' 
                      : '✅ Tudo OK!'}
                </h3>
                
                {/* Status Summary */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs mb-3">
                  <div className="flex items-center gap-1">
                    <span className={`h-2 w-2 rounded-full ${diagnosisResult.is_connected ? 'bg-green-500' : 'bg-red-500'}`} />
                    WhatsApp: {diagnosisResult.is_connected ? 'Conectado' : 'Desconectado'}
                  </div>
                  <div className="flex items-center gap-1">
                    <span className={`h-2 w-2 rounded-full ${
                      diagnosisResult.webhook?.configured && diagnosisResult.webhook?.url_correct && diagnosisResult.webhook?.has_messages_event 
                        ? 'bg-green-500' 
                        : 'bg-red-500'
                    }`} />
                    Webhook: {
                      diagnosisResult.webhook?.configured && diagnosisResult.webhook?.url_correct && diagnosisResult.webhook?.has_messages_event 
                        ? 'OK' 
                        : diagnosisResult.webhook?.configured 
                          ? 'Incompleto' 
                          : 'Não configurado'
                    }
                  </div>
                  <div className="flex items-center gap-1">
                    <span className={`h-2 w-2 rounded-full ${diagnosisResult.commands?.active > 0 ? 'bg-green-500' : 'bg-amber-500'}`} />
                    Comandos: {diagnosisResult.commands?.active || 0}
                  </div>
                  <div className="flex items-center gap-1">
                    <span className={`h-2 w-2 rounded-full ${diagnosisResult.recent_events?.message_events > 0 ? 'bg-green-500' : 'bg-amber-500'}`} />
                    Msgs recebidas: {diagnosisResult.recent_events?.message_events || 0}
                  </div>
                </div>
                
                {/* Critical Issues */}
                {diagnosisResult.critical_issues?.length > 0 && (
                  <div className="space-y-1 mb-3 p-2 bg-red-500/20 rounded">
                    <p className="text-xs font-bold text-red-600 dark:text-red-400">Problemas que impedem o funcionamento:</p>
                    <ul className="text-xs space-y-1">
                      {diagnosisResult.critical_issues.map((issue: string, i: number) => (
                        <li key={i} className="flex items-start gap-1">
                          {issue}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                
                {/* Recommendations */}
                {diagnosisResult.recommendations?.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-xs font-medium">Recomendações:</p>
                    <ul className="text-xs space-y-1">
                      {diagnosisResult.recommendations.map((rec: string, i: number) => (
                        <li key={i} className="flex items-start gap-1">
                          <span className="text-amber-500">•</span>
                          {rec}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Webhook Details */}
                {(diagnosisResult.webhook?.raw_config || diagnosisResult.webhook?.error) && (
                  <details className="mt-3 text-xs">
                    <summary className="cursor-pointer text-muted-foreground hover:text-foreground font-medium">
                      🔧 Detalhes técnicos do webhook
                    </summary>
                    <div className="mt-2 space-y-2 p-2 bg-muted rounded">
                      <div className="space-y-1">
                        <p><strong>URL configurada:</strong> {diagnosisResult.webhook?.url || 'Não encontrada'}</p>
                        <p><strong>URL esperada:</strong> {diagnosisResult.webhook?.expected_url}</p>
                        <p><strong>URL correta:</strong> {diagnosisResult.webhook?.url_correct ? '✅ Sim' : '❌ Não'}</p>
                        <p><strong>Evento MESSAGES:</strong> {diagnosisResult.webhook?.has_messages_event ? '✅ Habilitado' : '❌ Não habilitado'}</p>
                        {diagnosisResult.webhook?.events_enabled?.length > 0 && (
                          <p><strong>Eventos ativos:</strong> {diagnosisResult.webhook.events_enabled.join(', ')}</p>
                        )}
                        {diagnosisResult.webhook?.error && (
                          <p className="text-red-500"><strong>Erro:</strong> {diagnosisResult.webhook.error}</p>
                        )}
                      </div>
                      {diagnosisResult.webhook?.raw_config && (
                        <pre className="p-2 bg-background rounded text-[10px] overflow-x-auto max-h-32">
                          {JSON.stringify(diagnosisResult.webhook.raw_config, null, 2)}
                        </pre>
                      )}
                    </div>
                  </details>
                )}

                {/* Recent Command Logs */}
                {diagnosisResult.recent_commands?.total > 0 && (
                  <details className="mt-2 text-xs">
                    <summary className="cursor-pointer text-muted-foreground hover:text-foreground font-medium">
                      📋 Últimos comandos processados ({diagnosisResult.recent_commands.total})
                    </summary>
                    <div className="mt-1 space-y-1">
                      {diagnosisResult.recent_commands.logs.map((log, i) => (
                        <div key={i} className={`p-1 rounded text-[10px] ${log.success ? 'bg-green-500/10' : 'bg-red-500/10'}`}>
                          <span className="font-mono">{log.command}</span>
                          {log.error && <span className="text-red-500 ml-1">- {log.error}</span>}
                        </div>
                      ))}
                    </div>
                  </details>
                )}
              </div>
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-6 w-6"
                onClick={() => setDiagnosisResult(null)}
              >
                <XCircle className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-6 h-auto">
          <TabsTrigger value="generator" className="flex flex-col sm:flex-row items-center gap-1 py-2 px-1 text-[10px] sm:text-xs">
            <Rocket className="h-4 w-4" />
            <span className="hidden sm:inline">Gerar</span>
            <span className="sm:hidden">Gerar</span>
          </TabsTrigger>
          <TabsTrigger value="commands" className="flex flex-col sm:flex-row items-center gap-1 py-2 px-1 text-[10px] sm:text-xs">
            <Terminal className="h-4 w-4" />
            <span className="hidden sm:inline">Comandos</span>
            <span className="sm:hidden">Cmd</span>
          </TabsTrigger>
          <TabsTrigger value="apis" className="flex flex-col sm:flex-row items-center gap-1 py-2 px-1 text-[10px] sm:text-xs">
            <Link2 className="h-4 w-4" />
            <span>APIs</span>
          </TabsTrigger>
          <TabsTrigger value="tests" className="flex flex-col sm:flex-row items-center gap-1 py-2 px-1 text-[10px] sm:text-xs">
            <Users className="h-4 w-4" />
            <span className="hidden sm:inline">Testes</span>
            <span className="sm:hidden">Testes</span>
          </TabsTrigger>
          <TabsTrigger value="integration" className="flex flex-col sm:flex-row items-center gap-1 py-2 px-1 text-[10px] sm:text-xs">
            <Settings className="h-4 w-4" />
            <span>Integr.</span>
          </TabsTrigger>
          <TabsTrigger value="logs" className="flex flex-col sm:flex-row items-center gap-1 py-2 px-1 text-[10px] sm:text-xs">
            <Activity className="h-4 w-4" />
            <span>Logs</span>
          </TabsTrigger>
        </TabsList>

        {/* Generator Tab */}
        <TabsContent value="generator" className="space-y-4">
          <TestGeneratorPanel />
        </TabsContent>

        {/* Commands Tab */}
        <TabsContent value="commands" className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => { resetCommandForm(); setEditingCommand(null); setCommandDialogOpen(true); }} disabled={apis.length === 0}>
              <Plus className="h-4 w-4 mr-2" />
              Novo Comando
            </Button>
          </div>

          {apis.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                <Link2 className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Cadastre uma API primeiro para criar comandos.</p>
                <Button variant="outline" className="mt-4" onClick={() => setActiveTab('apis')}>
                  Ir para APIs
                </Button>
              </CardContent>
            </Card>
          ) : commandsLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : commands.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                <Terminal className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Nenhum comando cadastrado.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {commands.map((cmd) => (
                <Card key={cmd.id} className={!cmd.is_active ? 'opacity-60' : ''}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-lg font-mono text-primary">{cmd.command}</CardTitle>
                      <Badge variant={cmd.is_active ? 'default' : 'secondary'}>
                        {cmd.is_active ? 'Ativo' : 'Inativo'}
                      </Badge>
                    </div>
                    <CardDescription>{cmd.description || 'Sem descrição'}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="text-sm text-muted-foreground mb-3">
                      <span className="font-medium">API:</span> {cmd.test_apis?.name || 'N/A'}
                    </div>
                    <div className="text-sm text-muted-foreground mb-3">
                      <span className="font-medium">Usos:</span> {cmd.usage_count}
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => handleEditCommand(cmd)}>
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => {
                        confirm({
                          title: 'Excluir comando',
                          description: `Tem certeza que deseja excluir o comando "${cmd.command}"?`,
                          confirmText: 'Excluir',
                          variant: 'destructive',
                          onConfirm: () => deleteCommandMutation.mutate(cmd.id),
                        });
                      }}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* APIs Tab */}
        <TabsContent value="apis" className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => { resetApiForm(); setEditingApi(null); setApiDialogOpen(true); }}>
              <Plus className="h-4 w-4 mr-2" />
              Nova API
            </Button>
          </div>

          {apisLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : apis.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                <Link2 className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Nenhuma API cadastrada.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {apis.map((api) => (
                <Card key={api.id} className={!api.is_active ? 'opacity-60' : ''}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-lg">{api.name}</CardTitle>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">{api.api_method}</Badge>
                        <Badge variant={api.is_active ? 'default' : 'secondary'}>
                          {api.is_active ? 'Ativa' : 'Inativa'}
                        </Badge>
                      </div>
                    </div>
                    <CardDescription className="truncate">{api.api_url}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {api.description && (
                      <p className="text-sm text-muted-foreground mb-3">{api.description}</p>
                    )}
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => handleEditApi(api)}>
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => {
                        confirm({
                          title: 'Excluir API',
                          description: `Tem certeza que deseja excluir a API "${api.name}"? Os comandos associados também serão removidos.`,
                          confirmText: 'Excluir',
                          variant: 'destructive',
                          onConfirm: () => deleteApiMutation.mutate(api.id),
                        });
                      }}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Tests Management Tab */}
        <TabsContent value="tests" className="space-y-4">
          <TestLogsManager />
        </TabsContent>

        {/* Integration Tab */}
        <TabsContent value="integration" className="space-y-4">
          <TestIntegrationConfig />
        </TabsContent>

        {/* Logs Tab */}
        <TabsContent value="logs" className="space-y-3">
          {/* Logs Controls */}
          <Card className="p-3">
            <div className="flex flex-col gap-3">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Activity className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">
                    {logs.length} registro{logs.length !== 1 ? 's' : ''}
                  </span>
                  <Badge variant="secondary" className="text-[10px]">BETA</Badge>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    confirm({
                      title: 'Limpar todos os logs',
                      description: 'Tem certeza que deseja excluir todos os logs? Esta ação não pode ser desfeita.',
                      confirmText: 'Limpar',
                      variant: 'destructive',
                      onConfirm: () => clearLogsMutation.mutate(),
                    });
                  }}
                  disabled={logs.length === 0 || clearLogsMutation.isPending}
                  className="text-xs"
                >
                  {clearLogsMutation.isPending ? (
                    <Loader2 className="h-3 w-3 animate-spin mr-1" />
                  ) : (
                    <Trash2 className="h-3 w-3 mr-1" />
                  )}
                  Limpar Logs
                </Button>
              </div>
              
              {/* Toggle logs enabled */}
              {logsConfig && (
                <div className="flex items-center justify-between p-2 border rounded-lg bg-muted/30">
                  <div className="flex items-center gap-2">
                    <Activity className="h-4 w-4 text-primary" />
                    <div>
                      <p className="text-sm font-medium">Salvar logs de comandos</p>
                      <p className="text-[10px] text-muted-foreground">
                        {logsConfig.logs_enabled ? 'Logs estão sendo salvos' : 'Logs desativados'}
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={logsConfig.logs_enabled ?? true}
                    onCheckedChange={(checked) => toggleLogsMutation.mutate(checked)}
                    disabled={toggleLogsMutation.isPending}
                  />
                </div>
              )}
            </div>
          </Card>

          {logsLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : logs.length === 0 ? (
            <Card>
              <CardContent className="py-6 text-center text-muted-foreground">
                <Activity className="h-10 w-10 mx-auto mb-3 opacity-50" />
                <p className="text-sm">Nenhum log de execução.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {logs.map((log) => (
                <Card key={log.id} className="p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <code className="text-xs font-mono text-primary truncate">{log.command_text}</code>
                        {log.success ? (
                          <CheckCircle className="h-3.5 w-3.5 text-green-500 flex-shrink-0" />
                        ) : (
                          <XCircle className="h-3.5 w-3.5 text-destructive flex-shrink-0" />
                        )}
                      </div>
                      <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                        <span className="truncate">{log.sender_phone}</span>
                        {log.execution_time_ms && (
                          <span className="flex items-center gap-0.5">
                            <Clock className="h-2.5 w-2.5" />
                            {log.execution_time_ms}ms
                          </span>
                        )}
                      </div>
                    </div>
                    <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                      {format(new Date(log.created_at), "dd/MM HH:mm", { locale: ptBR })}
                    </span>
                  </div>
                  {!log.success && log.error_message && (
                    <p className="mt-2 text-[10px] text-destructive bg-destructive/10 p-2 rounded">
                      {log.error_message}
                    </p>
                  )}
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* API Dialog */}
      <Dialog open={apiDialogOpen} onOpenChange={setApiDialogOpen}>
        <DialogContent className="max-w-[95vw] sm:max-w-lg flex flex-col p-0">
          <DialogHeader className="px-4 pt-4 sm:px-6 sm:pt-6 pb-2 flex-shrink-0">
            <DialogTitle className="text-lg">{editingApi ? 'Editar API' : 'Nova API de Teste'}</DialogTitle>
            <DialogDescription className="text-xs">
              Configure a API que será chamada pelo comando.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleApiSubmit} className="space-y-3 px-4 sm:px-6 pb-4 sm:pb-6 overflow-y-auto max-h-[calc(85vh-120px)] flex-1">
            <div className="space-y-1.5">
              <Label className="text-sm">Nome *</Label>
              <Input
                value={apiForm.name}
                onChange={(e) => setApiForm({ ...apiForm, name: e.target.value })}
                placeholder="Ex: StarPlay Teste"
                className="h-9"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Descrição</Label>
              <Input
                value={apiForm.description}
                onChange={(e) => setApiForm({ ...apiForm, description: e.target.value })}
                placeholder="Descrição opcional"
                className="h-9"
              />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-1 space-y-1.5">
                <Label className="text-sm">Método</Label>
                <Select value={apiForm.api_method} onValueChange={(v) => setApiForm({ ...apiForm, api_method: v })}>
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="GET">GET</SelectItem>
                    <SelectItem value="POST">POST</SelectItem>
                    <SelectItem value="BOTH">GET e POST</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2 space-y-1.5">
                <Label className="text-sm">URL *</Label>
                <Input
                  value={apiForm.api_url}
                  onChange={(e) => setApiForm({ ...apiForm, api_url: e.target.value })}
                  placeholder="https://api.exemplo.com/teste"
                  className="h-9 text-xs"
                  required
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Headers (JSON)</Label>
              <Textarea
                value={apiForm.api_headers}
                onChange={(e) => setApiForm({ ...apiForm, api_headers: e.target.value })}
                placeholder='{"Authorization": "Bearer token"}'
                className="font-mono text-xs min-h-[60px]"
                rows={2}
              />
            </div>
            {(apiForm.api_method === 'POST' || apiForm.api_method === 'BOTH') && (
              <div className="space-y-1.5">
                <Label className="text-sm">Body Template (JSON)</Label>
                <Textarea
                  value={apiForm.api_body_template}
                  onChange={(e) => setApiForm({ ...apiForm, api_body_template: e.target.value })}
                  placeholder='{"action": "generate_test"}'
                  className="font-mono text-xs min-h-[60px]"
                  rows={2}
                />
              </div>
            )}
            
            {/* Test API Button */}
            <Button
              type="button"
              variant="outline"
              onClick={handleTestApi}
              disabled={testingApi || !apiForm.api_url}
              className="w-full h-9"
              size="sm"
            >
              {testingApi ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Play className="h-4 w-4 mr-2" />
              )}
              Testar API
            </Button>
            
            {/* Test Response Preview - Compact */}
            {testResponse && (
              <div className="space-y-2 border rounded-lg p-3 bg-muted/50 flex-shrink-0">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-medium text-green-600">
                    <CheckCircle className="h-3.5 w-3.5" />
                    Resposta da API
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-5 px-1.5 text-[10px] text-muted-foreground"
                    onClick={() => setTestResponse(null)}
                  >
                    ✕
                  </Button>
                </div>
                <div className="bg-background rounded p-2 text-[10px] font-mono max-h-16 overflow-y-auto">
                  <pre>{JSON.stringify(testResponse, null, 2)}</pre>
                </div>
              </div>
            )}
            
            {/* Custom Response Section - Always Visible with highlight */}
            <div className={`space-y-3 border-2 rounded-lg p-4 transition-all ${apiForm.use_custom_response ? 'border-primary bg-primary/5 shadow-md' : 'border-dashed border-primary/50 bg-gradient-to-r from-primary/5 to-primary/10'}`}>
              {!apiForm.use_custom_response && (
                <div className="flex items-center gap-2 text-xs text-primary font-medium mb-2 animate-pulse">
                  <MessageSquare className="h-3.5 w-3.5" />
                  💡 Personalize a mensagem que será enviada ao cliente!
                </div>
              )}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-full ${apiForm.use_custom_response ? 'bg-primary text-primary-foreground' : 'bg-primary/20'}`}>
                    <MessageSquare className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="font-bold text-sm">✨ Personalizar Mensagem</p>
                    <p className="text-[10px] text-muted-foreground">
                      {apiForm.use_custom_response 
                        ? '✅ Ativo - sua mensagem personalizada será enviada' 
                        : 'Clique para criar sua própria mensagem de resposta'}
                    </p>
                  </div>
                </div>
                <Switch
                  checked={apiForm.use_custom_response}
                  onCheckedChange={(v) => setApiForm({ ...apiForm, use_custom_response: v })}
                />
              </div>
              
              {apiForm.use_custom_response && (
                <>
                  {/* Use Template Button */}
                  {!apiForm.custom_response_template && (
                    <div className="border-t pt-3">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="w-full"
                        onClick={() => {
                          handleTemplateChange(DEFAULT_TEMPLATE);
                          toast.success('Template modelo carregado! Edite como preferir.');
                        }}
                      >
                        📝 Usar Mensagem Modelo
                      </Button>
                    </div>
                  )}
                  
                  {/* Variables Available */}
                  <div className="text-[10px] text-muted-foreground border-t pt-3">
                    <p className="font-medium mb-1.5 text-foreground">📦 Variáveis da API (clique para inserir no cursor):</p>
                    <div className="flex flex-wrap gap-1 mb-3">
                      {['{usuario}', '{senha}', '{vencimento}', '{dns}', '{pacote}', '{nome}'].map(v => (
                        <button
                          key={v}
                          type="button"
                          onClick={() => {
                            const textarea = templateTextareaRef.current;
                            if (textarea) {
                              const start = textarea.selectionStart;
                              const end = textarea.selectionEnd;
                              const currentValue = apiForm.custom_response_template;
                              const newValue = currentValue.substring(0, start) + v + currentValue.substring(end);
                              handleTemplateChange(newValue);
                              // Focus and set cursor position after the inserted variable
                              setTimeout(() => {
                                textarea.focus();
                                textarea.setSelectionRange(start + v.length, start + v.length);
                              }, 0);
                            } else {
                              // Fallback: append at end
                              handleTemplateChange(apiForm.custom_response_template + v);
                            }
                          }}
                          className="bg-primary/10 text-primary px-1.5 py-0.5 rounded text-[9px] hover:bg-primary/20 transition-colors cursor-pointer"
                        >
                          {v}
                        </button>
                      ))}
                    </div>
                    <p className="font-medium mb-1.5 text-foreground">⚙️ Variáveis do sistema:</p>
                    <div className="flex flex-wrap gap-1">
                      {['{empresa}', '{pix}', '{servidor}', '{plano}', '{valor}', '{dias_restantes}', '{apps}', '{links}', '{mac}'].map(v => (
                        <button
                          key={v}
                          type="button"
                          onClick={() => {
                            const textarea = templateTextareaRef.current;
                            if (textarea) {
                              const start = textarea.selectionStart;
                              const end = textarea.selectionEnd;
                              const currentValue = apiForm.custom_response_template;
                              const newValue = currentValue.substring(0, start) + v + currentValue.substring(end);
                              handleTemplateChange(newValue);
                              // Focus and set cursor position after the inserted variable
                              setTimeout(() => {
                                textarea.focus();
                                textarea.setSelectionRange(start + v.length, start + v.length);
                              }, 0);
                            } else {
                              // Fallback: append at end
                              handleTemplateChange(apiForm.custom_response_template + v);
                            }
                          }}
                          className="bg-secondary/50 text-secondary-foreground px-1.5 py-0.5 rounded text-[9px] hover:bg-secondary/80 transition-colors cursor-pointer"
                        >
                          {v}
                        </button>
                      ))}
                    </div>
                  </div>
                  
                  {/* Custom Template Editor */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm font-medium">✍️ Sua mensagem personalizada</Label>
                      {apiForm.custom_response_template && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-6 text-[10px] text-muted-foreground hover:text-destructive"
                          onClick={() => {
                            handleTemplateChange('');
                          }}
                        >
                          Limpar
                        </Button>
                      )}
                    </div>
                    <Textarea
                      ref={templateTextareaRef}
                      value={apiForm.custom_response_template}
                      onChange={(e) => handleTemplateChange(e.target.value)}
                      placeholder="Clique em 'Usar Mensagem Modelo' ou escreva sua mensagem aqui..."
                      className="font-mono text-xs min-h-[120px]"
                      rows={6}
                    />
                    <p className="text-[9px] text-muted-foreground">
                      💡 Posicione o cursor onde deseja inserir a variável e clique nela
                    </p>
                  </div>
                  
                  {/* Live Preview */}
                  {previewMessage && (
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-1 text-xs font-medium text-green-600">
                        <Eye className="h-3.5 w-3.5" />
                        Preview da mensagem
                      </div>
                      <div className="bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-900 rounded-lg p-3">
                        <pre className="text-xs whitespace-pre-wrap">{previewMessage}</pre>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
            
            <div className="space-y-1.5">
              <Label className="text-sm">Caminho da Resposta (opcional)</Label>
              <Input
                value={apiForm.response_path}
                onChange={(e) => setApiForm({ ...apiForm, response_path: e.target.value })}
                placeholder="data.credentials"
                className="h-9 text-xs"
              />
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={apiForm.is_active}
                onCheckedChange={(v) => setApiForm({ ...apiForm, is_active: !!v })}
              />
              <Label className="text-sm">API ativa</Label>
            </div>
            <DialogFooter className="gap-2 pt-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setApiDialogOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" size="sm" disabled={createApiMutation.isPending || updateApiMutation.isPending}>
                {(createApiMutation.isPending || updateApiMutation.isPending) && (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                )}
                {editingApi ? 'Salvar' : 'Criar'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Command Dialog */}
      <Dialog open={commandDialogOpen} onOpenChange={setCommandDialogOpen}>
        <DialogContent className="max-w-[95vw] sm:max-w-md max-h-[85vh] overflow-y-auto p-4 sm:p-6">
          <DialogHeader className="pb-2">
            <DialogTitle className="text-lg">{editingCommand ? 'Editar Comando' : 'Novo Comando'}</DialogTitle>
            <DialogDescription className="text-xs">
              Configure o comando do WhatsApp.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleCommandSubmit} className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-sm">Comando *</Label>
              <Input
                value={commandForm.command}
                onChange={(e) => setCommandForm({ ...commandForm, command: e.target.value })}
                placeholder="/teste"
                className="font-mono h-9"
                required
              />
              <p className="text-[10px] text-muted-foreground">
                Inicie com / (será adicionado automaticamente)
              </p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">API *</Label>
              <Select value={commandForm.api_id} onValueChange={(v) => setCommandForm({ ...commandForm, api_id: v })}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Selecione uma API" />
                </SelectTrigger>
                <SelectContent>
                  {apis.filter(a => a.is_active).map((api) => (
                    <SelectItem key={api.id} value={api.id}>
                      {api.name} ({api.api_method})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Descrição</Label>
              <Input
                value={commandForm.description}
                onChange={(e) => setCommandForm({ ...commandForm, description: e.target.value })}
                placeholder="Gera um teste de 24h"
                className="h-9"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Template de Resposta *</Label>
              <Textarea
                value={commandForm.response_template}
                onChange={(e) => setCommandForm({ ...commandForm, response_template: e.target.value })}
                placeholder="✅ *Teste Gerado!*&#10;&#10;{response}"
                className="min-h-[80px] text-sm"
                rows={3}
                required
              />
              <p className="text-[10px] text-muted-foreground">
                Use <code className="bg-muted px-1 rounded">{'{response}'}</code> para inserir o resultado da API.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={commandForm.is_active}
                onCheckedChange={(v) => setCommandForm({ ...commandForm, is_active: !!v })}
              />
              <Label className="text-sm">Comando ativo</Label>
            </div>
            <DialogFooter className="gap-2 pt-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setCommandDialogOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" size="sm" disabled={createCommandMutation.isPending || updateCommandMutation.isPending}>
                {(createCommandMutation.isPending || updateCommandMutation.isPending) && (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                )}
                {editingCommand ? 'Salvar' : 'Criar'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Global Confirm Dialog */}
      <ConfirmDialog {...dialogProps} />
    </div>
  );
}
