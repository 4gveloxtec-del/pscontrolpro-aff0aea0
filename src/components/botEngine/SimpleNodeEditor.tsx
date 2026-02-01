/**
 * Editor Simplificado de Nós do Chatbot
 * Interface intuitiva para criar e editar nós de conversa
 * Fácil o suficiente para qualquer pessoa usar
 */

import { useState } from 'react';
import { useBotEngineNodes } from '@/hooks/useBotEngineNodes';
import { useBotEngineFlows } from '@/hooks/useBotEngineFlows';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import {
  Plus,
  Trash2,
  Edit2,
  MessageCircle,
  GitFork,
  Clock,
  Zap,
  Flag,
  Keyboard,
  GripVertical,
  ChevronRight,
  Sparkles,
  X,
  Check,
  ArrowRight,
  PlayCircle,
  FolderTree,
} from 'lucide-react';
import type { BotNode, BotNodeType, BotNodeConfig } from '@/lib/botEngine/types';
import { MenuNodeEditor } from './MenuNodeEditor';
import { cn } from '@/lib/utils';

interface SimpleNodeEditorProps {
  flowId: string;
  flowName: string;
  onClose: () => void;
}

// Templates prontos para criação rápida
const NODE_TEMPLATES: Array<{
  id: string;
  emoji: string;
  title: string;
  description: string;
  type: BotNodeType;
  defaultConfig: BotNodeConfig;
}> = [
  {
    id: 'interactive_menu',
    emoji: '🌳',
    title: 'Menu Interativo',
    description: 'Menu com submenus infinitos',
    type: 'message',
    defaultConfig: {
      message_type: 'menu',
      menu_title: 'Menu Principal',
      menu_header: '👋 Olá! Como posso ajudar?',
      menu_footer: 'Escolha uma opção',
      show_back_button: true,
      back_button_text: '⬅️ Voltar',
      menu_options: [],
    },
  },
  {
    id: 'menu',
    emoji: '📋',
    title: 'Menu Simples (Texto)',
    description: 'Menu tradicional em formato texto',
    type: 'message',
    defaultConfig: {
      message_text: '📋 *MENU PRINCIPAL*\n\n1️⃣ Ver Planos\n2️⃣ Teste Grátis\n3️⃣ Renovar\n4️⃣ Suporte\n\n_Digite o número da opção:_',
    },
  },
  {
    id: 'welcome',
    emoji: '👋',
    title: 'Boas-vindas',
    description: 'Mensagem inicial de saudação',
    type: 'message',
    defaultConfig: {
      message_text: '👋 Olá! Seja bem-vindo(a)!\n\nComo posso ajudar você hoje?',
    },
  },
  {
    id: 'plans',
    emoji: '💰',
    title: 'Lista de Preços',
    description: 'Mostra os planos e valores',
    type: 'message',
    defaultConfig: {
      message_text: '💰 *NOSSOS PLANOS*\n\n📅 Mensal - R$ 25,00\n📅 Trimestral - R$ 60,00\n📅 Semestral - R$ 100,00\n📅 Anual - R$ 180,00\n\n_Escolha um plano para mais detalhes_',
    },
  },
  {
    id: 'pix',
    emoji: '🔑',
    title: 'Dados de Pagamento',
    description: 'Informações de PIX/pagamento',
    type: 'message',
    defaultConfig: {
      message_text: '🔑 *PAGAMENTO VIA PIX*\n\nChave: 00.000.000/0001-00\nNome: Empresa LTDA\n\n📎 Envie o comprovante aqui!',
    },
  },
  {
    id: 'wait_choice',
    emoji: '⌨️',
    title: 'Aguardar Escolha',
    description: 'Espera o cliente digitar uma opção',
    type: 'input',
    defaultConfig: {
      variable_name: 'opcao_escolhida',
      validation_type: 'option',
      validation_options: ['1', '2', '3', '4', '5'],
      error_message: '❌ Opção inválida! Digite um número do menu.',
    },
  },
  {
    id: 'condition',
    emoji: '🔀',
    title: 'Verificar Escolha',
    description: 'Direciona baseado na resposta',
    type: 'condition',
    defaultConfig: {
      condition_variable: 'opcao_escolhida',
    },
  },
  {
    id: 'support',
    emoji: '👤',
    title: 'Chamar Atendente',
    description: 'Transfere para atendimento humano',
    type: 'message',
    defaultConfig: {
      message_text: '👤 *ATENDIMENTO HUMANO*\n\nUm atendente irá responder em breve!\nAguarde um momento... ⏳',
    },
  },
  {
    id: 'end',
    emoji: '🏁',
    title: 'Finalizar Conversa',
    description: 'Encerra o atendimento',
    type: 'end',
    defaultConfig: {
      end_message: '✅ Atendimento finalizado!\n\nObrigado por entrar em contato. 💙',
    },
  },
];

