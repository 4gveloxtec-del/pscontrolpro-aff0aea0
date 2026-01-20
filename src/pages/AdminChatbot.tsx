import { useState, useRef, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAdminChatbotConfig, ChatbotNode, ChatbotOption } from '@/hooks/useAdminChatbotConfig';
import { 
  MessageSquare, 
  Send, 
  RotateCcw, 
  Bot, 
  Home,
  CreditCard,
  Gift,
  Wrench,
  Headphones,
  Plus,
  Pencil,
  Trash2,
  Save,
  X,
  ChevronRight,
  Settings2,
  Eye
} from 'lucide-react';

interface Message {
  id: string;
  type: 'bot' | 'user';
  content: string;
  timestamp: Date;
}

const ICON_OPTIONS = ['🏠', '📋', '💰', '🎁', '📱', '🍎', '🔥', '📺', '💻', '❓', '💳', '🛠️', '👨‍💻', '⭐', '🎯', '📦'];

export default function AdminChatbot() {
  const { nodes, isLoading, getNodeByKey, createNode, updateNode, deleteNode, processUserInput } = useAdminChatbotConfig();
  
  // Simulator state
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [currentNodeKey, setCurrentNodeKey] = useState('inicial');
  const [isTyping, setIsTyping] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Editor state
  const [showNodeDialog, setShowNodeDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [editingNode, setEditingNode] = useState<ChatbotNode | null>(null);
  const [deletingNodeId, setDeletingNodeId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  
  const [nodeForm, setNodeForm] = useState({
    node_key: '',
    title: '',
    content: '',
    parent_key: '',
    response_type: 'text' as 'menu' | 'text',
    icon: '📋',
    is_active: true,
    options: [] as ChatbotOption[]
  });

  // Initialize chat with inicial node
  useEffect(() => {
    if (!isLoading && nodes.length > 0) {
      const inicial = getNodeByKey('inicial');
      if (inicial) {
        setMessages([{
          id: crypto.randomUUID(),
          type: 'bot',
          content: inicial.content,
          timestamp: new Date()
        }]);
      }
    }
  }, [isLoading, nodes, getNodeByKey]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  };

  const addBotMessage = (content: string) => {
    setIsTyping(true);
    setTimeout(() => {
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        type: 'bot',
        content,
        timestamp: new Date()
      }]);
      setIsTyping(false);
    }, 500);
  };

  const addUserMessage = (content: string) => {
    setMessages(prev => [...prev, {
      id: crypto.randomUUID(),
      type: 'user',
      content,
      timestamp: new Date()
    }]);
  };

  const handleSend = () => {
    if (!input.trim()) return;
    
    addUserMessage(input);
    
    const { nextNode, message } = processUserInput(currentNodeKey, input);
    if (nextNode) {
      setCurrentNodeKey(nextNode.node_key);
    }
    addBotMessage(message);
    
    setInput('');
    inputRef.current?.focus();
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSend();
    }
  };

  const handleReset = () => {
    setMessages([]);
    setCurrentNodeKey('inicial');
    setTimeout(() => {
      const inicial = getNodeByKey('inicial');
      if (inicial) {
        addBotMessage(inicial.content);
      }
    }, 100);
  };

  const formatMessage = (content: string) => {
    let formatted = content.replace(/\*([^*]+)\*/g, '<strong>$1</strong>');
    formatted = formatted.replace(
      /(https?:\/\/[^\s]+)/g,
      '<a href="$1" target="_blank" class="text-blue-400 hover:underline break-all">$1</a>'
    );
    formatted = formatted.replace(/\n/g, '<br />');
    return formatted;
  };

  const getCurrentNodeInfo = () => {
    const node = getNodeByKey(currentNodeKey);
    return node ? { icon: node.icon, title: node.title } : { icon: '🏠', title: 'Menu' };
  };

  // Editor functions
  const resetNodeForm = () => {
    setNodeForm({
      node_key: '',
      title: '',
      content: '',
      parent_key: '',
      response_type: 'text',
      icon: '📋',
      is_active: true,
      options: []
    });
    setEditingNode(null);
  };

  const openEditNode = (node: ChatbotNode) => {
    setEditingNode(node);
    setNodeForm({
      node_key: node.node_key,
      title: node.title,
      content: node.content,
      parent_key: node.parent_key || '',
      response_type: node.response_type,
      icon: node.icon,
      is_active: node.is_active,
      options: node.options || []
    });
    setShowNodeDialog(true);
  };

  const openAddNode = (parentKey?: string) => {
    resetNodeForm();
    if (parentKey) {
      setNodeForm(prev => ({ ...prev, parent_key: parentKey }));
    }
    setShowNodeDialog(true);
  };

  const handleSaveNode = async () => {
    if (!nodeForm.node_key || !nodeForm.title || !nodeForm.content) {
      return;
    }

    setIsSaving(true);

    if (editingNode) {
      await updateNode(editingNode.id, {
        title: nodeForm.title,
        content: nodeForm.content,
        parent_key: nodeForm.parent_key || null,
        response_type: nodeForm.response_type,
        icon: nodeForm.icon,
        is_active: nodeForm.is_active,
        options: nodeForm.options
      });
    } else {
      await createNode({
        node_key: nodeForm.node_key,
        title: nodeForm.title,
        content: nodeForm.content,
        parent_key: nodeForm.parent_key || null,
        response_type: nodeForm.response_type,
        icon: nodeForm.icon,
        is_active: nodeForm.is_active,
        options: nodeForm.options,
        sort_order: nodes.length
      });
    }

    setIsSaving(false);
    setShowNodeDialog(false);
    resetNodeForm();
  };

  const handleDeleteNode = async () => {
    if (!deletingNodeId) return;
    await deleteNode(deletingNodeId);
    setShowDeleteDialog(false);
    setDeletingNodeId(null);
  };

  const addOption = () => {
    setNodeForm(prev => ({
      ...prev,
      options: [...prev.options, { key: String(prev.options.length + 1), label: '', target: '' }]
    }));
  };

  const updateOption = (index: number, field: keyof ChatbotOption, value: string) => {
    setNodeForm(prev => ({
      ...prev,
      options: prev.options.map((opt, i) => i === index ? { ...opt, [field]: value } : opt)
    }));
  };

  const removeOption = (index: number) => {
    setNodeForm(prev => ({
      ...prev,
      options: prev.options.filter((_, i) => i !== index)
    }));
  };

  const getParentOptions = () => {
    return nodes.filter(n => n.response_type === 'menu');
  };

  const getNodeTree = () => {
    const rootNodes = nodes.filter(n => !n.parent_key);
    const buildTree = (parentKey: string | null): ChatbotNode[] => {
      return nodes
        .filter(n => n.parent_key === parentKey)
        .sort((a, b) => a.sort_order - b.sort_order);
    };
    return { rootNodes: rootNodes.sort((a, b) => a.sort_order - b.sort_order), buildTree };
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const { rootNodes, buildTree } = getNodeTree();
  const nodeInfo = getCurrentNodeInfo();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Bot className="h-7 w-7 text-blue-500" />
            Chatbot Interativo
          </h1>
          <p className="text-slate-400 mt-1">
            Configure e teste o atendimento automatizado
          </p>
        </div>
      </div>

      <Tabs defaultValue="simulator" className="space-y-4">
        <TabsList className="bg-slate-800 border-slate-700">
          <TabsTrigger value="simulator" className="data-[state=active]:bg-blue-600">
            <Eye className="h-4 w-4 mr-2" />
            Simulador
          </TabsTrigger>
          <TabsTrigger value="editor" className="data-[state=active]:bg-blue-600">
            <Settings2 className="h-4 w-4 mr-2" />
            Editor
          </TabsTrigger>
        </TabsList>

        {/* SIMULATOR TAB */}
        <TabsContent value="simulator">
          <div className="grid gap-6 lg:grid-cols-3">
            <Card className="lg:col-span-2 bg-slate-800 border-slate-700">
              <CardHeader className="border-b border-slate-700">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-green-600 flex items-center justify-center">
                      <Bot className="h-6 w-6 text-white" />
                    </div>
                    <div>
                      <CardTitle className="text-white text-lg">SANPLAY IPTV</CardTitle>
                      <CardDescription className="text-green-400 flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                        Online
                      </CardDescription>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="border-slate-600 text-slate-300">
                      <span className="mr-1">{nodeInfo.icon}</span>
                      {nodeInfo.title}
                    </Badge>
                    <Button
                      onClick={handleReset}
                      variant="ghost"
                      size="sm"
                      className="text-slate-400 hover:text-white"
                    >
                      <RotateCcw className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <ScrollArea className="h-[500px] p-4" ref={scrollRef}>
                  <div className="space-y-4">
                    {messages.map((message) => (
                      <div
                        key={message.id}
                        className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}
                      >
                        <div
                          className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                            message.type === 'user'
                              ? 'bg-blue-600 text-white rounded-br-md'
                              : 'bg-slate-700 text-slate-100 rounded-bl-md'
                          }`}
                        >
                          <div
                            className="text-sm leading-relaxed"
                            dangerouslySetInnerHTML={{ __html: formatMessage(message.content) }}
                          />
                          <div className={`text-xs mt-1 ${message.type === 'user' ? 'text-blue-200' : 'text-slate-400'}`}>
                            {message.timestamp.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        </div>
                      </div>
                    ))}
                    {isTyping && (
                      <div className="flex justify-start">
                        <div className="bg-slate-700 rounded-2xl rounded-bl-md px-4 py-3">
                          <div className="flex gap-1">
                            <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                            <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                            <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </ScrollArea>

                <div className="p-4 border-t border-slate-700">
                  <div className="flex gap-2">
                    <Input
                      ref={inputRef}
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyPress={handleKeyPress}
                      placeholder="Digite sua mensagem..."
                      className="flex-1 bg-slate-700 border-slate-600 text-white placeholder:text-slate-400"
                    />
                    <Button onClick={handleSend} className="bg-blue-600 hover:bg-blue-700">
                      <Send className="h-4 w-4" />
                    </Button>
                  </div>
                  <p className="text-xs text-slate-500 mt-2">
                    💡 Dica: Digite * a qualquer momento para voltar ao menu principal
                  </p>
                </div>
              </CardContent>
            </Card>

            <div className="space-y-4">
              <Card className="bg-slate-800 border-slate-700">
                <CardHeader>
                  <CardTitle className="text-white text-lg">Ações Rápidas</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-2 gap-2">
                  {['1', '2', '3', '4', '5', '*'].map((option) => (
                    <Button
                      key={option}
                      variant="outline"
                      className="border-slate-600 text-slate-300 hover:bg-slate-700"
                      onClick={() => {
                        addUserMessage(option);
                        const { nextNode, message } = processUserInput(currentNodeKey, option);
                        if (nextNode) {
                          setCurrentNodeKey(nextNode.node_key);
                        }
                        addBotMessage(message);
                      }}
                    >
                      {option === '*' ? '🏠 Menu' : `${option}️⃣`}
                    </Button>
                  ))}
                </CardContent>
              </Card>

              <Card className="bg-slate-800 border-slate-700">
                <CardHeader>
                  <CardTitle className="text-white text-lg">Estrutura</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm max-h-[300px] overflow-y-auto">
                  {rootNodes.map(node => (
                    <div key={node.id}>
                      <div className="flex items-center gap-2 text-slate-300">
                        <span>{node.icon}</span>
                        <span>{node.title}</span>
                      </div>
                      {node.options.length > 0 && (
                        <div className="ml-4 mt-1 space-y-1">
                          {node.options.map((opt, i) => {
                            const targetNode = getNodeByKey(opt.target);
                            return (
                              <div key={i} className="flex items-center gap-1 text-slate-500 text-xs">
                                <ChevronRight className="h-3 w-3" />
                                <span>{opt.key}️⃣</span>
                                <span>{targetNode?.title || opt.target}</span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* EDITOR TAB */}
        <TabsContent value="editor">
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <p className="text-slate-400">Gerencie os menus e respostas do chatbot</p>
              <Button onClick={() => openAddNode()} className="bg-blue-600 hover:bg-blue-700">
                <Plus className="h-4 w-4 mr-2" />
                Novo Menu
              </Button>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {nodes.map(node => (
                <Card key={node.id} className={`bg-slate-800 border-slate-700 ${!node.is_active ? 'opacity-50' : ''}`}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-2xl">{node.icon}</span>
                        <div>
                          <CardTitle className="text-white text-base">{node.title}</CardTitle>
                          <CardDescription className="text-slate-500 text-xs">
                            {node.node_key}
                            {node.parent_key && ` → ${node.parent_key}`}
                          </CardDescription>
                        </div>
                      </div>
                      <Badge variant={node.response_type === 'menu' ? 'default' : 'secondary'} className="text-xs">
                        {node.response_type === 'menu' ? 'Menu' : 'Texto'}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="text-xs text-slate-400 line-clamp-3 bg-slate-900 p-2 rounded">
                      {node.content.substring(0, 150)}...
                    </div>
                    
                    {node.options.length > 0 && (
                      <div className="text-xs text-slate-500">
                        {node.options.length} opções configuradas
                      </div>
                    )}

                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1 border-slate-600 text-slate-300"
                        onClick={() => openEditNode(node)}
                      >
                        <Pencil className="h-3 w-3 mr-1" />
                        Editar
                      </Button>
                      {node.node_key !== 'inicial' && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="border-red-600 text-red-400 hover:bg-red-600/20"
                          onClick={() => {
                            setDeletingNodeId(node.id);
                            setShowDeleteDialog(true);
                          }}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* Node Dialog */}
      <Dialog open={showNodeDialog} onOpenChange={setShowNodeDialog}>
        <DialogContent className="bg-slate-800 border-slate-700 text-white max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingNode ? 'Editar Menu' : 'Novo Menu'}</DialogTitle>
            <DialogDescription className="text-slate-400">
              Configure o conteúdo e opções do menu
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Chave (node_key)</Label>
                <Input
                  value={nodeForm.node_key}
                  onChange={(e) => setNodeForm(prev => ({ ...prev, node_key: e.target.value }))}
                  placeholder="ex: plano_mensal"
                  className="bg-slate-700 border-slate-600"
                  disabled={!!editingNode}
                />
              </div>
              <div className="space-y-2">
                <Label>Título</Label>
                <Input
                  value={nodeForm.title}
                  onChange={(e) => setNodeForm(prev => ({ ...prev, title: e.target.value }))}
                  placeholder="ex: Plano Mensal"
                  className="bg-slate-700 border-slate-600"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Ícone</Label>
                <Select value={nodeForm.icon} onValueChange={(v) => setNodeForm(prev => ({ ...prev, icon: v }))}>
                  <SelectTrigger className="bg-slate-700 border-slate-600">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-700 border-slate-600">
                    {ICON_OPTIONS.map(icon => (
                      <SelectItem key={icon} value={icon}>{icon}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Tipo</Label>
                <Select 
                  value={nodeForm.response_type} 
                  onValueChange={(v: 'menu' | 'text') => setNodeForm(prev => ({ ...prev, response_type: v }))}
                >
                  <SelectTrigger className="bg-slate-700 border-slate-600">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-700 border-slate-600">
                    <SelectItem value="menu">Menu (com opções)</SelectItem>
                    <SelectItem value="text">Texto (resposta final)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Menu Pai</Label>
                <Select 
                  value={nodeForm.parent_key || 'none'} 
                  onValueChange={(v) => setNodeForm(prev => ({ ...prev, parent_key: v === 'none' ? '' : v }))}
                >
                  <SelectTrigger className="bg-slate-700 border-slate-600">
                    <SelectValue placeholder="Nenhum" />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-700 border-slate-600">
                    <SelectItem value="none">Nenhum (raiz)</SelectItem>
                    {getParentOptions().map(n => (
                      <SelectItem key={n.node_key} value={n.node_key}>
                        {n.icon} {n.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Conteúdo da Mensagem</Label>
              <Textarea
                value={nodeForm.content}
                onChange={(e) => setNodeForm(prev => ({ ...prev, content: e.target.value }))}
                placeholder="Digite o conteúdo da mensagem..."
                className="bg-slate-700 border-slate-600 min-h-[150px]"
              />
              <p className="text-xs text-slate-500">Use *texto* para negrito e links começando com https://</p>
            </div>

            {nodeForm.response_type === 'menu' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Opções do Menu</Label>
                  <Button variant="outline" size="sm" onClick={addOption} className="border-slate-600">
                    <Plus className="h-3 w-3 mr-1" />
                    Adicionar
                  </Button>
                </div>
                
                {nodeForm.options.map((opt, index) => (
                  <div key={index} className="flex gap-2 items-center">
                    <Input
                      value={opt.key}
                      onChange={(e) => updateOption(index, 'key', e.target.value)}
                      placeholder="1"
                      className="w-16 bg-slate-700 border-slate-600"
                    />
                    <Input
                      value={opt.label}
                      onChange={(e) => updateOption(index, 'label', e.target.value)}
                      placeholder="Label"
                      className="flex-1 bg-slate-700 border-slate-600"
                    />
                    <Select 
                      value={opt.target} 
                      onValueChange={(v) => updateOption(index, 'target', v)}
                    >
                      <SelectTrigger className="w-40 bg-slate-700 border-slate-600">
                        <SelectValue placeholder="Destino" />
                      </SelectTrigger>
                      <SelectContent className="bg-slate-700 border-slate-600">
                        {nodes.map(n => (
                          <SelectItem key={n.node_key} value={n.node_key}>
                            {n.icon} {n.title}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeOption(index)}
                      className="text-red-400 hover:text-red-300"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            <div className="flex items-center gap-2">
              <Switch
                checked={nodeForm.is_active}
                onCheckedChange={(checked) => setNodeForm(prev => ({ ...prev, is_active: checked }))}
              />
              <Label>Menu ativo</Label>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNodeDialog(false)} className="border-slate-600">
              Cancelar
            </Button>
            <Button onClick={handleSaveNode} disabled={isSaving} className="bg-blue-600 hover:bg-blue-700">
              {isSaving ? 'Salvando...' : 'Salvar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent className="bg-slate-800 border-slate-700">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-white">Excluir Menu?</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">
              Esta ação não pode ser desfeita. O menu será removido permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-slate-600 text-slate-300">Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteNode} className="bg-red-600 hover:bg-red-700">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
