import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useBotEngineConfig } from '@/hooks/useBotEngineConfig';
import { useBotEngineFlows } from '@/hooks/useBotEngineFlows';
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

export default function BotEngine() {
  const { user } = useAuth();
  const { config, isLoading: configLoading, upsertConfig, toggleEnabled } = useBotEngineConfig();
  const { flows, isLoading: flowsLoading, createFlow, updateFlow, deleteFlow, toggleActive } = useBotEngineFlows();
  
  const [isFlowDialogOpen, setIsFlowDialogOpen] = useState(false);
  const [editingFlow, setEditingFlow] = useState<any>(null);
  const [isSaving, setIsSaving] = useState(false);

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

  // Update form when config loads
  useEffect(() => {
    if (config) {
      setWelcomeMessage(config.welcome_message || '');
      setFallbackMessage(config.fallback_message || '');
      setIsEnabled(config.is_enabled ?? true);
      setBusinessHoursEnabled(config.business_hours_enabled ?? false);
      setBusinessHoursStart(config.business_hours_start || '08:00');
      setBusinessHoursEnd(config.business_hours_end || '22:00');
      setBusinessDays(config.business_days || [1, 2, 3, 4, 5, 6]);
      setOutsideHoursMessage(config.outside_hours_message || '');
    }
  }, [config]);

  const toggleDay = (day: number) => {
    setBusinessDays(prev => 
      prev.includes(day) 
        ? prev.filter(d => d !== day) 
        : [...prev, day].sort()
    );
  };

  const handleSaveConfig = async () => {
    if (!user?.id) return;
    
    setIsSaving(true);
    try {
      await upsertConfig({
        is_enabled: isEnabled,
        welcome_message: welcomeMessage,
        fallback_message: fallbackMessage,
        business_hours_enabled: businessHoursEnabled,
        business_hours_start: businessHoursStart,
        business_hours_end: businessHoursEnd,
        business_days: businessDays,
        outside_hours_message: outsideHoursMessage,
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

  const isLoading = configLoading || flowsLoading;

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
          <TabsTrigger value="menus" className="gap-2">
            <MessageSquare className="h-4 w-4" />
            Menus
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
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Label htmlFor="welcome-message">Mensagem de Boas-vindas</Label>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger>
                        <HelpCircle className="h-4 w-4 text-muted-foreground" />
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Enviada quando um cliente inicia a conversa</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <Textarea
                  id="welcome-message"
                  placeholder="Olá! 👋 Seja bem-vindo(a)! Como posso ajudar?"
                  value={welcomeMessage}
                  onChange={(e) => setWelcomeMessage(e.target.value)}
                  rows={4}
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Label htmlFor="fallback-message">Mensagem de Fallback</Label>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger>
                        <HelpCircle className="h-4 w-4 text-muted-foreground" />
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Enviada quando o bot não entende a mensagem</p>
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
          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-lg font-medium">Fluxos de Atendimento</h3>
              <p className="text-sm text-muted-foreground">
                Gerencie os fluxos de conversa do bot
              </p>
            </div>
            <Button onClick={() => setIsFlowDialogOpen(true)} className="gap-2">
              <Plus className="h-4 w-4" />
              Novo Fluxo
            </Button>
          </div>

          {flows.length === 0 ? (
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
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {flows.map((flow) => (
                <Card key={flow.id} className={!flow.is_active ? 'opacity-60' : ''}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base">{flow.name}</CardTitle>
                      <Badge variant={flow.is_active ? 'default' : 'secondary'}>
                        {flow.is_active ? 'Ativo' : 'Inativo'}
                      </Badge>
                    </div>
                    <CardDescription className="line-clamp-2">
                      {flow.description || 'Sem descrição'}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
                      <Badge variant="outline" className="text-xs">
                        {flow.trigger_type}
                      </Badge>
                      {flow.trigger_keywords?.length > 0 && (
                        <span className="text-xs">
                          {flow.trigger_keywords.length} palavras-chave
                        </span>
                      )}
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleToggleFlowActive(flow)}
                      >
                        {flow.is_active ? (
                          <Pause className="h-4 w-4" />
                        ) : (
                          <Play className="h-4 w-4" />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setEditingFlow(flow);
                          setIsFlowDialogOpen(true);
                        }}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteFlow(flow.id)}
                        className="text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Menus Tab */}
        <TabsContent value="menus" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Menus Dinâmicos</CardTitle>
              <CardDescription>
                Configure os menus de navegação do bot (em desenvolvimento)
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <MessageSquare className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">Em breve!</h3>
              <p className="text-sm text-muted-foreground text-center max-w-md">
                O editor visual de menus estará disponível em breve. Por enquanto, 
                você pode configurar os fluxos básicos na aba "Fluxos".
              </p>
            </CardContent>
          </Card>
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
              <Input placeholder="Ex: Menu Principal" />
            </div>
            
            <div className="space-y-2">
              <Label>Descrição</Label>
              <Textarea placeholder="Descreva o objetivo deste fluxo" rows={2} />
            </div>

            <div className="space-y-2">
              <Label>Tipo de Gatilho</Label>
              <Select defaultValue="keyword">
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="keyword">Palavra-chave</SelectItem>
                  <SelectItem value="first_message">Primeira mensagem</SelectItem>
                  <SelectItem value="default">Padrão (fallback)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Palavras-chave (separadas por vírgula)</Label>
              <Input placeholder="menu, início, oi, olá" />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setIsFlowDialogOpen(false);
              setEditingFlow(null);
            }}>
              Cancelar
            </Button>
            <Button onClick={() => {
              toast.success('Fluxo salvo!');
              setIsFlowDialogOpen(false);
              setEditingFlow(null);
            }}>
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
