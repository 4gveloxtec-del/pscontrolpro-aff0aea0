import { useState, useCallback, useMemo, memo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Plus, Pencil, Trash2, GitBranch, ChevronDown, ChevronRight, Loader2, User, MessageSquare, ArrowLeft, XCircle, Star } from 'lucide-react';
import { useChatbotFlows, ChatbotFlow, ChatbotFlowNode } from '@/hooks/useChatbotFlows';
import { useChatbotRules } from '@/hooks/useChatbotRules';
import { toast } from 'sonner';

const NODE_TYPES = {
  text: { label: 'Resposta de Texto', icon: MessageSquare },
  submenu: { label: 'Submenu', icon: GitBranch },
  template: { label: 'Usar Template', icon: MessageSquare },
  human_transfer: { label: 'Atendimento Humano', icon: User },
  end_chat: { label: 'Encerrar Atendimento', icon: XCircle },
};

export function ChatbotFlowManager() {
  const { flows, nodes, isLoading, createFlow, updateFlow, deleteFlow, createNode, updateNode, deleteNode, buildNodeTree, fetchNodes } = useChatbotFlows();
  const { templates } = useChatbotRules();
  
  const [showFlowDialog, setShowFlowDialog] = useState(false);
  const [showNodeDialog, setShowNodeDialog] = useState(false);
  const [showDeleteFlowDialog, setShowDeleteFlowDialog] = useState(false);
  const [showDeleteNodeDialog, setShowDeleteNodeDialog] = useState(false);
  
  const [editingFlow, setEditingFlow] = useState<ChatbotFlow | null>(null);
  const [editingNode, setEditingNode] = useState<ChatbotFlowNode | null>(null);
  const [deletingFlowId, setDeletingFlowId] = useState<string | null>(null);
  const [deletingNodeId, setDeletingNodeId] = useState<string | null>(null);
  
  const [selectedFlowId, setSelectedFlowId] = useState<string | null>(null);
  const [parentNodeId, setParentNodeId] = useState<string | null>(null);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  
  const [isSaving, setIsSaving] = useState(false);
  
  const [flowForm, setFlowForm] = useState({
    name: '',
    description: '',
    is_active: true,
    is_main_menu: false,
  });
  
  const [nodeForm, setNodeForm] = useState({
    option_number: '',
    title: '',
    description: '',
    response_type: 'text' as ChatbotFlowNode['response_type'],
    response_content: { text: '' },
    template_id: '',
    is_active: true,
  });

  const resetFlowForm = () => {
    setFlowForm({ name: '', description: '', is_active: true, is_main_menu: false });
    setEditingFlow(null);
  };

  const resetNodeForm = () => {
    setNodeForm({
      option_number: '',
      title: '',
      description: '',
      response_type: 'text',
      response_content: { text: '' },
      template_id: '',
      is_active: true,
    });
    setEditingNode(null);
    setParentNodeId(null);
  };

  const openEditFlow = (flow: ChatbotFlow) => {
    setEditingFlow(flow);
    setFlowForm({
      name: flow.name,
      description: flow.description || '',
      is_active: flow.is_active,
      is_main_menu: flow.is_main_menu,
    });
    setShowFlowDialog(true);
  };

  const openEditNode = (node: ChatbotFlowNode) => {
    setEditingNode(node);
    setNodeForm({
      option_number: node.option_number,
      title: node.title,
      description: node.description || '',
      response_type: node.response_type,
      response_content: node.response_content,
      template_id: node.template_id || '',
      is_active: node.is_active,
    });
    setShowNodeDialog(true);
  };

  const openAddNode = (flowId: string, parentId: string | null = null) => {
    resetNodeForm();
    setSelectedFlowId(flowId);
    setParentNodeId(parentId);
    
    // Calculate next option number
    const flowNodes = nodes.filter(n => n.flow_id === flowId);
    if (parentId) {
      const siblings = flowNodes.filter(n => n.parent_node_id === parentId);
      const parentNode = flowNodes.find(n => n.id === parentId);
      const nextNum = siblings.length + 1;
      setNodeForm(prev => ({ ...prev, option_number: `${parentNode?.option_number}.${nextNum}` }));
    } else {
      const rootNodes = flowNodes.filter(n => !n.parent_node_id);
      setNodeForm(prev => ({ ...prev, option_number: String(rootNodes.length + 1) }));
    }
    
    setShowNodeDialog(true);
  };

  const handleSaveFlow = async () => {
    if (!flowForm.name.trim()) {
      toast.error('Nome do fluxo é obrigatório');
      return;
    }

    setIsSaving(true);
    try {
      if (editingFlow) {
        await updateFlow(editingFlow.id, flowForm);
      } else {
        await createFlow(flowForm);
      }
      setShowFlowDialog(false);
      resetFlowForm();
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveNode = async () => {
    if (!nodeForm.option_number.trim() || !nodeForm.title.trim()) {
      toast.error('Número da opção e título são obrigatórios');
      return;
    }
    
    if (nodeForm.response_type === 'text' && !nodeForm.response_content.text.trim()) {
      toast.error('Texto da resposta é obrigatório');
      return;
    }

    setIsSaving(true);
    try {
      if (editingNode) {
        await updateNode(editingNode.id, {
          option_number: nodeForm.option_number,
          title: nodeForm.title,
          description: nodeForm.description,
          response_type: nodeForm.response_type,
          response_content: nodeForm.response_content,
          template_id: nodeForm.template_id || undefined,
          is_active: nodeForm.is_active,
        });
      } else if (selectedFlowId) {
        await createNode({
          flow_id: selectedFlowId,
          parent_node_id: parentNodeId || undefined,
          option_number: nodeForm.option_number,
          title: nodeForm.title,
          description: nodeForm.description,
          response_type: nodeForm.response_type,
          response_content: nodeForm.response_content,
          template_id: nodeForm.template_id || undefined,
          sort_order: 0,
          is_active: nodeForm.is_active,
        });
      }
      setShowNodeDialog(false);
      resetNodeForm();
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteFlow = async () => {
    if (!deletingFlowId) return;
    await deleteFlow(deletingFlowId);
    setShowDeleteFlowDialog(false);
    setDeletingFlowId(null);
  };

  const handleDeleteNode = async () => {
    if (!deletingNodeId) return;
    await deleteNode(deletingNodeId);
    setShowDeleteNodeDialog(false);
    setDeletingNodeId(null);
  };

  const toggleNodeExpand = useCallback((nodeId: string) => {
    setExpandedNodes(prev => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  }, []);

  const renderNodeTree = (nodeList: ChatbotFlowNode[], flowId: string, depth = 0): React.ReactNode => {
    return nodeList.map((node) => {
      const hasChildren = node.children && node.children.length > 0;
      const isExpanded = expandedNodes.has(node.id);
      
      return (
        <div key={node.id} className={`${depth > 0 ? 'ml-6 border-l pl-4' : ''}`}>
          <div className={`flex items-center gap-2 p-2 rounded-lg hover:bg-muted/50 ${!node.is_active ? 'opacity-50' : ''}`}>
            {hasChildren ? (
              <button onClick={() => toggleNodeExpand(node.id)} className="p-1">
                {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </button>
            ) : (
              <div className="w-6" />
            )}
            
            <Badge variant="outline" className="font-mono">{node.option_number}</Badge>
            <span className="font-medium flex-1">{node.title}</span>
            <Badge variant="secondary" className="text-xs">
              {NODE_TYPES[node.response_type]?.label || node.response_type}
            </Badge>
            
            <div className="flex items-center gap-1">
              <Switch
                checked={node.is_active}
                onCheckedChange={(checked) => updateNode(node.id, { is_active: checked })}
              />
              {node.response_type === 'submenu' && (
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openAddNode(flowId, node.id)}>
                  <Plus className="h-4 w-4" />
                </Button>
              )}
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEditNode(node)}>
                <Pencil className="h-4 w-4" />
              </Button>
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-8 w-8"
                onClick={() => { setDeletingNodeId(node.id); setShowDeleteNodeDialog(true); }}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
          
          {hasChildren && isExpanded && (
            <div className="mt-1">
              {renderNodeTree(node.children!, flowId, depth + 1)}
            </div>
          )}
        </div>
      );
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-lg font-semibold">Fluxos de Menu Numerado</h2>
          <p className="text-sm text-muted-foreground">Crie menus interativos com opções numeradas</p>
        </div>
        <Button onClick={() => { resetFlowForm(); setShowFlowDialog(true); }}>
          <Plus className="h-4 w-4 mr-2" />
          Novo Fluxo
        </Button>
      </div>

      {flows.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <GitBranch className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">Nenhum fluxo criado</h3>
            <p className="text-muted-foreground text-center mb-4">
              Crie um fluxo de menu numerado para interagir com seus clientes
            </p>
            <Button onClick={() => { resetFlowForm(); setShowFlowDialog(true); }}>
              <Plus className="h-4 w-4 mr-2" />
              Criar Primeiro Fluxo
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {flows.map((flow) => {
            const nodeTree = buildNodeTree(flow.id);
            
            return (
              <Card key={flow.id} className={!flow.is_active ? 'opacity-60' : ''}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <GitBranch className="h-5 w-5 text-primary" />
                      <div>
                        <CardTitle className="text-base flex items-center gap-2">
                          {flow.name}
                          {flow.is_main_menu && (
                            <Badge variant="default" className="text-xs">
                              <Star className="h-3 w-3 mr-1" />
                              Menu Principal
                            </Badge>
                          )}
                        </CardTitle>
                        {flow.description && (
                          <CardDescription>{flow.description}</CardDescription>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={flow.is_active}
                        onCheckedChange={(checked) => updateFlow(flow.id, { is_active: checked })}
                      />
                      <Button variant="outline" size="sm" onClick={() => openAddNode(flow.id)}>
                        <Plus className="h-4 w-4 mr-1" />
                        Opção
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => openEditFlow(flow)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="icon"
                        onClick={() => { setDeletingFlowId(flow.id); setShowDeleteFlowDialog(true); }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {nodeTree.length === 0 ? (
                    <div className="text-center py-6 text-muted-foreground">
                      <p>Nenhuma opção criada</p>
                      <Button variant="link" onClick={() => openAddNode(flow.id)}>
                        Adicionar primeira opção
                      </Button>
                    </div>
                  ) : (
                    <ScrollArea className="max-h-[300px]">
                      {renderNodeTree(nodeTree, flow.id)}
                    </ScrollArea>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Flow Dialog */}
      <Dialog open={showFlowDialog} onOpenChange={(open) => { if (!open) resetFlowForm(); setShowFlowDialog(open); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingFlow ? 'Editar Fluxo' : 'Novo Fluxo'}</DialogTitle>
            <DialogDescription>
              {editingFlow ? 'Edite as configurações do fluxo' : 'Crie um novo fluxo de menu numerado'}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="flow-name">Nome *</Label>
              <Input
                id="flow-name"
                value={flowForm.name}
                onChange={(e) => setFlowForm(prev => ({ ...prev, name: e.target.value }))}
                placeholder="Ex: Menu Principal"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="flow-description">Descrição</Label>
              <Input
                id="flow-description"
                value={flowForm.description}
                onChange={(e) => setFlowForm(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Ex: Menu de opções inicial"
              />
            </div>
            
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Switch
                  id="flow-active"
                  checked={flowForm.is_active}
                  onCheckedChange={(checked) => setFlowForm(prev => ({ ...prev, is_active: checked }))}
                />
                <Label htmlFor="flow-active">Fluxo ativo</Label>
              </div>
              
              <div className="flex items-center gap-2">
                <Switch
                  id="flow-main"
                  checked={flowForm.is_main_menu}
                  onCheckedChange={(checked) => setFlowForm(prev => ({ ...prev, is_main_menu: checked }))}
                />
                <Label htmlFor="flow-main">Menu Principal</Label>
              </div>
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => { resetFlowForm(); setShowFlowDialog(false); }}>
              Cancelar
            </Button>
            <Button onClick={handleSaveFlow} disabled={isSaving}>
              {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {editingFlow ? 'Salvar' : 'Criar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Node Dialog */}
      <Dialog open={showNodeDialog} onOpenChange={(open) => { if (!open) resetNodeForm(); setShowNodeDialog(open); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingNode ? 'Editar Opção' : 'Nova Opção'}</DialogTitle>
            <DialogDescription>
              {editingNode ? 'Edite os dados da opção' : 'Adicione uma opção ao menu'}
            </DialogDescription>
          </DialogHeader>
          
          <ScrollArea className="max-h-[60vh]">
            <div className="space-y-4 pr-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="node-number">Número da Opção *</Label>
                  <Input
                    id="node-number"
                    value={nodeForm.option_number}
                    onChange={(e) => setNodeForm(prev => ({ ...prev, option_number: e.target.value }))}
                    placeholder="Ex: 1, 2, 1.1"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="node-type">Tipo de Resposta</Label>
                  <Select
                    value={nodeForm.response_type}
                    onValueChange={(value: ChatbotFlowNode['response_type']) => setNodeForm(prev => ({ ...prev, response_type: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(NODE_TYPES).map(([key, { label }]) => (
                        <SelectItem key={key} value={key}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="node-title">Título *</Label>
                <Input
                  id="node-title"
                  value={nodeForm.title}
                  onChange={(e) => setNodeForm(prev => ({ ...prev, title: e.target.value }))}
                  placeholder="Ex: Suporte Técnico"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="node-description">Descrição (visível no menu)</Label>
                <Input
                  id="node-description"
                  value={nodeForm.description}
                  onChange={(e) => setNodeForm(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Ex: Obter ajuda técnica"
                />
              </div>
              
              {nodeForm.response_type === 'text' && (
                <div className="space-y-2">
                  <Label htmlFor="node-text">Texto da Resposta *</Label>
                  <Textarea
                    id="node-text"
                    value={nodeForm.response_content.text}
                    onChange={(e) => setNodeForm(prev => ({ ...prev, response_content: { ...prev.response_content, text: e.target.value } }))}
                    placeholder="Mensagem que será enviada quando o cliente escolher esta opção"
                    rows={4}
                  />
                </div>
              )}
              
              {nodeForm.response_type === 'template' && (
                <div className="space-y-2">
                  <Label htmlFor="node-template">Template</Label>
                  <Select
                    value={nodeForm.template_id}
                    onValueChange={(value) => setNodeForm(prev => ({ ...prev, template_id: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione um template" />
                    </SelectTrigger>
                    <SelectContent>
                      {templates.filter(t => t.is_active).map((template) => (
                        <SelectItem key={template.id} value={template.id}>{template.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              
              {nodeForm.response_type === 'human_transfer' && (
                <div className="p-4 bg-muted rounded-lg">
                  <p className="text-sm text-muted-foreground">
                    Quando o cliente escolher esta opção, o bot pausará e aguardará atendimento humano.
                  </p>
                </div>
              )}
              
              {nodeForm.response_type === 'end_chat' && (
                <div className="space-y-2">
                  <Label htmlFor="node-end-text">Mensagem de Encerramento</Label>
                  <Textarea
                    id="node-end-text"
                    value={nodeForm.response_content.text}
                    onChange={(e) => setNodeForm(prev => ({ ...prev, response_content: { ...prev.response_content, text: e.target.value } }))}
                    placeholder="Ex: Obrigado pelo contato! Tenha um ótimo dia!"
                    rows={3}
                  />
                </div>
              )}
              
              {nodeForm.response_type === 'submenu' && (
                <div className="p-4 bg-muted rounded-lg">
                  <p className="text-sm text-muted-foreground">
                    Esta opção criará um submenu. Após salvar, adicione as opções do submenu.
                  </p>
                </div>
              )}
              
              <div className="flex items-center gap-2">
                <Switch
                  id="node-active"
                  checked={nodeForm.is_active}
                  onCheckedChange={(checked) => setNodeForm(prev => ({ ...prev, is_active: checked }))}
                />
                <Label htmlFor="node-active">Opção ativa</Label>
              </div>
            </div>
          </ScrollArea>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => { resetNodeForm(); setShowNodeDialog(false); }}>
              Cancelar
            </Button>
            <Button onClick={handleSaveNode} disabled={isSaving}>
              {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {editingNode ? 'Salvar' : 'Criar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Flow Dialog */}
      <AlertDialog open={showDeleteFlowDialog} onOpenChange={setShowDeleteFlowDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir fluxo?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. Todas as opções deste fluxo serão excluídas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeletingFlowId(null)}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteFlow} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Node Dialog */}
      <AlertDialog open={showDeleteNodeDialog} onOpenChange={setShowDeleteNodeDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir opção?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. As sub-opções também serão desvinculadas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeletingNodeId(null)}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteNode} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
