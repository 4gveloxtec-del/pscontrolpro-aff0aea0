import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useBotEngineConfig } from '@/hooks/useBotEngineConfig';
import { useBotEngineFlows } from '@/hooks/useBotEngineFlows';
import { useDefaultIPTVFlows } from '@/hooks/useDefaultIPTVFlows';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { 
  Bot, 
  Settings, 
  MessageSquare, 
  Workflow, 
  Clock, 
  Zap,
  Plus,
  Trash2,
  Edit,
  Play,
  Pause,
  AlertCircle,
  CheckCircle2,
  HelpCircle,
  Eye,
  FolderOpen,
  Folder,
  ChevronDown,
  ChevronRight,
  Copy,
  Globe,
  ScrollText,
  FolderPlus,
  Power,
  MoreHorizontal,
} from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { SimpleNodeEditor } from '@/components/botEngine/SimpleNodeEditor';
import { BotEngineLogs } from '@/components/BotEngineLogs';

export default function BotEngine() {
  const { user } = useAuth();
  const { config, isLoading: configLoading, upsertConfig, toggleEnabled, activeFlowFirstMessage } = useBotEngineConfig();
  const { 
    flows, 
    isLoading: flowsLoading, 
    createFlow, 
    updateFlow, 
    deleteFlow, 
    toggleActive,
    cloneTemplate,
    isCloning 
  } = useBotEngineFlows();
  
  // Inicializar fluxos IPTV padrão para novos usuários
  const { isInitializing: isInitializingFlows } = useDefaultIPTVFlows();
  
  const [isFlowDialogOpen, setIsFlowDialogOpen] = useState(false);
  const [editingFlow, setEditingFlow] = useState<any>(null);
  const [isSaving, setIsSaving] = useState(false);
  
  // State for viewing flow nodes
  const [viewingFlow, setViewingFlow] = useState<{ id: string; name: string } | null>(null);
  
  // State for category/folder management
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set(['Fluxos IPTV']));
  
  // State for creating new folders - persistir em localStorage para não perder ao recarregar
  const [isCreateFolderDialogOpen, setIsCreateFolderDialogOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  
  // Pastas customizadas salvas em localStorage (para pastas vazias persistirem)
  // Inicializa vazio e carrega via useEffect quando user estiver disponível
  const [customFolders, setCustomFolders] = useState<string[]>([]);
  
  // Carregar pastas customizadas do localStorage quando user carregar
  useEffect(() => {
    if (!user?.id) return;
    try {
      const stored = localStorage.getItem(`bot_folders_${user.id}`);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          setCustomFolders(parsed);
        }
      }
    } catch (error) {
      console.warn('[BotEngine] Failed to load custom folders from localStorage:', error);
    }
  }, [user?.id]);
  
  // Salvar pastas customizadas no localStorage quando mudar
  useEffect(() => {
    if (user?.id && customFolders.length > 0) {
      try {
        localStorage.setItem(`bot_folders_${user.id}`, JSON.stringify(customFolders));
      } catch (error) {
        console.warn('[BotEngine] Failed to save custom folders to localStorage:', error);
      }
    }
  }, [customFolders, user?.id]);
  
  // Flow form states
  const [flowName, setFlowName] = useState('');
  const [flowDescription, setFlowDescription] = useState('');
  const [flowTriggerType, setFlowTriggerType] = useState<'keyword' | 'exact_keyword' | 'first_message' | 'default'>('keyword');
  const [flowKeywords, setFlowKeywords] = useState('');
  const [flowCategory, setFlowCategory] = useState<string>('');

  // Form states for config
  const [welcomeMessage, setWelcomeMessage] = useState(config?.welcome_message || '');
  const [fallbackMessage, setFallbackMessage] = useState(config?.fallback_message || '');
  const [isEnabled, setIsEnabled] = useState(config?.is_enabled ?? true);

  // Business hours states
  const [businessHoursEnabled, setBusinessHoursEnabled] = useState(config?.business_hours_enabled ?? false);
  const [businessHoursStart, setBusinessHoursStart] = useState(config?.business_hours_start || '08:00');
  const [businessHoursEnd, setBusinessHoursEnd] = useState(config?.business_hours_end || '22:00');
  const [businessDays, setBusinessDays] = useState<number[]>(config?.business_days || [1, 2, 3, 4, 5, 6]);
  const [outsideHoursMessage, setOutsideHoursMessage] = useState(config?.outside_hours_message || '');

  // Advanced settings states
  const [welcomeEnabled, setWelcomeEnabled] = useState(true); // Nova opção para ativar/desativar boas-vindas
  const [welcomeCooldownValue, setWelcomeCooldownValue] = useState(config?.welcome_cooldown_hours ?? 24);
  const [welcomeCooldownUnit, setWelcomeCooldownUnit] = useState<'seconds' | 'minutes' | 'hours' | 'days'>('hours');
  const [suppressFallbackFirstContact, setSuppressFallbackFirstContact] = useState(config?.suppress_fallback_first_contact ?? true);

  // Converter para horas baseado na unidade selecionada
  const calculateCooldownHours = (value: number, unit: typeof welcomeCooldownUnit): number => {
    switch (unit) {
      case 'seconds': return value / 3600;
      case 'minutes': return value / 60;
      case 'hours': return value;
      case 'days': return value * 24;
      default: return value;
    }
  };

  // Converter de horas para a unidade selecionada (para exibir)
  const hoursToUnit = (hours: number, unit: typeof welcomeCooldownUnit): number => {
    switch (unit) {
      case 'seconds': return Math.round(hours * 3600);
      case 'minutes': return Math.round(hours * 60);
      case 'hours': return hours;
      case 'days': return Math.round(hours / 24);
      default: return hours;
    }
  };

  // Update form when config loads or activeFlowFirstMessage changes
  useEffect(() => {
    if (config) {
      // Se tiver primeira mensagem do fluxo ativo, usar ela como welcome_message
      const effectiveWelcomeMessage = activeFlowFirstMessage || config.welcome_message || '';
      setWelcomeMessage(effectiveWelcomeMessage);
      setFallbackMessage(config.fallback_message || '');
      setIsEnabled(config.is_enabled ?? true);
      setBusinessHoursEnabled(config.business_hours_enabled ?? false);
      setBusinessHoursStart(config.business_hours_start || '08:00');
      setBusinessHoursEnd(config.business_hours_end || '22:00');
      setBusinessDays(config.business_days || [1, 2, 3, 4, 5, 6]);
      setOutsideHoursMessage(config.outside_hours_message || '');
      
      // Detectar se boas-vindas está desativada (cooldown muito alto = desativado)
      const cooldownHours = config.welcome_cooldown_hours ?? 24;
      if (cooldownHours >= 99999) {
        setWelcomeEnabled(false);
        setWelcomeCooldownValue(24);
        setWelcomeCooldownUnit('hours');
      } else {
        setWelcomeEnabled(true);
        // Detectar melhor unidade baseado no valor
        if (cooldownHours >= 24 && cooldownHours % 24 === 0) {
          setWelcomeCooldownValue(cooldownHours / 24);
          setWelcomeCooldownUnit('days');
        } else if (cooldownHours >= 1) {
          setWelcomeCooldownValue(cooldownHours);
          setWelcomeCooldownUnit('hours');
        } else if (cooldownHours * 60 >= 1) {
          setWelcomeCooldownValue(Math.round(cooldownHours * 60));
          setWelcomeCooldownUnit('minutes');
        } else {
          setWelcomeCooldownValue(Math.round(cooldownHours * 3600));
          setWelcomeCooldownUnit('seconds');
        }
      }
      setSuppressFallbackFirstContact(config.suppress_fallback_first_contact ?? true);
    } else if (activeFlowFirstMessage) {
      // Se ainda não tem config mas tem fluxo ativo, usar a mensagem do fluxo
      setWelcomeMessage(activeFlowFirstMessage);
    }
  }, [config, activeFlowFirstMessage]);

  const toggleDay = (day: number) => {
    setBusinessDays(prev => 
      prev.includes(day) 
        ? prev.filter(d => d !== day) 
        : [...prev, day].sort()
    );
  };

  // Reset flow form
  const resetFlowForm = () => {
    setFlowName('');
    setFlowDescription('');
    setFlowTriggerType('keyword');
    setFlowKeywords('');
    setFlowCategory('');
  };

  // Populate form when editing
  useEffect(() => {
    if (editingFlow) {
      setFlowName(editingFlow.name || '');
      setFlowDescription(editingFlow.description || '');
      setFlowTriggerType(editingFlow.trigger_type || 'keyword');
      setFlowKeywords(editingFlow.trigger_keywords?.join(', ') || '');
      setFlowCategory(editingFlow.category || '');
    } else {
      resetFlowForm();
    }
  }, [editingFlow]);
  
  // Get unique categories from flows AND custom folders
  const existingCategories = Array.from(
    new Set([
      ...flows.map(f => f.category).filter(Boolean) as string[],
      ...customFolders
    ])
  ).sort();
  
  // Handle creating a new folder
  const handleCreateFolder = () => {
    const folderName = newFolderName.trim();
    if (!folderName) return;
    
    // Verificar duplicata
    if (existingCategories.includes(folderName)) {
      toast.error(`A pasta "${folderName}" já existe!`);
      return;
    }
    
    // Adicionar à lista de pastas customizadas (persistida em localStorage)
    setCustomFolders(prev => [...prev, folderName]);
    
    // Expandir a nova pasta
    setExpandedCategories(prev => new Set(prev).add(folderName));
    
    setIsCreateFolderDialogOpen(false);
    setNewFolderName('');
    toast.success(`Pasta "${folderName}" criada! Agora você pode adicionar fluxos a ela.`);
  };
  
  // Toggle all flows in a category
  const handleToggleCategoryFlows = async (category: string, activate: boolean) => {
    const categoryFlows = flows.filter(f => (f.category || 'Sem Categoria') === category);
    const flowsToUpdate = categoryFlows.filter(f => f.is_active !== activate);
    
    if (flowsToUpdate.length === 0) {
      toast.info(activate ? 'Todos os fluxos já estão ativos' : 'Todos os fluxos já estão inativos');
      return;
    }
    
    try {
      for (const flow of flowsToUpdate) {
        await toggleActive(flow.id, activate);
      }
      toast.success(`${flowsToUpdate.length} fluxo(s) ${activate ? 'ativado(s)' : 'desativado(s)'} na pasta "${category}"`);
    } catch (error: any) {
      toast.error('Erro ao alterar fluxos: ' + error.message);
    }
  };

  // Save flow handler
  const handleSaveFlow = async () => {
    console.log('[BotEngine] handleSaveFlow called', { 
      flowName, 
      flowTriggerType, 
      flowKeywords,
      userId: user?.id,
      isAuthenticated: !!user 
    });
    
    if (!user?.id) {
      toast.error('Você precisa estar autenticado para criar fluxos');
      console.error('[BotEngine] User not authenticated');
      return;
    }
    
    if (!flowName.trim()) {
      toast.error('Nome do fluxo é obrigatório');
      return;
    }
    
    setIsSaving(true);
    try {
      // Garantir que trigger_keywords seja sempre um array válido
      let keywords: string[] = [];
      if (flowTriggerType === 'keyword' || flowTriggerType === 'exact_keyword') {
        if (flowKeywords.trim()) {
          keywords = flowKeywords.split(',').map(k => k.trim()).filter(Boolean);
        }
        if (keywords.length === 0) {
          toast.error('Palavras-chave são obrigatórias quando o tipo é "Palavra-chave" ou "Palavra exata"');
          setIsSaving(false);
          return;
        }
      }
      
      console.log('[BotEngine] Prepared data:', {
        name: flowName.trim(),
        trigger_type: flowTriggerType,
        keywords,
        editingFlow: !!editingFlow,
        seller_id: user.id
      });
      
      if (editingFlow) {
        console.log('[BotEngine] Calling updateFlow...');
        await updateFlow({
          id: editingFlow.id,
          updates: {
            name: flowName.trim(),
            description: flowDescription.trim() || null,
            trigger_type: flowTriggerType,
            trigger_keywords: keywords,
            category: flowCategory.trim() || null,
          }
        });
        console.log('[BotEngine] updateFlow completed');
        toast.success('Fluxo atualizado com sucesso!');
      } else {
        console.log('[BotEngine] Calling createFlow...');
        const result = await createFlow({
          name: flowName.trim(),
          description: flowDescription.trim() || null,
          trigger_type: flowTriggerType,
          trigger_keywords: keywords,
          category: flowCategory.trim() || null,
        });
        console.log('[BotEngine] createFlow completed:', result);
        toast.success('Fluxo criado com sucesso!');
      }
      
      console.log('[BotEngine] Flow saved successfully, closing dialog');
      setIsFlowDialogOpen(false);
      setEditingFlow(null);
      resetFlowForm();
    } catch (error) {
      console.error('[BotEngine] Error saving flow:', error);
      
      // Extrair mensagem de erro mais legível
      let errorMessage = 'Erro desconhecido';
      if (error instanceof Error) {
        errorMessage = error.message;
      } else if (typeof error === 'object' && error !== null) {
        errorMessage = JSON.stringify(error, null, 2);
      }
      
      console.error('[BotEngine] Detailed error:', errorMessage);
      toast.error(`Erro ao salvar fluxo: ${errorMessage}`, { duration: 5000 });
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveConfig = async () => {
    if (!user?.id) return;
    
    setIsSaving(true);
    try {
      // Se boas-vindas desativada, usar cooldown muito alto (99999 horas = ~11 anos)
      const cooldownHours = welcomeEnabled 
        ? calculateCooldownHours(welcomeCooldownValue, welcomeCooldownUnit)
        : 99999;

      await upsertConfig({
        is_enabled: isEnabled,
        welcome_message: welcomeMessage,
        fallback_message: fallbackMessage,
        business_hours_enabled: businessHoursEnabled,
        business_hours_start: businessHoursStart,
        business_hours_end: businessHoursEnd,
        business_days: businessDays,
        outside_hours_message: outsideHoursMessage,
        welcome_cooldown_hours: cooldownHours,
        suppress_fallback_first_contact: suppressFallbackFirstContact,
      });
      toast.success('Configurações salvas com sucesso!');
    } catch (error: any) {
      toast.error('Erro ao salvar: ' + error.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleEnabled = async (enabled: boolean) => {
    setIsEnabled(enabled);
    try {
      await toggleEnabled(enabled);
      toast.success(enabled ? 'Bot ativado!' : 'Bot desativado!');
    } catch (error: any) {
      toast.error('Erro ao alterar status: ' + error.message);
    }
  };

  const handleToggleFlowActive = async (flow: any) => {
    try {
      await toggleActive(flow.id, !flow.is_active);
    } catch (error: any) {
      toast.error('Erro ao alterar fluxo: ' + error.message);
    }
  };

  const handleDeleteFlow = async (flowId: string) => {
    if (!confirm('Tem certeza que deseja excluir este fluxo?')) return;
    
    try {
      await deleteFlow(flowId);
      toast.success('Fluxo excluído');
    } catch (error: any) {
      toast.error('Erro ao excluir: ' + error.message);
    }
  };

  const isLoading = configLoading || flowsLoading || isInitializingFlows;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-10 w-32" />
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Bot className="h-6 w-6 text-primary" />
            BotEngine
          </h1>
          <p className="text-muted-foreground">
            Configure o chatbot automático para atender seus clientes
          </p>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Label htmlFor="bot-enabled" className="text-sm">Bot Ativo</Label>
            <Switch
              id="bot-enabled"
              checked={isEnabled}
              onCheckedChange={handleToggleEnabled}
            />
          </div>
          <Badge variant={isEnabled ? 'default' : 'secondary'} className="gap-1">
            {isEnabled ? (
              <>
                <CheckCircle2 className="h-3 w-3" />
                Ativo
              </>
            ) : (
              <>
                <AlertCircle className="h-3 w-3" />
                Inativo
              </>
            )}
          </Badge>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Workflow className="h-4 w-4 text-blue-500" />
              Fluxos Ativos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {flows.filter(f => f.is_active).length}
            </div>
            <p className="text-xs text-muted-foreground">
              de {flows.length} fluxos totais
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-green-500" />
              Mensagens Hoje
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">-</div>
            <p className="text-xs text-muted-foreground">
              Processadas pelo bot
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Clock className="h-4 w-4 text-yellow-500" />
              Sessões Ativas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">-</div>
            <p className="text-xs text-muted-foreground">
              Conversas em andamento
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Zap className="h-4 w-4 text-purple-500" />
              Taxa de Resolução
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">-</div>
            <p className="text-xs text-muted-foreground">
              Sem transferência humana
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="config" className="space-y-4">
        <TabsList>
          <TabsTrigger value="config" className="gap-2">
            <Settings className="h-4 w-4" />
            Configurações
          </TabsTrigger>
          <TabsTrigger value="flows" className="gap-2">
            <Workflow className="h-4 w-4" />
            Fluxos
          </TabsTrigger>
          <TabsTrigger value="logs" className="gap-2">
            <ScrollText className="h-4 w-4" />
            Logs
          </TabsTrigger>
        </TabsList>

        {/* Config Tab */}
        <TabsContent value="config" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Mensagens Padrão</CardTitle>
              <CardDescription>
                Configure as mensagens automáticas do bot
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Switch para ativar/desativar mensagem de boas-vindas */}
              <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border">
                <div className="flex items-center gap-2">
                  <Switch
                    id="welcome-enabled"
                    checked={welcomeEnabled}
                    onCheckedChange={setWelcomeEnabled}
                  />
                  <Label htmlFor="welcome-enabled" className="font-medium">
                    Mensagem de Boas-vindas Ativa
                  </Label>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger>
                        <HelpCircle className="h-4 w-4 text-muted-foreground" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        <p>Se desativada, nenhuma mensagem de boas-vindas será enviada automaticamente. O fluxo será acionado por comandos ou palavras-chave.</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <Badge variant={welcomeEnabled ? 'default' : 'secondary'}>
                  {welcomeEnabled ? 'Ativada' : 'Desativada'}
                </Badge>
              </div>

              <div className={`space-y-2 ${!welcomeEnabled ? 'opacity-50 pointer-events-none' : ''}`}>
                <div className="flex items-center gap-2">
                  <Label htmlFor="welcome-message">Mensagem de Boas-vindas</Label>
                  {activeFlowFirstMessage && (
                    <Badge variant="secondary" className="text-xs gap-1">
                      <CheckCircle2 className="h-3 w-3" />
                      Sincronizado com fluxo ativo
                    </Badge>
                  )}
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger>
                        <HelpCircle className="h-4 w-4 text-muted-foreground" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        <p>
                          {activeFlowFirstMessage 
                            ? 'Esta mensagem é sincronizada automaticamente com a primeira mensagem do fluxo ativo.'
                            : 'Enviada quando um cliente inicia a conversa pela primeira vez ou após o tempo de cooldown'
                          }
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <Textarea
                  id="welcome-message"
                  placeholder="Olá! 👋 Seja bem-vindo(a)! Como posso ajudar?"
                  value={welcomeMessage}
                  onChange={(e) => setWelcomeMessage(e.target.value)}
                  rows={6}
                  readOnly={!!activeFlowFirstMessage}
                  className={activeFlowFirstMessage ? 'bg-muted cursor-not-allowed' : ''}
                />
                
                {/* Controle de cooldown com seletor de unidade */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 mt-3 p-3 rounded-lg bg-muted/30 border">
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <Label className="text-sm font-medium">Reenviar após:</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Input
                      id="cooldown-value"
                      type="number"
                      min={1}
                      max={welcomeCooldownUnit === 'seconds' ? 86400 : welcomeCooldownUnit === 'minutes' ? 1440 : welcomeCooldownUnit === 'hours' ? 720 : 30}
                      value={welcomeCooldownValue}
                      onChange={(e) => setWelcomeCooldownValue(Number(e.target.value))}
                      className="w-20"
                    />
                    <Select value={welcomeCooldownUnit} onValueChange={(v) => setWelcomeCooldownUnit(v as typeof welcomeCooldownUnit)}>
                      <SelectTrigger className="w-[130px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="seconds">Segundos</SelectItem>
                        <SelectItem value="minutes">Minutos</SelectItem>
                        <SelectItem value="hours">Horas</SelectItem>
                        <SelectItem value="days">Dias</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    de inatividade
                  </span>
                </div>
              </div>

                {/* Variáveis copiáveis */}
                <div className="mt-4 p-3 rounded-lg bg-muted/50 border">
                  <div className="flex items-center gap-2 mb-2">
                    <Label className="text-sm font-medium">Variáveis Disponíveis</Label>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger>
                          <HelpCircle className="h-4 w-4 text-muted-foreground" />
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs">
                          <p>Clique para copiar. Use essas variáveis nas mensagens do bot para personalização automática.</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { var: '{primeiro_nome}', desc: 'Primeiro nome do cliente' },
                      { var: '{nome}', desc: 'Nome completo do cliente' },
                      { var: '{telefone}', desc: 'Telefone do cliente' },
                      { var: '{empresa}', desc: 'Nome da sua empresa' },
                      { var: '{pix}', desc: 'Sua chave PIX' },
                    ].map((item) => (
                      <TooltipProvider key={item.var}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              onClick={() => {
                                navigator.clipboard.writeText(item.var);
                                toast.success(`"${item.var}" copiado!`);
                              }}
                              className="inline-flex items-center gap-1 px-2 py-1 text-xs font-mono bg-background border rounded-md hover:bg-accent transition-colors cursor-pointer"
                            >
                              <Copy className="h-3 w-3" />
                              {item.var}
                            </button>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>{item.desc}</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    ))}
                  </div>
                </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Label htmlFor="fallback-message">Mensagem de Fallback</Label>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger>
                        <HelpCircle className="h-4 w-4 text-muted-foreground" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        <p>Enviada quando o bot não entende a mensagem do cliente</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <Textarea
                  id="fallback-message"
                  placeholder="Não entendi 😕 Digite *MENU* para ver as opções."
                  value={fallbackMessage}
                  onChange={(e) => setFallbackMessage(e.target.value)}
                  rows={3}
                />
                <div className="flex items-center gap-2 mt-2">
                  <Switch
                    id="suppress-fallback"
                    checked={suppressFallbackFirstContact}
                    onCheckedChange={setSuppressFallbackFirstContact}
                  />
                  <Label htmlFor="suppress-fallback" className="text-sm">
                    Não enviar erro no primeiro contato
                  </Label>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger>
                        <HelpCircle className="h-4 w-4 text-muted-foreground" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        <p>Se ativado, a mensagem de erro só será enviada após o cliente já ter interagido pelo menos uma vez com o bot</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
              </div>

              <div className="flex justify-end">
                <Button onClick={handleSaveConfig} disabled={isSaving}>
                  {isSaving ? 'Salvando...' : 'Salvar Configurações'}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Horário de Funcionamento</CardTitle>
              <CardDescription>
                Configure quando o bot deve atender automaticamente
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <Switch 
                    id="business-hours" 
                    checked={businessHoursEnabled}
                    onCheckedChange={setBusinessHoursEnabled}
                  />
                  <Label htmlFor="business-hours">Ativar horário comercial</Label>
                </div>
              </div>
              
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Horário de Início</Label>
                  <Input 
                    type="time" 
                    value={businessHoursStart}
                    onChange={(e) => setBusinessHoursStart(e.target.value)}
                    disabled={!businessHoursEnabled}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Horário de Término</Label>
                  <Input 
                    type="time" 
                    value={businessHoursEnd}
                    onChange={(e) => setBusinessHoursEnd(e.target.value)}
                    disabled={!businessHoursEnabled}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Dias de Funcionamento</Label>
                <div className="flex flex-wrap gap-2">
                  {[
                    { value: 1, label: 'Seg' },
                    { value: 2, label: 'Ter' },
                    { value: 3, label: 'Qua' },
                    { value: 4, label: 'Qui' },
                    { value: 5, label: 'Sex' },
                    { value: 6, label: 'Sáb' },
                    { value: 0, label: 'Dom' },
                  ].map(day => (
                    <Button 
                      key={day.value}
                      type="button"
                      variant={businessDays.includes(day.value) ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => toggleDay(day.value)}
                      disabled={!businessHoursEnabled}
                    >
                      {day.label}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label>Mensagem Fora do Horário</Label>
                <Textarea
                  placeholder="No momento estamos fora do horário de atendimento..."
                  value={outsideHoursMessage}
                  onChange={(e) => setOutsideHoursMessage(e.target.value)}
                  rows={2}
                  disabled={!businessHoursEnabled}
                />
              </div>

              <div className="flex justify-end">
                <Button onClick={handleSaveConfig} disabled={isSaving}>
                  {isSaving ? 'Salvando...' : 'Salvar Configurações'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Flows Tab */}
        <TabsContent value="flows" className="space-y-4">
          <div className="flex justify-between items-center flex-wrap gap-2">
            <div>
              <h3 className="text-lg font-medium">Fluxos de Atendimento</h3>
              <p className="text-sm text-muted-foreground">
                Gerencie os fluxos de conversa do bot
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button 
                variant="outline"
                onClick={() => setIsCreateFolderDialogOpen(true)} 
                className="gap-2"
              >
                <FolderPlus className="h-4 w-4" />
                Nova Pasta
              </Button>
              <Button onClick={() => setIsFlowDialogOpen(true)} className="gap-2">
                <Plus className="h-4 w-4" />
                Novo Fluxo
              </Button>
            </div>
          </div>

          {flows.length === 0 && customFolders.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Workflow className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium mb-2">Nenhum fluxo configurado</h3>
                <p className="text-sm text-muted-foreground mb-4 text-center">
                  Crie seu primeiro fluxo de atendimento para começar
                </p>
                <Button onClick={() => setIsFlowDialogOpen(true)} className="gap-2">
                  <Plus className="h-4 w-4" />
                  Criar Primeiro Fluxo
                </Button>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Fluxos agrupados por categoria */}
              {(() => {
                // Agrupar fluxos por categoria
                const flowsByCategory = flows.reduce((acc, flow) => {
                  const category = flow.category || 'Sem Categoria';
                  if (!acc[category]) acc[category] = [];
                  acc[category].push(flow);
                  return acc;
                }, {} as Record<string, typeof flows>);
                
                // Incluir pastas customizadas vazias
                for (const folder of customFolders) {
                  if (!flowsByCategory[folder]) {
                    flowsByCategory[folder] = [];
                  }
                }
                
                // Ordenar categorias: "Fluxos IPTV" primeiro, "Arquivo" por último, resto alfabético
                const sortedCategories = Object.keys(flowsByCategory).sort((a, b) => {
                  if (a === 'Fluxos IPTV') return -1;
                  if (b === 'Fluxos IPTV') return 1;
                  if (a === 'Arquivo') return 1;
                  if (b === 'Arquivo') return -1;
                  if (a === 'Sem Categoria') return 1;
                  if (b === 'Sem Categoria') return -1;
                  return a.localeCompare(b);
                });
                
                return sortedCategories.map((category) => {
                  const categoryFlows = flowsByCategory[category];
                  const isExpanded = expandedCategories.has(category);
                  const activeCount = categoryFlows.filter(f => f.is_active).length;
                  
                  // Ícone e cor baseados na categoria
                  const getCategoryStyle = (cat: string) => {
                    if (cat === 'Fluxos IPTV') return { icon: '📺', color: 'bg-blue-500/10 border-blue-500/30' };
                    if (cat === 'Arquivo') return { icon: '📦', color: 'bg-gray-500/10 border-gray-500/30' };
                    return { icon: '📁', color: 'bg-primary/10 border-primary/30' };
                  };
                  const style = getCategoryStyle(category);
                  
                  return (
                    <div key={category} className="space-y-3">
                      {/* Category Header */}
                      <div className={`flex items-center gap-3 p-3 rounded-lg border ${style.color} hover:bg-accent/50 transition-colors`}>
                        <button
                          className="flex items-center gap-3 flex-1"
                          onClick={() => {
                            setExpandedCategories(prev => {
                              const newSet = new Set(prev);
                              if (newSet.has(category)) {
                                newSet.delete(category);
                              } else {
                                newSet.add(category);
                              }
                              return newSet;
                            });
                          }}
                        >
                          {isExpanded ? (
                            <ChevronDown className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="h-4 w-4 text-muted-foreground" />
                          )}
                          <span className="text-xl">{style.icon}</span>
                          <span className="font-medium">{category}</span>
                        </button>
                        <Badge variant="secondary">
                          {activeCount}/{categoryFlows.length} ativos
                        </Badge>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="shrink-0 h-8 w-8">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem 
                              onClick={() => handleToggleCategoryFlows(category, true)}
                              className="gap-2"
                            >
                              <Play className="h-4 w-4" />
                              Ativar todos os fluxos
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                              onClick={() => handleToggleCategoryFlows(category, false)}
                              className="gap-2"
                            >
                              <Pause className="h-4 w-4" />
                              Desativar todos os fluxos
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                      
                      {/* Category Flows */}
                      {isExpanded && (
                        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 pl-4">
                          {categoryFlows.length === 0 ? (
                            // Pasta vazia
                            <div className="col-span-full flex flex-col items-center justify-center py-8 border-2 border-dashed rounded-lg bg-muted/20">
                              <Folder className="h-10 w-10 text-muted-foreground/40 mb-3" />
                              <p className="text-sm text-muted-foreground mb-3">
                                Esta pasta está vazia
                              </p>
                              <Button 
                                variant="outline" 
                                size="sm"
                                onClick={() => {
                                  setFlowCategory(category);
                                  setIsFlowDialogOpen(true);
                                }}
                                className="gap-2"
                              >
                                <Plus className="h-4 w-4" />
                                Adicionar Fluxo
                              </Button>
                            </div>
                          ) : categoryFlows.map((flow) => {
                            // Labels amigáveis para tipos de gatilho
                            const triggerLabels: Record<string, { emoji: string; text: string }> = {
                              keyword: { emoji: '🔤', text: 'Palavra-chave (contém)' },
                              exact_keyword: { emoji: '🎯', text: 'Palavra exata' },
                              first_message: { emoji: '👋', text: 'Primeira mensagem' },
                              default: { emoji: '📥', text: 'Padrão (fallback)' },
                              webhook: { emoji: '🔗', text: 'Webhook' },
                              manual: { emoji: '👆', text: 'Manual' },
                            };
                            const trigger = triggerLabels[flow.trigger_type] || { emoji: '❓', text: flow.trigger_type };
                            
                            // Verificar se é template (de outro seller)
                            const isTemplate = flow.is_template && flow.seller_id !== user?.id;
                            
                            return (
                              <Card 
                                key={flow.id} 
                                className={`transition-all hover:shadow-md ${!flow.is_active ? 'opacity-60' : ''} ${isTemplate ? 'border-blue-500/50 bg-blue-500/5' : ''}`}
                              >
                                <CardHeader className="pb-3">
                                  <div className="flex items-start justify-between gap-2">
                                    <div className="flex items-center gap-2 min-w-0">
                                      <span className="text-2xl">{isTemplate ? '🌐' : '🤖'}</span>
                                      <CardTitle className="text-base truncate">{flow.name}</CardTitle>
                                    </div>
                                    <div className="flex items-center gap-1 shrink-0">
                                      {isTemplate && (
                                        <TooltipProvider>
                                          <Tooltip>
                                            <TooltipTrigger>
                                              <Badge variant="outline" className="gap-1 text-blue-600 border-blue-500/50">
                                                <Globe className="h-3 w-3" />
                                                Template
                                              </Badge>
                                            </TooltipTrigger>
                                            <TooltipContent className="max-w-xs">
                                              <p>Este é um fluxo template universal. Clique em "Usar Template" para criar sua própria cópia editável.</p>
                                            </TooltipContent>
                                          </Tooltip>
                                        </TooltipProvider>
                                      )}
                                      <Badge 
                                        variant={flow.is_active ? 'default' : 'secondary'}
                                      >
                                        {flow.is_active ? '✅ Ativo' : '⏸️ Inativo'}
                                      </Badge>
                                    </div>
                                  </div>
                                  <CardDescription className="line-clamp-2">
                                    {flow.description || 'Sem descrição'}
                                  </CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                  {/* Trigger info */}
                                  <div className="flex items-center gap-2 text-sm">
                                    <span>{trigger.emoji}</span>
                                    <span className="text-muted-foreground">{trigger.text}</span>
                                    {flow.trigger_keywords?.length > 0 && (
                                      <Badge variant="outline" className="text-xs ml-auto">
                                        {flow.trigger_keywords.slice(0, 2).join(', ')}
                                        {flow.trigger_keywords.length > 2 && ` +${flow.trigger_keywords.length - 2}`}
                                      </Badge>
                                    )}
                                  </div>
                                  
                                  {/* Action buttons - diferentes para templates vs próprios */}
                                  <div className="flex items-center gap-2 pt-2 border-t">
                                    {isTemplate ? (
                                      // Botões para templates: apenas visualizar e clonar
                                      <>
                                        <Button
                                          variant="outline"
                                          size="sm"
                                          className="flex-1 gap-2"
                                          onClick={() => setViewingFlow({ id: flow.id, name: flow.name })}
                                        >
                                          <Eye className="h-4 w-4" />
                                          Visualizar
                                        </Button>
                                        <Button
                                          variant="default"
                                          size="sm"
                                          className="flex-1 gap-2"
                                          onClick={async () => {
                                            try {
                                              await cloneTemplate(flow.id);
                                            } catch (error) {
                                              console.error('Clone error:', error);
                                            }
                                          }}
                                          disabled={isCloning}
                                        >
                                          <Copy className="h-4 w-4" />
                                          {isCloning ? 'Clonando...' : 'Usar Template'}
                                        </Button>
                                      </>
                                    ) : (
                                      // Botões normais para fluxos próprios
                                      <>
                                        <Button
                                          variant="default"
                                          size="sm"
                                          className="flex-1 gap-2"
                                          onClick={() => setViewingFlow({ id: flow.id, name: flow.name })}
                                        >
                                          <Eye className="h-4 w-4" />
                                          Editar Conversa
                                        </Button>
                                        <TooltipProvider>
                                          <Tooltip>
                                            <TooltipTrigger asChild>
                                              <Button
                                                variant="outline"
                                                size="icon"
                                                className="shrink-0"
                                                onClick={() => handleToggleFlowActive(flow)}
                                              >
                                                {flow.is_active ? (
                                                  <Pause className="h-4 w-4" />
                                                ) : (
                                                  <Play className="h-4 w-4" />
                                                )}
                                              </Button>
                                            </TooltipTrigger>
                                            <TooltipContent>
                                              {flow.is_active ? 'Pausar fluxo' : 'Ativar fluxo'}
                                            </TooltipContent>
                                          </Tooltip>
                                        </TooltipProvider>
                                        <TooltipProvider>
                                          <Tooltip>
                                            <TooltipTrigger asChild>
                                              <Button
                                                variant="ghost"
                                                size="icon"
                                                className="shrink-0"
                                                onClick={() => {
                                                  setEditingFlow(flow);
                                                  setIsFlowDialogOpen(true);
                                                }}
                                              >
                                                <Edit className="h-4 w-4" />
                                              </Button>
                                            </TooltipTrigger>
                                            <TooltipContent>Editar configurações</TooltipContent>
                                          </Tooltip>
                                        </TooltipProvider>
                                        <TooltipProvider>
                                          <Tooltip>
                                            <TooltipTrigger asChild>
                                              <Button
                                                variant="ghost"
                                                size="icon"
                                                className="shrink-0 text-destructive hover:text-destructive"
                                                onClick={() => handleDeleteFlow(flow.id)}
                                              >
                                                <Trash2 className="h-4 w-4" />
                                              </Button>
                                            </TooltipTrigger>
                                            <TooltipContent>Excluir fluxo</TooltipContent>
                                          </Tooltip>
                                        </TooltipProvider>
                                      </>
                                    )}
                                  </div>
                                </CardContent>
                              </Card>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                });
              })()}
            </>
          )}
        </TabsContent>

        {/* Logs Tab */}
        <TabsContent value="logs" className="space-y-4">
          <BotEngineLogs />
        </TabsContent>
      </Tabs>

      {/* Flow Dialog */}
      <Dialog open={isFlowDialogOpen} onOpenChange={setIsFlowDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingFlow ? 'Editar Fluxo' : 'Novo Fluxo'}
            </DialogTitle>
            <DialogDescription>
              Configure os detalhes do fluxo de atendimento
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Nome do Fluxo</Label>
              <Input 
                placeholder="Ex: Menu Principal" 
                value={flowName}
                onChange={(e) => setFlowName(e.target.value)}
              />
            </div>
            
            <div className="space-y-2">
              <Label>Descrição</Label>
              <Textarea 
                placeholder="Descreva o objetivo deste fluxo" 
                rows={2} 
                value={flowDescription}
                onChange={(e) => setFlowDescription(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Tipo de Gatilho</Label>
              <Select value={flowTriggerType} onValueChange={(v) => setFlowTriggerType(v as any)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="keyword">Palavra-chave (contém)</SelectItem>
                  <SelectItem value="exact_keyword">Palavra exata</SelectItem>
                  <SelectItem value="first_message">Primeira mensagem</SelectItem>
                  <SelectItem value="default">Padrão (fallback)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {(flowTriggerType === 'keyword' || flowTriggerType === 'exact_keyword') && (
              <div className="space-y-2">
                <Label>
                  {flowTriggerType === 'exact_keyword' 
                    ? 'Palavras exatas (separadas por vírgula)' 
                    : 'Palavras-chave (separadas por vírgula)'}
                </Label>
                <Input 
                  placeholder={flowTriggerType === 'exact_keyword' 
                    ? "1, 2, menu, renovar" 
                    : "menu, início, oi, olá"} 
                  value={flowKeywords}
                  onChange={(e) => setFlowKeywords(e.target.value)}
                />
                {flowTriggerType === 'exact_keyword' && (
                  <p className="text-xs text-muted-foreground">
                    Ativa somente se a mensagem for exatamente igual. Ex: "1" não ativa com "11"
                  </p>
                )}
              </div>
            )}
            
            <div className="space-y-2">
              <Label>Pasta (opcional)</Label>
              <Select value={flowCategory || '_none'} onValueChange={(v) => setFlowCategory(v === '_none' ? '' : v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione uma pasta..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">Sem Categoria</SelectItem>
                  {existingCategories.map((cat) => (
                    <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Organize seus fluxos em pastas para melhor gerenciamento
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setIsFlowDialogOpen(false);
              setEditingFlow(null);
              resetFlowForm();
            }}>
              Cancelar
            </Button>
            <Button 
              onClick={handleSaveFlow}
              disabled={isSaving || !flowName.trim()}
            >
              {isSaving ? 'Salvando...' : 'Salvar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Flow Nodes Editor Dialog */}
      <Dialog open={!!viewingFlow} onOpenChange={(open) => !open && setViewingFlow(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] p-0 overflow-hidden">
          {viewingFlow && (
            <SimpleNodeEditor
              flowId={viewingFlow.id}
              flowName={viewingFlow.name}
              onClose={() => setViewingFlow(null)}
            />
          )}
        </DialogContent>
      </Dialog>
      
      {/* Create Folder Dialog */}
      <Dialog open={isCreateFolderDialogOpen} onOpenChange={setIsCreateFolderDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova Pasta</DialogTitle>
            <DialogDescription>
              Crie uma pasta para organizar seus fluxos de atendimento
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Nome da Pasta</Label>
              <Input 
                placeholder="Ex: Fluxos de Vendas" 
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newFolderName.trim()) {
                    handleCreateFolder();
                  }
                }}
              />
            </div>
            
            {existingCategories.length > 0 && (
              <div className="space-y-2">
                <Label className="text-muted-foreground">Pastas existentes</Label>
                <div className="flex flex-wrap gap-2">
                  {existingCategories.map((cat) => (
                    <Badge key={cat} variant="outline">{cat}</Badge>
                  ))}
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setIsCreateFolderDialogOpen(false);
              setNewFolderName('');
            }}>
              Cancelar
            </Button>
            <Button 
              onClick={handleCreateFolder}
              disabled={!newFolderName.trim() || existingCategories.includes(newFolderName.trim())}
            >
              Criar Pasta
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
