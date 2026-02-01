/**
 * Editor de Nós do Fluxo
 * Permite visualizar e editar todos os nós de um fluxo de chatbot
 */

import { useState } from 'react';
import { useBotEngineNodes } from '@/hooks/useBotEngineNodes';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
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
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { toast } from 'sonner';
import {
  Plus,
  Trash2,
  Edit,
  MessageSquare,
  GitBranch,
  Play,
  Clock,
  ArrowRight,
  Save,
  X,
  Zap,
  CircleDot,
  Flag,
  Keyboard,
} from 'lucide-react';
import type { BotNode, BotNodeType, BotNodeConfig } from '@/lib/botEngine/types';

interface FlowNodesEditorProps {
  flowId: string;
  flowName: string;
  onClose: () => void;
}

const NODE_TYPE_LABELS: Record<BotNodeType, { label: string; icon: React.ReactNode; color: string }> = {
  start: { label: 'Início', icon: <Play className="h-4 w-4" />, color: 'bg-green-500' },
  message: { label: 'Mensagem', icon: <MessageSquare className="h-4 w-4" />, color: 'bg-blue-500' },
  input: { label: 'Entrada', icon: <Keyboard className="h-4 w-4" />, color: 'bg-purple-500' },
  condition: { label: 'Condição', icon: <GitBranch className="h-4 w-4" />, color: 'bg-yellow-500' },
  action: { label: 'Ação', icon: <Zap className="h-4 w-4" />, color: 'bg-orange-500' },
  delay: { label: 'Delay', icon: <Clock className="h-4 w-4" />, color: 'bg-gray-500' },
  goto: { label: 'Ir Para', icon: <ArrowRight className="h-4 w-4" />, color: 'bg-indigo-500' },
  end: { label: 'Fim', icon: <Flag className="h-4 w-4" />, color: 'bg-red-500' },
};