// Configuração visual de cada tipo de nó
const NODE_STYLES: Record<BotNodeType, { emoji: string; label: string; bg: string; border: string }> = {
  start: { emoji: '▶️', label: 'Início', bg: 'bg-emerald-50 dark:bg-emerald-950/30', border: 'border-emerald-200 dark:border-emerald-800' },
  message: { emoji: '💬', label: 'Mensagem', bg: 'bg-blue-50 dark:bg-blue-950/30', border: 'border-blue-200 dark:border-blue-800' },
  input: { emoji: '⌨️', label: 'Aguardar Resposta', bg: 'bg-purple-50 dark:bg-purple-950/30', border: 'border-purple-200 dark:border-purple-800' },
  condition: { emoji: '🔀', label: 'Condição', bg: 'bg-amber-50 dark:bg-amber-950/30', border: 'border-amber-200 dark:border-amber-800' },
  action: { emoji: '⚡', label: 'Ação', bg: 'bg-orange-50 dark:bg-orange-950/30', border: 'border-orange-200 dark:border-orange-800' },
  delay: { emoji: '⏱️', label: 'Esperar', bg: 'bg-gray-50 dark:bg-gray-900/30', border: 'border-gray-200 dark:border-gray-700' },
  goto: { emoji: '↪️', label: 'Ir Para', bg: 'bg-indigo-50 dark:bg-indigo-950/30', border: 'border-indigo-200 dark:border-indigo-800' },
  end: { emoji: '🏁', label: 'Fim', bg: 'bg-red-50 dark:bg-red-950/30', border: 'border-red-200 dark:border-red-800' },
};

