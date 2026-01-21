import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Bot, Plus, Settings, MessageSquare, Pencil, Trash2, Copy, Loader2, Variable, Key, Send, ArrowLeft, Menu, Smartphone, ChevronRight, ChevronDown, Image, Download } from 'lucide-react';
import { useSellerChatbotConfig, ChatbotMenuNode, ChatbotKeyword, ChatbotVariable } from '@/hooks/useSellerChatbotConfig';
import { useAuth } from '@/hooks/useAuth';
import { Navigate } from 'react-router-dom';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const ICON_OPTIONS = ['📋', '💰', '📺', '🔧', '❓', '📞', '⏰', '🎁', '📢', '🔔', '✅', '❌', '🎯', '💎', '🚀'];

const RESPONSE_MODES = {
  'always': { label: 'Sempre responder', description: 'Responde a toda mensagem' },
  '6h': { label: 'A cada 6 horas', description: 'Primeira mensagem a cada 6h' },
  '12h': { label: 'A cada 12 horas', description: 'Primeira mensagem a cada 12h' },
  '24h': { label: 'A cada 24 horas', description: 'Primeira mensagem a cada 24h' },
};

interface Message {
  id: string;
  text: string;
  isBot: boolean;
  timestamp: Date;
  imageUrl?: string;
}