export function FlowNodesEditor({ flowId, flowName, onClose }: FlowNodesEditorProps) {
  const { nodes, edges, isLoading, createNode, updateNode, deleteNode, isUpdatingNode } = useBotEngineNodes(flowId);
  
  const [editingNode, setEditingNode] = useState<BotNode | null>(null);
  const [isNodeDialogOpen, setIsNodeDialogOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  
  // Form states
  const [nodeName, setNodeName] = useState('');
  const [nodeType, setNodeType] = useState<BotNodeType>('message');
  const [messageText, setMessageText] = useState('');
  const [variableName, setVariableName] = useState('');
  const [validationOptions, setValidationOptions] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [conditionVariable, setConditionVariable] = useState('');
  const [delaySeconds, setDelaySeconds] = useState(1);

  const resetForm = () => {
    setNodeName('');
    setNodeType('message');
    setMessageText('');
    setVariableName('');
    setValidationOptions('');
    setErrorMessage('');
    setConditionVariable('');
    setDelaySeconds(1);
  };

  const openCreateDialog = () => {
    setEditingNode(null);
    setIsCreating(true);
    resetForm();
    setIsNodeDialogOpen(true);
  };

  const openEditDialog = (node: BotNode) => {
    setEditingNode(node);
    setIsCreating(false);
    
    // Populate form
    setNodeName(node.name || '');
    setNodeType(node.node_type);
    setMessageText((node.config?.message_text as string) || '');
    setVariableName((node.config?.variable_name as string) || '');
    setValidationOptions((node.config?.validation_options as string[])?.join(', ') || '');
    setErrorMessage((node.config?.error_message as string) || '');
    setConditionVariable((node.config?.condition_variable as string) || '');
    setDelaySeconds((node.config?.delay_seconds as number) || 1);
    
    setIsNodeDialogOpen(true);
  };

  const handleSave = async () => {
    if (!nodeName.trim()) {
      toast.error('Nome do nó é obrigatório');
      return;
    }

    const config: BotNodeConfig = {};

    switch (nodeType) {
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
    }

    try {
      if (isCreating) {
        await createNode({
          flow_id: flowId,
          seller_id: '', // Hook will set this
          node_type: nodeType,
          name: nodeName.trim(),
          config,
          position_x: 0,
          position_y: nodes.length * 100,
          is_entry_point: nodes.length === 0,
        });
        toast.success('Nó criado com sucesso!');
      } else if (editingNode) {
        await updateNode({
          id: editingNode.id,
          updates: {
            name: nodeName.trim(),
            node_type: nodeType,
            config,
          },
        });
        toast.success('Nó atualizado com sucesso!');
      }
      
      setIsNodeDialogOpen(false);
      resetForm();
    } catch (error) {
      console.error('Error saving node:', error);
      toast.error('Erro ao salvar nó');
    }
  };

  const handleDelete = async (nodeId: string, nodeName: string) => {
    if (!confirm(`Excluir o nó "${nodeName}"? Esta ação não pode ser desfeita.`)) return;
    
    try {
      await deleteNode(nodeId);
      toast.success('Nó excluído');
    } catch (error) {
      toast.error('Erro ao excluir nó');
    }
  };

  // Get outgoing edges for a node
  const getOutgoingEdges = (nodeId: string) => {
    return edges.filter(e => e.source_node_id === nodeId);
  };

  // Get target node name
  const getNodeName = (nodeId: string) => {
    const node = nodes.find(n => n.id === nodeId);
    return node?.name || 'Desconhecido';
  };

  if (isLoading) {
    return (
      <Card className="h-full">
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-64" />
        </CardHeader>
        <CardContent className="space-y-4">
          {[1, 2, 3].map(i => (
            <Skeleton key={i} className="h-24" />
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg">Editor de Nós</CardTitle>
            <CardDescription>
              Fluxo: <span className="font-medium text-foreground">{flowName}</span>
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={openCreateDialog}>
              <Plus className="h-4 w-4 mr-1" />
              Novo Nó
            </Button>
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>

      <Separator />

      <CardContent className="flex-1 p-0">
        <ScrollArea className="h-[600px]">
          {nodes.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 px-4">
              <CircleDot className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">Nenhum nó configurado</h3>
              <p className="text-sm text-muted-foreground mb-4 text-center">
                Adicione nós para criar o fluxo de conversa
              </p>
              <Button onClick={openCreateDialog}>
                <Plus className="h-4 w-4 mr-1" />
                Criar Primeiro Nó
              </Button>
            </div>
          ) : (
            <Accordion type="multiple" className="w-full">
              {nodes.map((node, index) => {
                const typeInfo = NODE_TYPE_LABELS[node.node_type] || NODE_TYPE_LABELS.message;
                const outgoingEdges = getOutgoingEdges(node.id);
                
                return (
                  <AccordionItem key={node.id} value={node.id} className="border-b">
                    <AccordionTrigger className="px-4 py-3 hover:bg-muted/50">
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <span className="text-sm text-muted-foreground font-mono w-6">
                          {String(index + 1).padStart(2, '0')}
                        </span>
                        <div className={`p-1.5 rounded ${typeInfo.color} text-white`}>
                          {typeInfo.icon}
                        </div>
                        <div className="flex-1 min-w-0 text-left">
                          <div className="font-medium truncate">{node.name || 'Sem nome'}</div>
                          <div className="text-xs text-muted-foreground">{typeInfo.label}</div>
                        </div>
                        {node.is_entry_point && (
                          <Badge variant="secondary" className="text-xs">
                            Entrada
                          </Badge>
                        )}
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="px-4 pb-4">
                      <div className="space-y-4 pl-9">
                        {/* Node Content Preview */}
                        {node.node_type === 'message' && node.config?.message_text && (
                          <div className="bg-muted/50 rounded-lg p-3">
                            <Label className="text-xs text-muted-foreground mb-1 block">
                              Mensagem:
                            </Label>
                            <pre className="text-sm whitespace-pre-wrap font-sans">
                              {String(node.config.message_text).slice(0, 300)}
                              {String(node.config.message_text).length > 300 && '...'}
                            </pre>
                          </div>
                        )}

                        {node.node_type === 'input' && (
                          <div className="bg-muted/50 rounded-lg p-3 space-y-2">
                            <div>
                              <Label className="text-xs text-muted-foreground">Variável:</Label>
                              <span className="ml-2 font-mono text-sm">
                                {node.config?.variable_name || '-'}
                              </span>
                            </div>
                            {node.config?.validation_options && (
                              <div>
                                <Label className="text-xs text-muted-foreground">Opções válidas:</Label>
                                <span className="ml-2 text-sm">
                                  {(node.config.validation_options as string[]).join(', ')}
                                </span>
                              </div>
                            )}
                          </div>
                        )}

                        {node.node_type === 'condition' && (
                          <div className="bg-muted/50 rounded-lg p-3">
                            <Label className="text-xs text-muted-foreground">Variável de condição:</Label>
                            <span className="ml-2 font-mono text-sm">
                              {node.config?.condition_variable || '-'}
                            </span>
                          </div>
                        )}

                        {node.node_type === 'delay' && (
                          <div className="bg-muted/50 rounded-lg p-3">
                            <Label className="text-xs text-muted-foreground">Delay:</Label>
                            <span className="ml-2 text-sm">
                              {node.config?.delay_seconds || 1} segundos
                            </span>
                          </div>
                        )}

                        {/* Outgoing Edges */}
                        {outgoingEdges.length > 0 && (
                          <div className="space-y-2">
                            <Label className="text-xs text-muted-foreground">Conexões:</Label>
                            <div className="space-y-1">
                              {outgoingEdges.map((edge) => (
                                <div key={edge.id} className="flex items-center gap-2 text-sm">
                                  <ArrowRight className="h-3 w-3 text-muted-foreground" />
                                  <Badge variant="outline" className="text-xs font-normal">
                                    {edge.condition_type === 'variable' 
                                      ? `${edge.condition_value?.split(':')[0]} = ${edge.condition_value?.split(':')[1]}`
                                      : edge.condition_type === 'always' 
                                        ? 'Sempre'
                                        : edge.condition_value || 'Qualquer'
                                    }
                                  </Badge>
                                  <span className="text-muted-foreground">→</span>
                                  <span className="font-medium">{getNodeName(edge.target_node_id)}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Actions */}
                        <div className="flex gap-2 pt-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openEditDialog(node)}
                          >
                            <Edit className="h-4 w-4 mr-1" />
                            Editar
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:text-destructive"
                            onClick={() => handleDelete(node.id, node.name || 'Nó')}
                          >
                            <Trash2 className="h-4 w-4 mr-1" />
                            Excluir
                          </Button>
                        </div>
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                );
              })}
            </Accordion>
          )}
        </ScrollArea>
      </CardContent>

      {/* Node Edit Dialog */}
      <Dialog open={isNodeDialogOpen} onOpenChange={setIsNodeDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {isCreating ? 'Novo Nó' : 'Editar Nó'}
            </DialogTitle>
            <DialogDescription>
              Configure os detalhes do nó de conversa
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Nome do Nó</Label>
                <Input
                  placeholder="Ex: MESSAGE_MENU_PRINCIPAL"
                  value={nodeName}
                  onChange={(e) => setNodeName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Tipo do Nó</Label>
                <Select value={nodeType} onValueChange={(v) => setNodeType(v as BotNodeType)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="message">📨 Mensagem</SelectItem>
                    <SelectItem value="input">⌨️ Entrada</SelectItem>
                    <SelectItem value="condition">🔀 Condição</SelectItem>
                    <SelectItem value="action">⚡ Ação</SelectItem>
                    <SelectItem value="delay">⏱️ Delay</SelectItem>
                    <SelectItem value="start">▶️ Início</SelectItem>
                    <SelectItem value="end">🏁 Fim</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Type-specific fields */}
            {nodeType === 'message' && (
              <div className="space-y-2">
                <Label>Texto da Mensagem</Label>
                <Textarea
                  placeholder="Digite a mensagem que será enviada ao cliente..."
                  value={messageText}
                  onChange={(e) => setMessageText(e.target.value)}
                  rows={8}
                  className="font-mono text-sm"
                />
                <p className="text-xs text-muted-foreground">
                  Use {"{{variavel}}"} para inserir variáveis dinâmicas. Ex: {"{{first_name}}"}, {"{{phone}}"}
                </p>
              </div>
            )}

            {nodeType === 'input' && (
              <>
                <div className="space-y-2">
                  <Label>Nome da Variável</Label>
                  <Input
                    placeholder="Ex: menu_principal_opcao"
                    value={variableName}
                    onChange={(e) => setVariableName(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    A resposta do usuário será salva nesta variável
                  </p>
                </div>
                <div className="space-y-2">
                  <Label>Opções Válidas (separadas por vírgula)</Label>
                  <Input
                    placeholder="1, 2, 3, 4, 5"
                    value={validationOptions}
                    onChange={(e) => setValidationOptions(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Mensagem de Erro</Label>
                  <Input
                    placeholder="❌ Opção inválida. Digite uma opção válida."
                    value={errorMessage}
                    onChange={(e) => setErrorMessage(e.target.value)}
                  />
                </div>
              </>
            )}

            {nodeType === 'condition' && (
              <div className="space-y-2">
                <Label>Variável de Condição</Label>
                <Input
                  placeholder="Ex: menu_principal_opcao"
                  value={conditionVariable}
                  onChange={(e) => setConditionVariable(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  O valor desta variável determinará qual caminho seguir
                </p>
              </div>
            )}

            {nodeType === 'delay' && (
              <div className="space-y-2">
                <Label>Tempo de Espera (segundos)</Label>
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

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsNodeDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={isUpdatingNode}>
              <Save className="h-4 w-4 mr-1" />
              {isUpdatingNode ? 'Salvando...' : 'Salvar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