export function SimpleNodeEditor({ flowId, flowName, onClose }: SimpleNodeEditorProps) {
  const { nodes, edges, isLoading, createNode, updateNode, deleteNode, isUpdatingNode } = useBotEngineNodes(flowId);
  const { flows } = useBotEngineFlows();
  
  const [showTemplates, setShowTemplates] = useState(false);
  const [editingNode, setEditingNode] = useState<BotNode | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  
  // Estado do config do nó sendo editado (para menu interativo)
  const [editingConfig, setEditingConfig] = useState<BotNodeConfig>({});
  
  // Form states
  const [nodeName, setNodeName] = useState('');
  const [messageText, setMessageText] = useState('');
  const [variableName, setVariableName] = useState('');
  const [validationOptions, setValidationOptions] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [conditionVariable, setConditionVariable] = useState('');
  const [delaySeconds, setDelaySeconds] = useState(1);

  const resetForm = () => {
    setNodeName('');
    setMessageText('');
    setVariableName('');
    setValidationOptions('');
    setErrorMessage('');
    setConditionVariable('');
    setDelaySeconds(1);
    setEditingConfig({});
  };

  // Criar nó a partir de template
  const handleCreateFromTemplate = async (template: typeof NODE_TEMPLATES[0]) => {
    try {
      await createNode({
        flow_id: flowId,
        seller_id: '',
        node_type: template.type,
        name: `${template.emoji} ${template.title}`,
        config: template.defaultConfig,
        position_x: 0,
        position_y: nodes.length * 100,
        is_entry_point: nodes.length === 0,
      });
      toast.success(`✅ "${template.title}" adicionado!`);
      setShowTemplates(false);
    } catch (error) {
      console.error('Error creating node:', error);
      toast.error('Erro ao criar nó');
    }
  };

  // Verificar se é um menu interativo
  const isInteractiveMenu = (node: BotNode) => {
    return node.node_type === 'message' && node.config?.message_type === 'menu';
  };

  // Abrir editor de nó
  const openEditDialog = (node: BotNode) => {
    setEditingNode(node);
    setNodeName(node.name || '');
    setMessageText((node.config?.message_text as string) || '');
    setVariableName((node.config?.variable_name as string) || '');
    setValidationOptions((node.config?.validation_options as string[])?.join(', ') || '');
    setErrorMessage((node.config?.error_message as string) || '');
    setConditionVariable((node.config?.condition_variable as string) || '');
    setDelaySeconds((node.config?.delay_seconds as number) || 1);
    // Para menus interativos, carregar o config completo
    setEditingConfig(node.config || {});
    setIsEditDialogOpen(true);
  };

  // Salvar edições
  const handleSaveEdit = async () => {
    if (!editingNode) return;

    let config: BotNodeConfig;
    
    // Para menus interativos, usar o editingConfig diretamente
    if (isInteractiveMenu(editingNode)) {
      config = { ...editingConfig };
    } else {
      config = { ...editingNode.config };

      switch (editingNode.node_type) {
        case 'message':
          config.message_text = messageText;
          break;
        case 'input':
          config.variable_name = variableName;
          config.validation_type = 'option';
          config.validation_options = validationOptions.split(',').map(s => s.trim()).filter(Boolean);
          config.error_message = errorMessage;
          break;
        case 'condition':
          config.condition_variable = conditionVariable;
          break;
        case 'delay':
          config.delay_seconds = delaySeconds;
          break;
        case 'end':
          config.end_message = messageText;
          break;
      }
    }

    try {
      await updateNode({
        id: editingNode.id,
        updates: {
          name: nodeName.trim() || editingNode.name,
          config,
        },
      });
      toast.success('✅ Alterações salvas!');
      setIsEditDialogOpen(false);
      resetForm();
    } catch (error) {
      console.error('Error updating node:', error);
      toast.error('Erro ao salvar');
    }
  };

  // Deletar nó
  const handleDelete = async (node: BotNode) => {
    const confirmMessage = `Excluir "${node.name || 'este nó'}"?\n\nEsta ação não pode ser desfeita!`;
    if (!confirm(confirmMessage)) return;

    try {
      await deleteNode(node.id);
      toast.success('🗑️ Nó excluído');
    } catch (error) {
      toast.error('Erro ao excluir');
    }
  };

  // Obter conexões do nó
  const getNodeConnections = (nodeId: string) => {
    const outgoing = edges.filter(e => e.source_node_id === nodeId);
    return outgoing.map(edge => {
      const targetNode = nodes.find(n => n.id === edge.target_node_id);
      return {
        condition: edge.condition_value || 'sempre',
        targetName: targetNode?.name || 'Desconhecido',
      };
    });
  };

  // Extrair preview do conteúdo
  const getNodePreview = (node: BotNode): string => {
    try {
      // Para menus interativos, mostrar quantidade de opções
      if (isInteractiveMenu(node)) {
        const menuOptions = Array.isArray(node.config?.menu_options) 
          ? node.config.menu_options 
          : [];
        const title = (node.config?.menu_title as string) || 'Menu';
        return `🌳 ${title} (${menuOptions.length} opção(ões))`;
      }
      
      const text = (node.config?.message_text as string) || (node.config?.end_message as string) || '';
      if (!text) {
        if (node.node_type === 'input') return `Aguarda: ${node.config?.variable_name || 'resposta'}`;
        if (node.node_type === 'condition') return `Verifica: ${node.config?.condition_variable || 'condição'}`;
        if (node.node_type === 'delay') return `Espera: ${node.config?.delay_seconds || 1}s`;
        if (node.node_type === 'action') return `⚡ ${node.config?.action_type || 'ação'}`;
        if (node.node_type === 'goto') return `↪️ Ir para fluxo`;
        return '';
      }
      // Limpar formatação e truncar
      const clean = text.replace(/\*/g, '').replace(/_/g, '').replace(/\n/g, ' ');
      return clean.length > 80 ? clean.slice(0, 80) + '...' : clean;
    } catch (error) {
      console.warn('[SimpleNodeEditor] getNodePreview error:', error);
      return '';
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col h-full">
        <div className="p-4 border-b flex items-center justify-between">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-8 w-8" />
        </div>
        <div className="flex-1 p-4 space-y-3">
          {[1, 2, 3].map(i => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full max-h-[80vh] sm:max-h-[85vh] overflow-hidden">
      {/* Header */}
      <div className="p-3 sm:p-4 border-b flex items-center justify-between shrink-0 gap-2">
        <div className="min-w-0 flex-1">
          <h2 className="text-base sm:text-lg font-semibold flex items-center gap-2">
            <Sparkles className="h-4 w-4 sm:h-5 sm:w-5 text-primary shrink-0" />
            <span className="truncate">Editor</span>
          </h2>
          <p className="text-xs sm:text-sm text-muted-foreground truncate">
            <span className="font-medium text-foreground">{flowName}</span>
          </p>
        </div>
        <div className="flex items-center gap-1 sm:gap-2 shrink-0">
          <Button onClick={() => setShowTemplates(true)} size="sm" className="gap-1 h-8 px-2 sm:px-3">
            <Plus className="h-4 w-4" />
            <span className="hidden xs:inline">Adicionar</span>
          </Button>
          <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Content */}
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-3">
          {nodes.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <MessageCircle className="h-16 w-16 text-muted-foreground/30 mb-4" />
              <h3 className="text-lg font-medium mb-2">Nenhuma etapa configurada</h3>
              <p className="text-sm text-muted-foreground mb-6 max-w-xs">
                Clique em "Adicionar" para criar as etapas da conversa do seu chatbot
              </p>
              <Button onClick={() => setShowTemplates(true)} className="gap-2">
                <Plus className="h-4 w-4" />
                Começar Agora
              </Button>
            </div>
          ) : (
            <>
              {/* Visual flow */}
              {nodes.map((node, index) => {
                const style = NODE_STYLES[node.node_type] || NODE_STYLES.message;
                const connections = getNodeConnections(node.id);
                const preview = getNodePreview(node);
                
                return (
                  <div key={node.id}>
                    {/* Node Card */}
                    <Card 
                      className={`${style.bg} ${style.border} border-2 transition-all hover:shadow-md cursor-pointer group`}
                      onClick={() => openEditDialog(node)}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-start gap-3">
                          {/* Order indicator */}
                          <div className="flex flex-col items-center gap-1">
                            <span className="text-xs text-muted-foreground font-mono bg-background/50 rounded px-1.5 py-0.5">
                              {String(index + 1).padStart(2, '0')}
                            </span>
                            <GripVertical className="h-4 w-4 text-muted-foreground/30" />
                          </div>
                          
                          {/* Content */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-xl">{style.emoji}</span>
                              <h4 className="font-medium truncate">{node.name || 'Sem nome'}</h4>
                              {node.is_entry_point && (
                                <Badge variant="secondary" className="text-xs shrink-0">
                                  <PlayCircle className="h-3 w-3 mr-1" />
                                  Início
                                </Badge>
                              )}
                            </div>
                            
                            {preview && (
                              <p className="text-sm text-muted-foreground line-clamp-2">
                                {preview}
                              </p>
                            )}
                            
                            {/* Tags */}
                            <div className="flex items-center gap-2 mt-2">
                              <Badge variant="outline" className="text-xs">
                                {style.label}
                              </Badge>
                              {connections.length > 0 && (
                                <span className="text-xs text-muted-foreground">
                                  → {connections.length} conexão(ões)
                                </span>
                              )}
                            </div>
                          </div>
                          
                          {/* Actions */}
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={(e) => {
                                e.stopPropagation();
                                openEditDialog(node);
                              }}
                            >
                              <Edit2 className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive hover:text-destructive"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDelete(node);
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                    
                    {/* Connection Arrow */}
                    {index < nodes.length - 1 && (
                      <div className="flex justify-center py-2">
                        <ChevronRight className="h-5 w-5 text-muted-foreground/50 rotate-90" />
                      </div>
                    )}
                  </div>
                );
              })}
              
              {/* Add more button at bottom */}
              <div className="flex justify-center pt-4">
                <Button 
                  variant="outline" 
                  className="gap-2 border-dashed"
                  onClick={() => setShowTemplates(true)}
                >
                  <Plus className="h-4 w-4" />
                  Adicionar Etapa
                </Button>
              </div>
            </>
          )}
        </div>
      </ScrollArea>

      {/* Templates Dialog */}
      <Dialog open={showTemplates} onOpenChange={setShowTemplates}>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader className="shrink-0">
            <DialogTitle className="flex items-center gap-2 text-base sm:text-lg">
              <Sparkles className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
              Adicionar Etapa
            </DialogTitle>
            <DialogDescription className="text-xs sm:text-sm">
              Escolha um modelo pronto
            </DialogDescription>
          </DialogHeader>
          
          <ScrollArea className="flex-1 -mx-6 px-6">
            <div className="grid gap-2 sm:gap-3 grid-cols-1 sm:grid-cols-2 py-2">
              {NODE_TEMPLATES.map((template) => (
                <Card
                  key={template.id}
                  className="cursor-pointer hover:shadow-md transition-all hover:border-primary active:scale-[0.98]"
                  onClick={() => handleCreateFromTemplate(template)}
                >
                  <CardContent className="p-3 sm:p-4">
                    <div className="flex items-start gap-2 sm:gap-3">
                      <span className="text-2xl sm:text-3xl">{template.emoji}</span>
                      <div className="flex-1 min-w-0">
                        <h4 className="font-medium text-sm sm:text-base">{template.title}</h4>
                        <p className="text-xs sm:text-sm text-muted-foreground line-clamp-2">
                          {template.description}
                        </p>
                      </div>
                      <ArrowRight className="h-4 w-4 sm:h-5 sm:w-5 text-muted-foreground shrink-0" />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </ScrollArea>
          
          <DialogFooter className="shrink-0 pt-2">
            <Button variant="outline" onClick={() => setShowTemplates(false)} className="w-full sm:w-auto">
              Cancelar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Node Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent 
          className={cn(
            "w-[calc(100vw-1rem)] sm:w-[calc(100vw-2rem)] overflow-hidden flex flex-col",
            editingNode && isInteractiveMenu(editingNode) 
              ? "max-w-3xl max-h-[90vh]" 
              : "max-w-xl max-h-[85vh]"
          )}
        >
          <DialogHeader className="shrink-0">
            <DialogTitle className="flex items-center gap-2 text-base sm:text-lg">
              {editingNode && (
                <>
                  <span className="text-lg sm:text-xl">
                    {isInteractiveMenu(editingNode) ? '🌳' : NODE_STYLES[editingNode.node_type]?.emoji}
                  </span>
                  <span className="truncate">
                    {isInteractiveMenu(editingNode) ? 'Menu Interativo' : NODE_STYLES[editingNode.node_type]?.label}
                  </span>
                </>
              )}
            </DialogTitle>
            <DialogDescription className="text-xs sm:text-sm">
              {editingNode && isInteractiveMenu(editingNode) 
                ? 'Menus com submenus ilimitados'
                : 'Personalize esta etapa'
              }
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto -mx-6 px-6 space-y-4 py-2">
            {/* Nome */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2 text-sm">
                📝 Nome da Etapa
              </Label>
              <Input
                placeholder="Ex: Menu Principal"
                value={nodeName}
                onChange={(e) => setNodeName(e.target.value)}
                className="text-base"
              />
            </div>

            {/* Editor de Menu Interativo */}
            {editingNode && isInteractiveMenu(editingNode) && (
              <MenuNodeEditor
                config={editingConfig}
                onConfigChange={setEditingConfig}
                availableFlows={flows.map(f => ({ id: f.id, name: f.name }))}
                availableNodes={nodes.map(n => ({ id: n.id, name: n.name || 'Sem nome' }))}
              />
            )}

            {/* Campos específicos por tipo - Mensagem simples (não menu interativo) */}
            {editingNode?.node_type === 'message' && !isInteractiveMenu(editingNode) && (
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  💬 Mensagem para o Cliente
                </Label>
                <Textarea
                  placeholder="Digite a mensagem que será enviada..."
                  value={messageText}
                  onChange={(e) => setMessageText(e.target.value)}
                  rows={8}
                  className="font-mono text-sm"
                />
                <p className="text-xs text-muted-foreground">
                  💡 Use *texto* para <strong>negrito</strong> e _texto_ para <em>itálico</em>
                </p>
              </div>
            )}

            {editingNode?.node_type === 'end' && (
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  🏁 Mensagem de Despedida
                </Label>
                <Textarea
                  placeholder="Mensagem final para o cliente..."
                  value={messageText}
                  onChange={(e) => setMessageText(e.target.value)}
                  rows={4}
                />
              </div>
            )}

            {editingNode?.node_type === 'input' && (
              <>
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    📦 Salvar resposta como
                  </Label>
                  <Input
                    placeholder="Ex: opcao_menu"
                    value={variableName}
                    onChange={(e) => setVariableName(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Nome da variável para guardar a resposta do cliente
                  </p>
                </div>
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    ✅ Respostas válidas
                  </Label>
                  <Input
                    placeholder="1, 2, 3, 4, 5"
                    value={validationOptions}
                    onChange={(e) => setValidationOptions(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Separe as opções por vírgula
                  </p>
                </div>
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    ❌ Mensagem de erro
                  </Label>
                  <Input
                    placeholder="Opção inválida! Digite um número válido."
                    value={errorMessage}
                    onChange={(e) => setErrorMessage(e.target.value)}
                  />
                </div>
              </>
            )}

            {editingNode?.node_type === 'condition' && (
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  🔀 Verificar variável
                </Label>
                <Input
                  placeholder="Ex: opcao_menu"
                  value={conditionVariable}
                  onChange={(e) => setConditionVariable(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  O valor desta variável determinará o próximo passo
                </p>
              </div>
            )}

            {editingNode?.node_type === 'delay' && (
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  ⏱️ Tempo de espera (segundos)
                </Label>
                <Input
                  type="number"
                  min={1}
                  max={60}
                  value={delaySeconds}
                  onChange={(e) => setDelaySeconds(Number(e.target.value))}
                />
              </div>
            )}
          </div>

          <DialogFooter className="shrink-0 pt-2 flex-col-reverse sm:flex-row gap-2">
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)} className="w-full sm:w-auto">
              Cancelar
            </Button>
            <Button onClick={handleSaveEdit} disabled={isUpdatingNode} className="gap-2 w-full sm:w-auto">
              <Check className="h-4 w-4" />
              {isUpdatingNode ? 'Salvando...' : 'Salvar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