export default function SellerChatbotMenu() {
  const { isAdmin, user } = useAuth();

  // Redirect admin to admin chatbot
  if (isAdmin) {
    return <Navigate to="/admin/chatbot" replace />;
  }

  const {
    variables,
    menuNodes,
    keywords,
    settings,
    isLoading,
    saveVariable,
    createVariable,
    deleteVariable,
    createMenuNode,
    updateMenuNode,
    deleteMenuNode,
    saveKeyword,
    deleteKeyword,
    saveSettings,
    copyAdminMenu,
    getNodeByKey,
    replaceVariables,
  } = useSellerChatbotConfig();

  const [activeTab, setActiveTab] = useState('simulator');
  const [simulatorMessages, setSimulatorMessages] = useState<Message[]>([]);
  const [simulatorInput, setSimulatorInput] = useState('');
  const [currentNodeKey, setCurrentNodeKey] = useState('inicial');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Dialogs
  const [showNodeDialog, setShowNodeDialog] = useState(false);
  const [showKeywordDialog, setShowKeywordDialog] = useState(false);
  const [showVariableDialog, setShowVariableDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  // Editing states
  const [editingNode, setEditingNode] = useState<ChatbotMenuNode | null>(null);
  const [editingKeyword, setEditingKeyword] = useState<ChatbotKeyword | null>(null);
  const [editingVariable, setEditingVariable] = useState<ChatbotVariable | null>(null);
  const [deletingItem, setDeletingItem] = useState<{ type: 'node' | 'keyword' | 'variable'; id: string } | null>(null);
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set(['inicial']));
  const [parentNodeKey, setParentNodeKey] = useState<string | null>(null);

  // Form states
  const [nodeForm, setNodeForm] = useState({
    node_key: '',
    title: '',
    content: '',
    parent_key: null as string | null,
    options: [] as { key: string; label: string; target: string }[],
    response_type: 'menu' as 'menu' | 'text',
    icon: '📋',
    sort_order: 0,
    is_active: true,
    image_url: '',
  });

  const [keywordForm, setKeywordForm] = useState({
    keyword: '',
    response_text: '',
    image_url: '',
    is_exact_match: true,
    is_active: true,
  });

  const [variableForm, setVariableForm] = useState({
    variable_key: '',
    variable_value: '',
    description: '',
  });

  // Scroll to bottom
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [simulatorMessages]);

  // Initialize simulator
  const initSimulator = () => {
    const initialNode = getNodeByKey('inicial');
    if (initialNode) {
      const welcomeText = replaceVariables(initialNode.content);
      setSimulatorMessages([{
        id: '1',
        text: welcomeText,
        isBot: true,
        timestamp: new Date(),
        imageUrl: initialNode.image_url || undefined,
      }]);
      setCurrentNodeKey('inicial');
    } else {
      setSimulatorMessages([{
        id: '1',
        text: 'Nenhum menu inicial configurado. Crie um menu com a chave "inicial" ou copie o menu do ADM.',
        isBot: true,
        timestamp: new Date(),
      }]);
    }
  };

  useEffect(() => {
    if (!isLoading && menuNodes.length > 0) {
      initSimulator();
    }
  }, [isLoading, menuNodes]);

  // Process simulator input
  const handleSimulatorSend = () => {
    if (!simulatorInput.trim()) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      text: simulatorInput,
      isBot: false,
      timestamp: new Date(),
    };
    setSimulatorMessages(prev => [...prev, userMessage]);

    const input = simulatorInput.toLowerCase().trim();
    setSimulatorInput('');

    // Check for return to menu
    if (input === '*' || input === 'voltar' || input === 'menu' || input === '0') {
      const initialNode = getNodeByKey('inicial');
      if (initialNode) {
        setTimeout(() => {
          setSimulatorMessages(prev => [...prev, {
            id: Date.now().toString(),
            text: replaceVariables(initialNode.content),
            isBot: true,
            timestamp: new Date(),
            imageUrl: initialNode.image_url || undefined,
          }]);
          setCurrentNodeKey('inicial');
        }, 500);
      }
      return;
    }

    // Check keywords first
    const matchedKeyword = keywords.find(kw => 
      kw.is_active && input === kw.keyword.toLowerCase().trim()
    );

    if (matchedKeyword) {
      setTimeout(() => {
        setSimulatorMessages(prev => [...prev, {
          id: Date.now().toString(),
          text: replaceVariables(matchedKeyword.response_text),
          isBot: true,
          timestamp: new Date(),
          imageUrl: matchedKeyword.image_url || undefined,
        }]);
      }, 500);
      return;
    }

    // Process menu navigation
    const currentNode = getNodeByKey(currentNodeKey);
    if (currentNode) {
      const options = currentNode.options || [];
      const matchedOption = options.find(opt => opt.key === input);
      
      if (matchedOption && matchedOption.target) {
        const targetNode = getNodeByKey(matchedOption.target);
        if (targetNode) {
          setTimeout(() => {
            setSimulatorMessages(prev => [...prev, {
              id: Date.now().toString(),
              text: replaceVariables(targetNode.content),
              isBot: true,
              timestamp: new Date(),
              imageUrl: targetNode.image_url || undefined,
            }]);
            setCurrentNodeKey(targetNode.node_key);
          }, 500);
          return;
        }
      }
    }

    // No match - silent mode or show error
    if (!settings?.silent_mode) {
      setTimeout(() => {
        setSimulatorMessages(prev => [...prev, {
          id: Date.now().toString(),
          text: 'Opção inválida. Digite * para voltar ao menu principal.',
          isBot: true,
          timestamp: new Date(),
        }]);
      }, 500);
    }
  };

  // Open node dialog for editing
  const openEditNode = (node: ChatbotMenuNode) => {
    setEditingNode(node);
    setNodeForm({
      node_key: node.node_key,
      title: node.title,
      content: node.content,
      parent_key: node.parent_key,
      options: node.options || [],
      response_type: node.response_type as 'menu' | 'text',
      icon: node.icon,
      sort_order: node.sort_order,
      is_active: node.is_active,
      image_url: node.image_url || '',
    });
    setShowNodeDialog(true);
  };

  // Open node dialog for creating
  const openAddNode = (parentKey?: string) => {
    setEditingNode(null);
    setParentNodeKey(parentKey || null);
    const nextOrder = menuNodes.filter(n => n.parent_key === parentKey).length + 1;
    setNodeForm({
      node_key: '',
      title: '',
      content: '',
      parent_key: parentKey || null,
      options: [],
      response_type: 'menu',
      icon: '📋',
      sort_order: nextOrder,
      is_active: true,
      image_url: '',
    });
    setShowNodeDialog(true);
  };

  // Save node
  const handleSaveNode = async () => {
    if (!nodeForm.node_key || !nodeForm.title || !nodeForm.content) {
      toast.error('Preencha todos os campos obrigatórios');
      return;
    }

    if (editingNode) {
      await updateMenuNode(editingNode.id, nodeForm);
    } else {
      await createMenuNode(nodeForm);
    }
    setShowNodeDialog(false);
  };

  // Delete node
  const handleDeleteNode = async (id: string) => {
    await deleteMenuNode(id);
    setShowDeleteDialog(false);
  };

  // Add option to node
  const addOption = () => {
    const nextKey = String(nodeForm.options.length + 1);
    setNodeForm({
      ...nodeForm,
      options: [...nodeForm.options, { key: nextKey, label: '', target: '' }],
    });
  };

  // Remove option
  const removeOption = (index: number) => {
    const newOptions = [...nodeForm.options];
    newOptions.splice(index, 1);
    setNodeForm({ ...nodeForm, options: newOptions });
  };

  // Update option
  const updateOption = (index: number, field: string, value: string) => {
    const newOptions = [...nodeForm.options];
    newOptions[index] = { ...newOptions[index], [field]: value };
    setNodeForm({ ...nodeForm, options: newOptions });
  };

  // Open keyword dialog
  const openKeywordDialog = (keyword?: ChatbotKeyword) => {
    if (keyword) {
      setEditingKeyword(keyword);
      setKeywordForm({
        keyword: keyword.keyword,
        response_text: keyword.response_text,
        image_url: keyword.image_url || '',
        is_exact_match: keyword.is_exact_match,
        is_active: keyword.is_active,
      });
    } else {
      setEditingKeyword(null);
      setKeywordForm({
        keyword: '',
        response_text: '',
        image_url: '',
        is_exact_match: true,
        is_active: true,
      });
    }
    setShowKeywordDialog(true);
  };

  // Save keyword
  const handleSaveKeyword = async () => {
    if (!keywordForm.keyword || !keywordForm.response_text) {
      toast.error('Preencha palavra-chave e resposta');
      return;
    }

    await saveKeyword({
      id: editingKeyword?.id,
      ...keywordForm,
    });
    setShowKeywordDialog(false);
  };

  // Open variable dialog
  const openVariableDialog = (variable?: ChatbotVariable) => {
    if (variable) {
      setEditingVariable(variable);
      setVariableForm({
        variable_key: variable.variable_key,
        variable_value: variable.variable_value,
        description: variable.description || '',
      });
    } else {
      setEditingVariable(null);
      setVariableForm({
        variable_key: '',
        variable_value: '',
        description: '',
      });
    }
    setShowVariableDialog(true);
  };

  // Save variable
  const handleSaveVariable = async () => {
    if (!variableForm.variable_key) {
      toast.error('Informe o nome da variável');
      return;
    }

    if (editingVariable) {
      await saveVariable(editingVariable.variable_key, variableForm.variable_value);
    } else {
      await createVariable(variableForm.variable_key, variableForm.variable_value, variableForm.description);
    }
    setShowVariableDialog(false);
  };

  // Toggle node expansion
  const toggleNode = (nodeKey: string) => {
    const newExpanded = new Set(expandedNodes);
    if (newExpanded.has(nodeKey)) {
      newExpanded.delete(nodeKey);
    } else {
      newExpanded.add(nodeKey);
    }
    setExpandedNodes(newExpanded);
  };

  // Render menu tree
  const renderMenuTree = (parentKey: string | null = null, level = 0) => {
    const nodes = menuNodes.filter(n => n.parent_key === parentKey).sort((a, b) => a.sort_order - b.sort_order);
    
    if (nodes.length === 0) return null;

    return (
      <div className={level > 0 ? 'ml-4 border-l pl-4 border-border' : ''}>
        {nodes.map(node => {
          const childNodes = menuNodes.filter(n => n.parent_key === node.node_key);
          const hasChildren = childNodes.length > 0;
          const isExpanded = expandedNodes.has(node.node_key);

          return (
            <div key={node.id} className="mb-2">
              <div className="flex items-center gap-2 p-2 rounded-lg bg-muted/50 hover:bg-muted">
                {hasChildren ? (
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => toggleNode(node.node_key)}>
                    {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  </Button>
                ) : (
                  <div className="w-6" />
                )}
                
                <span className="text-lg">{node.icon}</span>
                <div className="flex-1">
                  <div className="font-medium text-sm">{node.title}</div>
                  <div className="text-xs text-muted-foreground">Chave: {node.node_key}</div>
                </div>
                
                <Badge variant={node.is_active ? 'default' : 'secondary'} className="text-xs">
                  {node.is_active ? 'Ativo' : 'Inativo'}
                </Badge>
                
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openAddNode(node.node_key)}>
                    <Plus className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditNode(node)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => {
                    setDeletingItem({ type: 'node', id: node.id });
                    setShowDeleteDialog(true);
                  }}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              
              {hasChildren && isExpanded && renderMenuTree(node.node_key, level + 1)}
            </div>
          );
        })}
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Bot className="h-6 w-6" />
            Menu Interativo do Chatbot
          </h1>
          <p className="text-muted-foreground">Configure seu menu de atendimento automático</p>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Label htmlFor="menu-enabled">Ativar Menu</Label>
            <Switch
              id="menu-enabled"
              checked={settings?.menu_enabled ?? true}
              onCheckedChange={(checked) => saveSettings({ menu_enabled: checked })}
            />
          </div>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="simulator" className="flex items-center gap-2">
            <Smartphone className="h-4 w-4" />
            Simulador
          </TabsTrigger>
          <TabsTrigger value="editor" className="flex items-center gap-2">
            <Menu className="h-4 w-4" />
            Editor de Menus
          </TabsTrigger>
          <TabsTrigger value="keywords" className="flex items-center gap-2">
            <Key className="h-4 w-4" />
            Palavras-Chave
          </TabsTrigger>
          <TabsTrigger value="variables" className="flex items-center gap-2">
            <Variable className="h-4 w-4" />
            Variáveis
          </TabsTrigger>
          <TabsTrigger value="settings" className="flex items-center gap-2">
            <Settings className="h-4 w-4" />
            Configurações
          </TabsTrigger>
        </TabsList>

        {/* Simulator Tab */}
        <TabsContent value="simulator">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Smartphone className="h-5 w-5" />
                  Simulador de Conversa
                </CardTitle>
                <CardDescription>
                  Teste seu menu interativo antes de ativar
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="border rounded-lg h-[400px] flex flex-col bg-gradient-to-b from-green-50 to-green-100 dark:from-green-950 dark:to-green-900">
                  <div className="bg-green-600 text-white p-3 rounded-t-lg flex items-center gap-3">
                    <Bot className="h-8 w-8" />
                    <div>
                      <div className="font-semibold">Seu Bot</div>
                      <div className="text-xs opacity-80">Online</div>
                    </div>
                  </div>
                  
                  <ScrollArea className="flex-1 p-4">
                    <div className="space-y-3">
                      {simulatorMessages.map(msg => (
                        <div key={msg.id} className={`flex ${msg.isBot ? 'justify-start' : 'justify-end'}`}>
                          <div className={`max-w-[80%] rounded-lg p-3 ${
                            msg.isBot 
                              ? 'bg-white dark:bg-gray-800 shadow-sm' 
                              : 'bg-green-500 text-white'
                          }`}>
                            {msg.imageUrl && (
                              <img src={msg.imageUrl} alt="" className="rounded-lg mb-2 max-w-full" />
                            )}
                            <p className="text-sm whitespace-pre-wrap">{msg.text}</p>
                            <span className="text-[10px] opacity-60 mt-1 block">
                              {format(msg.timestamp, 'HH:mm')}
                            </span>
                          </div>
                        </div>
                      ))}
                      <div ref={messagesEndRef} />
                    </div>
                  </ScrollArea>
                  
                  <div className="p-3 bg-white dark:bg-gray-800 border-t flex gap-2">
                    <Input
                      value={simulatorInput}
                      onChange={(e) => setSimulatorInput(e.target.value)}
                      placeholder="Digite uma mensagem..."
                      onKeyDown={(e) => e.key === 'Enter' && handleSimulatorSend()}
                    />
                    <Button onClick={handleSimulatorSend} size="icon">
                      <Send className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                
                <div className="mt-4 flex gap-2">
                  <Button variant="outline" onClick={initSimulator}>
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Reiniciar
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Dicas de Uso</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="p-4 bg-muted rounded-lg">
                  <h4 className="font-semibold mb-2">📱 Navegação</h4>
                  <ul className="text-sm space-y-1 text-muted-foreground">
                    <li>• Digite números (1, 2, 3) para navegar pelas opções</li>
                    <li>• Digite <code className="bg-background px-1 rounded">*</code> para voltar ao menu inicial</li>
                    <li>• O cooldown de 12h só afeta a primeira mensagem</li>
                  </ul>
                </div>
                
                <div className="p-4 bg-muted rounded-lg">
                  <h4 className="font-semibold mb-2">🔤 Variáveis Disponíveis</h4>
                  <div className="flex flex-wrap gap-2">
                    {variables.map(v => (
                      <Badge key={v.id} variant="outline">
                        {`{${v.variable_key}}`}
                      </Badge>
                    ))}
                  </div>
                </div>

                <div className="p-4 bg-muted rounded-lg">
                  <h4 className="font-semibold mb-2">🔑 Palavras-Chave Ativas</h4>
                  <div className="flex flex-wrap gap-2">
                    {keywords.filter(k => k.is_active).map(k => (
                      <Badge key={k.id} variant="secondary">
                        {k.keyword}
                      </Badge>
                    ))}
                    {keywords.filter(k => k.is_active).length === 0 && (
                      <span className="text-sm text-muted-foreground">Nenhuma palavra-chave configurada</span>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Editor Tab */}
        <TabsContent value="editor">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Estrutura do Menu</CardTitle>
                  <CardDescription>Organize os menus e submenus do chatbot</CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={copyAdminMenu}>
                    <Download className="h-4 w-4 mr-2" />
                    Copiar Menu do ADM
                  </Button>
                  <Button onClick={() => openAddNode()}>
                    <Plus className="h-4 w-4 mr-2" />
                    Novo Menu
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {menuNodes.length === 0 ? (
                <div className="text-center py-12">
                  <Bot className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
                  <h3 className="text-lg font-semibold mb-2">Nenhum menu configurado</h3>
                  <p className="text-muted-foreground mb-4">
                    Crie seu primeiro menu ou copie a estrutura do ADM
                  </p>
                  <div className="flex gap-2 justify-center">
                    <Button variant="outline" onClick={copyAdminMenu}>
                      <Download className="h-4 w-4 mr-2" />
                      Copiar do ADM
                    </Button>
                    <Button onClick={() => openAddNode()}>
                      <Plus className="h-4 w-4 mr-2" />
                      Criar Menu Inicial
                    </Button>
                  </div>
                </div>
              ) : (
                renderMenuTree()
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Keywords Tab */}
        <TabsContent value="keywords">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Palavras-Chave</CardTitle>
                  <CardDescription>Respostas automáticas para palavras específicas</CardDescription>
                </div>
                <Button onClick={() => openKeywordDialog()}>
                  <Plus className="h-4 w-4 mr-2" />
                  Nova Palavra-Chave
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {keywords.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  Nenhuma palavra-chave configurada
                </div>
              ) : (
                <div className="space-y-2">
                  {keywords.map(keyword => (
                    <div key={keyword.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                      <div className="flex items-center gap-3">
                        <Badge variant={keyword.is_active ? 'default' : 'secondary'}>
                          {keyword.keyword}
                        </Badge>
                        <span className="text-sm text-muted-foreground line-clamp-1">
                          {keyword.response_text.substring(0, 50)}...
                        </span>
                      </div>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" onClick={() => openKeywordDialog(keyword)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="text-destructive" onClick={() => {
                          setDeletingItem({ type: 'keyword', id: keyword.id });
                          setShowDeleteDialog(true);
                        }}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Variables Tab */}
        <TabsContent value="variables">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Variáveis Personalizadas</CardTitle>
                  <CardDescription>
                    Use {'{variavel}'} nas mensagens para substituir automaticamente
                  </CardDescription>
                </div>
                <Button onClick={() => openVariableDialog()}>
                  <Plus className="h-4 w-4 mr-2" />
                  Nova Variável
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {variables.map(variable => (
                  <div key={variable.id} className="flex items-center gap-4 p-3 rounded-lg bg-muted/50">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <code className="bg-primary/10 text-primary px-2 py-0.5 rounded text-sm">
                          {`{${variable.variable_key}}`}
                        </code>
                        {variable.is_system && (
                          <Badge variant="outline" className="text-xs">Sistema</Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">{variable.description}</p>
                    </div>
                    <div className="flex-1">
                      <Input
                        value={variable.variable_value}
                        onChange={(e) => saveVariable(variable.variable_key, e.target.value)}
                        placeholder="Valor da variável"
                      />
                    </div>
                    {!variable.is_system && (
                      <Button variant="ghost" size="icon" className="text-destructive" onClick={() => {
                        setDeletingItem({ type: 'variable', id: variable.id });
                        setShowDeleteDialog(true);
                      }}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Settings Tab */}
        <TabsContent value="settings">
          <Card>
            <CardHeader>
              <CardTitle>Configurações do Menu</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Frequência de Resposta</Label>
                  <Select
                    value={settings?.response_mode || '12h'}
                    onValueChange={(value) => saveSettings({ response_mode: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(RESPONSE_MODES).map(([key, { label, description }]) => (
                        <SelectItem key={key} value={key}>
                          <div>
                            <div>{label}</div>
                            <div className="text-xs text-muted-foreground">{description}</div>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Aplica-se apenas à primeira mensagem do fluxo
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>Delay de Resposta (segundos)</Label>
                  <div className="flex gap-2">
                    <Input
                      type="number"
                      min="1"
                      max="30"
                      value={settings?.delay_min || 2}
                      onChange={(e) => saveSettings({ delay_min: parseInt(e.target.value) })}
                      placeholder="Mín"
                    />
                    <Input
                      type="number"
                      min="1"
                      max="30"
                      value={settings?.delay_max || 5}
                      onChange={(e) => saveSettings({ delay_max: parseInt(e.target.value) })}
                      placeholder="Máx"
                    />
                  </div>
                </div>
              </div>

              <Separator />

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Simular Digitação</Label>
                    <p className="text-xs text-muted-foreground">Mostra "digitando..." antes de responder</p>
                  </div>
                  <Switch
                    checked={settings?.typing_enabled ?? true}
                    onCheckedChange={(checked) => saveSettings({ typing_enabled: checked })}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label>Modo Silencioso</Label>
                    <p className="text-xs text-muted-foreground">Não responde quando opção é inválida</p>
                  </div>
                  <Switch
                    checked={settings?.silent_mode ?? true}
                    onCheckedChange={(checked) => saveSettings({ silent_mode: checked })}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Node Dialog */}
      <Dialog open={showNodeDialog} onOpenChange={setShowNodeDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingNode ? 'Editar Menu' : 'Novo Menu'}</DialogTitle>
            <DialogDescription>Configure o menu e suas opções</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Chave Única *</Label>
                <Input
                  value={nodeForm.node_key}
                  onChange={(e) => setNodeForm({ ...nodeForm, node_key: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_') })}
                  placeholder="ex: inicial, planos, suporte"
                  disabled={!!editingNode}
                />
              </div>
              <div className="space-y-2">
                <Label>Título *</Label>
                <Input
                  value={nodeForm.title}
                  onChange={(e) => setNodeForm({ ...nodeForm, title: e.target.value })}
                  placeholder="Nome do menu"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Ícone</Label>
                <Select value={nodeForm.icon} onValueChange={(v) => setNodeForm({ ...nodeForm, icon: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ICON_OPTIONS.map(icon => (
                      <SelectItem key={icon} value={icon}>{icon}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Tipo de Resposta</Label>
                <Select 
                  value={nodeForm.response_type} 
                  onValueChange={(v) => setNodeForm({ ...nodeForm, response_type: v as 'menu' | 'text' })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="menu">Menu com Opções</SelectItem>
                    <SelectItem value="text">Apenas Texto</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Mensagem *</Label>
              <Textarea
                value={nodeForm.content}
                onChange={(e) => setNodeForm({ ...nodeForm, content: e.target.value })}
                placeholder="Mensagem que será enviada. Use {empresa}, {pix}, etc."
                rows={5}
              />
              <p className="text-xs text-muted-foreground">
                Variáveis disponíveis: {variables.map(v => `{${v.variable_key}}`).join(', ')}
              </p>
            </div>

            <div className="space-y-2">
              <Label>URL da Imagem (opcional)</Label>
              <Input
                value={nodeForm.image_url}
                onChange={(e) => setNodeForm({ ...nodeForm, image_url: e.target.value })}
                placeholder="https://..."
              />
            </div>

            {nodeForm.response_type === 'menu' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Opções do Menu</Label>
                  <Button type="button" variant="outline" size="sm" onClick={addOption}>
                    <Plus className="h-4 w-4 mr-1" />
                    Adicionar
                  </Button>
                </div>
                
                {nodeForm.options.map((option, index) => (
                  <div key={index} className="flex gap-2 items-center">
                    <Input
                      value={option.key}
                      onChange={(e) => updateOption(index, 'key', e.target.value)}
                      placeholder="Tecla"
                      className="w-16"
                    />
                    <Input
                      value={option.label}
                      onChange={(e) => updateOption(index, 'label', e.target.value)}
                      placeholder="Descrição da opção"
                      className="flex-1"
                    />
                    <Select
                      value={option.target}
                      onValueChange={(v) => updateOption(index, 'target', v)}
                    >
                      <SelectTrigger className="w-40">
                        <SelectValue placeholder="Destino" />
                      </SelectTrigger>
                      <SelectContent>
                        {menuNodes.filter(n => n.node_key !== nodeForm.node_key).map(n => (
                          <SelectItem key={n.node_key} value={n.node_key}>
                            {n.icon} {n.title}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button type="button" variant="ghost" size="icon" onClick={() => removeOption(index)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            <div className="flex items-center gap-2">
              <Switch
                checked={nodeForm.is_active}
                onCheckedChange={(checked) => setNodeForm({ ...nodeForm, is_active: checked })}
              />
              <Label>Menu ativo</Label>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNodeDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSaveNode}>
              {editingNode ? 'Salvar' : 'Criar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Keyword Dialog */}
      <Dialog open={showKeywordDialog} onOpenChange={setShowKeywordDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingKeyword ? 'Editar Palavra-Chave' : 'Nova Palavra-Chave'}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Palavra-Chave *</Label>
              <Input
                value={keywordForm.keyword}
                onChange={(e) => setKeywordForm({ ...keywordForm, keyword: e.target.value })}
                placeholder="ex: preco, valor, planos"
              />
            </div>

            <div className="space-y-2">
              <Label>Resposta *</Label>
              <Textarea
                value={keywordForm.response_text}
                onChange={(e) => setKeywordForm({ ...keywordForm, response_text: e.target.value })}
                placeholder="Mensagem de resposta"
                rows={4}
              />
            </div>

            <div className="space-y-2">
              <Label>URL da Imagem (opcional)</Label>
              <Input
                value={keywordForm.image_url}
                onChange={(e) => setKeywordForm({ ...keywordForm, image_url: e.target.value })}
                placeholder="https://..."
              />
            </div>

            <div className="flex items-center gap-2">
              <Switch
                checked={keywordForm.is_active}
                onCheckedChange={(checked) => setKeywordForm({ ...keywordForm, is_active: checked })}
              />
              <Label>Ativa</Label>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowKeywordDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSaveKeyword}>
              {editingKeyword ? 'Salvar' : 'Criar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Variable Dialog */}
      <Dialog open={showVariableDialog} onOpenChange={setShowVariableDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingVariable ? 'Editar Variável' : 'Nova Variável'}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nome da Variável *</Label>
              <Input
                value={variableForm.variable_key}
                onChange={(e) => setVariableForm({ ...variableForm, variable_key: e.target.value })}
                placeholder="ex: promocao, desconto"
                disabled={!!editingVariable}
              />
              <p className="text-xs text-muted-foreground">
                Será usada como {`{${variableForm.variable_key || 'nome'}}`}
              </p>
            </div>

            <div className="space-y-2">
              <Label>Valor</Label>
              <Input
                value={variableForm.variable_value}
                onChange={(e) => setVariableForm({ ...variableForm, variable_value: e.target.value })}
                placeholder="Valor da variável"
              />
            </div>

            {!editingVariable && (
              <div className="space-y-2">
                <Label>Descrição</Label>
                <Input
                  value={variableForm.description}
                  onChange={(e) => setVariableForm({ ...variableForm, description: e.target.value })}
                  placeholder="Descrição do uso"
                />
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowVariableDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSaveVariable}>
              {editingVariable ? 'Salvar' : 'Criar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. Deseja continuar?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (deletingItem) {
                  if (deletingItem.type === 'node') {
                    handleDeleteNode(deletingItem.id);
                  } else if (deletingItem.type === 'keyword') {
                    deleteKeyword(deletingItem.id);
                  } else if (deletingItem.type === 'variable') {
                    deleteVariable(deletingItem.id);
                  }
                }
                setShowDeleteDialog(false);
              }}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
