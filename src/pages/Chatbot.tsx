import { useEffect, useState } from 'react';
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
import { Bot, Plus, Settings, MessageSquare, Users, History, Pencil, Trash2, Copy, Zap, Image, List, LayoutGrid, Loader2, AlertCircle, CheckCircle2, Folder, GitBranch, Menu, ArrowRight } from 'lucide-react';
import { useChatbotRules, ChatbotRule, ChatbotTemplate } from '@/hooks/useChatbotRules';
import { useChatbotCategories, ChatbotCategory } from '@/hooks/useChatbotCategories';
import { ChatbotCategories } from '@/components/ChatbotCategories';
import { ChatbotFlowManager } from '@/components/ChatbotFlowManager';
import { useAuth } from '@/hooks/useAuth';
import { Navigate, Link } from 'react-router-dom';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const COOLDOWN_MODES = {
  polite: { label: 'Educado (*)', description: '1 resposta a cada 24h', asterisks: '*' },
  moderate: { label: 'Moderado (**)', description: 'Intervalo configurável', asterisks: '**' },
  free: { label: 'Livre (***)', description: 'Sempre responde (sem botões/lista)', asterisks: '***' },
};

const CONTACT_FILTERS = {
  ALL: { label: 'Todos', icon: Users },
  NEW: { label: 'Novos', icon: Zap },
  KNOWN: { label: 'Conhecidos', icon: MessageSquare },
  CLIENT: { label: 'Clientes', icon: CheckCircle2 },
};

const RESPONSE_TYPES = {
  text: { label: 'Texto', icon: MessageSquare },
  text_image: { label: 'Texto + Imagem', icon: Image },
  text_buttons: { label: 'Texto + Botões', icon: LayoutGrid },
  text_list: { label: 'Texto + Lista', icon: List },
};

export default function Chatbot() {
  const { isAdmin, user } = useAuth();

  // Admin não usa este chatbot (revendedor). Redireciona para o Chatbot Interativo do Painel ADM.
  if (isAdmin) {
    return <Navigate to="/admin/chatbot" replace />;
  }

  const {
    rules,
    templates,
    settings,
    contacts,
    interactions,
    isLoading,
    createRule,
    updateRule,
    deleteRule,
    saveSettings,
    createTemplate,
    updateTemplate,
    deleteTemplate,
    createRuleFromTemplate,
  } = useChatbotRules();

  const [activeTab, setActiveTab] = useState('rules');
  const [showRuleDialog, setShowRuleDialog] = useState(false);
  const [showTemplateDialog, setShowTemplateDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [editingRule, setEditingRule] = useState<ChatbotRule | null>(null);
  const [editingTemplate, setEditingTemplate] = useState<ChatbotTemplate | null>(null);
  const [deletingItem, setDeletingItem] = useState<{ type: 'rule' | 'template'; id: string } | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [templateCategoryFilter, setTemplateCategoryFilter] = useState<string>('all');
  const [templateFormCategory, setTemplateFormCategory] = useState<string>('');

  // Categories hook
  const { categories } = useChatbotCategories();

  // Filter templates based on category
  const filteredTemplates = templates.filter(template => {
    if (templateCategoryFilter === 'all') return true;
    if (templateCategoryFilter === 'admin') return template.seller_id === null;
    if (templateCategoryFilter === 'mine') return template.seller_id === user?.id;
    return template.category === templateCategoryFilter;
  });

  // Form state
  const [formData, setFormData] = useState<Partial<ChatbotRule>>({
    name: '',
    trigger_text: '',
    response_type: 'text',
    response_content: { text: '' },
    contact_filter: 'ALL',
    cooldown_mode: 'polite',
    cooldown_hours: 24,
    is_active: true,
    is_global_trigger: false,
    priority: 0,
  });

  // Settings form
  const [settingsForm, setSettingsForm] = useState({
    is_enabled: false,
    response_delay_min: 2,
    response_delay_max: 5,
    ignore_groups: true,
    ignore_own_messages: true,
    typing_enabled: true,
    typing_duration_min: 2,
    typing_duration_max: 5,
  });

  // Sincroniza o formulário com o que vem do backend (persistência após recarregar)
  useEffect(() => {
    if (!settings) return;
    setSettingsForm(prev => ({
      ...prev,
      is_enabled: settings.is_enabled ?? false,
      response_delay_min: settings.response_delay_min ?? 2,
      response_delay_max: settings.response_delay_max ?? 5,
      ignore_groups: settings.ignore_groups ?? true,
      ignore_own_messages: settings.ignore_own_messages ?? true,
      typing_enabled: settings.typing_enabled ?? true,
      typing_duration_min: settings.typing_duration_min ?? 2,
      typing_duration_max: settings.typing_duration_max ?? 5,
    }));
  }, [settings]);

  const resetForm = () => {
    setFormData({
      name: '',
      trigger_text: '',
      response_type: 'text',
      response_content: { text: '' },
      contact_filter: 'ALL',
      cooldown_mode: 'polite',
      cooldown_hours: 24,
      is_active: true,
      is_global_trigger: false,
      priority: 0,
    });
    setEditingRule(null);
    setEditingTemplate(null);
  };

  const openEditRule = (rule: ChatbotRule) => {
    setEditingRule(rule);
    setFormData({
      name: rule.name,
      trigger_text: rule.trigger_text,
      response_type: rule.response_type,
      response_content: rule.response_content,
      contact_filter: rule.contact_filter,
      cooldown_mode: rule.cooldown_mode,
      cooldown_hours: rule.cooldown_hours,
      is_active: rule.is_active,
      is_global_trigger: rule.is_global_trigger,
      priority: rule.priority,
    });
    setShowRuleDialog(true);
  };

  const openEditTemplate = (template: ChatbotTemplate) => {
    setEditingTemplate(template);
    setFormData({
      name: template.name,
      trigger_text: template.trigger_text,
      response_type: template.response_type,
      response_content: template.response_content,
      contact_filter: template.contact_filter,
      cooldown_mode: template.cooldown_mode,
      cooldown_hours: template.cooldown_hours,
      is_active: template.is_active,
      is_global_trigger: template.trigger_text.startsWith('*'),
      priority: 0,
    });
    setShowTemplateDialog(true);
  };

  const handleSaveRule = async () => {
    if (!formData.name || !formData.trigger_text || !formData.response_content?.text) {
      toast.error('Preencha todos os campos obrigatórios');
      return;
    }

    setIsSaving(true);
    try {
      // Auto-detect global trigger
      const isGlobal = formData.trigger_text === '*' || formData.trigger_text === '**' || formData.trigger_text === '***';
      
      if (editingRule) {
        await updateRule(editingRule.id, { ...formData, is_global_trigger: isGlobal } as Partial<ChatbotRule>);
      } else {
        await createRule({ ...formData, is_global_trigger: isGlobal } as Omit<ChatbotRule, 'id' | 'seller_id' | 'created_at' | 'updated_at'>);
      }
      setShowRuleDialog(false);
      resetForm();
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveTemplate = async () => {
    if (!formData.name || !formData.trigger_text || !formData.response_content?.text) {
      toast.error('Preencha todos os campos obrigatórios');
      return;
    }

    setIsSaving(true);
    try {
      if (editingTemplate) {
        await updateTemplate(editingTemplate.id, formData as Partial<ChatbotTemplate>);
      } else {
        await createTemplate(formData as Omit<ChatbotTemplate, 'id' | 'created_by' | 'created_at'>);
      }
      setShowTemplateDialog(false);
      resetForm();
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveTemplateWithCategory = async () => {
    if (!formData.name || !formData.trigger_text || !formData.response_content?.text) {
      toast.error('Preencha todos os campos obrigatórios');
      return;
    }

    setIsSaving(true);
    try {
      const templateData = {
        ...formData,
        category: templateFormCategory === '__none__' ? undefined : (templateFormCategory || undefined),
      };
      
      if (editingTemplate) {
        await updateTemplate(editingTemplate.id, templateData as Partial<ChatbotTemplate>);
      } else {
        await createTemplate(templateData as Omit<ChatbotTemplate, 'id' | 'created_by' | 'created_at'>);
      }
      setShowTemplateDialog(false);
      setTemplateFormCategory('');
      resetForm();
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingItem) return;
    
    if (deletingItem.type === 'rule') {
      await deleteRule(deletingItem.id);
    } else {
      await deleteTemplate(deletingItem.id);
    }
    
    setShowDeleteDialog(false);
    setDeletingItem(null);
  };

  const handleUseTemplate = async (template: ChatbotTemplate) => {
    setIsSaving(true);
    try {
      await createRuleFromTemplate(template.id);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveSettings = async () => {
    setIsSaving(true);
    try {
      await saveSettings(settingsForm);
    } finally {
      setIsSaving(false);
    }
  };


  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Banner para Menu Interativo */}
      <Card className="bg-gradient-to-r from-primary/10 to-primary/5 border-primary/20">
        <CardContent className="py-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/20 rounded-lg">
                <Menu className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold">Menu Interativo</h3>
                <p className="text-sm text-muted-foreground">
                  Configure menus com navegação por números, variáveis dinâmicas e simulador
                </p>
              </div>
            </div>
            <Button asChild>
              <Link to="/seller-chatbot-menu">
                Acessar Menu Interativo
                <ArrowRight className="h-4 w-4 ml-2" />
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Bot className="h-6 w-6" />
            Chatbot Automático
          </h1>
          <p className="text-muted-foreground">
            Configure respostas automáticas para WhatsApp
          </p>
        </div>
        
        <div className="flex items-center gap-2">
          <Switch
            checked={settingsForm.is_enabled}
            onCheckedChange={(checked) => {
              setSettingsForm(prev => ({ ...prev, is_enabled: checked }));
              saveSettings({ is_enabled: checked });
            }}
          />
          <Label>{settingsForm.is_enabled ? 'Ativo' : 'Inativo'}</Label>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-primary" />
              <span className="text-sm text-muted-foreground">Regras Ativas</span>
            </div>
            <p className="text-2xl font-bold">{rules.filter(r => r.is_active).length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" />
              <span className="text-sm text-muted-foreground">Contatos</span>
            </div>
            <p className="text-2xl font-bold">{contacts.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <History className="h-4 w-4 text-primary" />
              <span className="text-sm text-muted-foreground">Interações (24h)</span>
            </div>
            <p className="text-2xl font-bold">
              {interactions.filter(i => {
                const date = new Date(i.sent_at);
                const now = new Date();
                return (now.getTime() - date.getTime()) < 24 * 60 * 60 * 1000;
              }).length}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-primary" />
              <span className="text-sm text-muted-foreground">Respostas Enviadas</span>
            </div>
            <p className="text-2xl font-bold">
              {interactions.filter(i => !i.was_blocked).length}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-6 lg:w-auto lg:inline-flex">
          <TabsTrigger value="rules" className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4" />
            <span className="hidden sm:inline">Regras</span>
          </TabsTrigger>
          <TabsTrigger value="templates" className="flex items-center gap-2">
            <Copy className="h-4 w-4" />
            <span className="hidden sm:inline">Templates</span>
          </TabsTrigger>
          <TabsTrigger value="categories" className="flex items-center gap-2">
            <Folder className="h-4 w-4" />
            <span className="hidden sm:inline">Categorias</span>
          </TabsTrigger>
          <TabsTrigger value="flows" className="flex items-center gap-2">
            <GitBranch className="h-4 w-4" />
            <span className="hidden sm:inline">Fluxos</span>
          </TabsTrigger>
          <TabsTrigger value="contacts" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            <span className="hidden sm:inline">Contatos</span>
          </TabsTrigger>
          <TabsTrigger value="settings" className="flex items-center gap-2">
            <Settings className="h-4 w-4" />
            <span className="hidden sm:inline">Config</span>
          </TabsTrigger>
        </TabsList>

        {/* Rules Tab */}
        <TabsContent value="rules" className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-semibold">Minhas Regras</h2>
            <Button onClick={() => { resetForm(); setShowRuleDialog(true); }}>
              <Plus className="h-4 w-4 mr-2" />
              Nova Regra
            </Button>
          </div>

          {rules.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Bot className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium mb-2">Nenhuma regra configurada</h3>
                <p className="text-muted-foreground text-center mb-4">
                  Crie sua primeira regra ou use um template para começar
                </p>
                <div className="flex gap-2">
                  <Button onClick={() => { resetForm(); setShowRuleDialog(true); }}>
                    <Plus className="h-4 w-4 mr-2" />
                    Criar Regra
                  </Button>
                  <Button variant="outline" onClick={() => setActiveTab('templates')}>
                    <Copy className="h-4 w-4 mr-2" />
                    Ver Templates
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4">
              {rules.map((rule) => (
                <Card key={rule.id} className={!rule.is_active ? 'opacity-60' : ''}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-medium">{rule.name}</h3>
                          <Badge variant="outline">
                            {COOLDOWN_MODES[rule.cooldown_mode]?.asterisks}
                          </Badge>
                          <Badge variant="outline" className="flex items-center gap-1">
                            {(() => {
                              const Icon = CONTACT_FILTERS[rule.contact_filter]?.icon || Users;
                              return <Icon className="h-3 w-3" />;
                            })()}
                            {CONTACT_FILTERS[rule.contact_filter]?.label}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">
                          Gatilho: <code className="bg-muted px-1 rounded">{rule.trigger_text}</code>
                        </p>
                        <p className="text-sm text-muted-foreground line-clamp-2 mt-1">
                          {rule.response_content.text}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={rule.is_active}
                            onCheckedChange={async (checked) => {
                              await updateRule(rule.id, { is_active: checked });
                            }}
                          />
                          <span className={`text-xs font-medium ${rule.is_active ? 'text-green-600' : 'text-muted-foreground'}`}>
                            {rule.is_active ? 'Ativo' : 'Inativo'}
                          </span>
                        </div>
                        <Button variant="ghost" size="icon" onClick={() => openEditRule(rule)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => { setDeletingItem({ type: 'rule', id: rule.id }); setShowDeleteDialog(true); }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Templates Tab */}
        <TabsContent value="templates" className="space-y-4">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <h2 className="text-lg font-semibold">Templates Disponíveis</h2>
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <Select 
                value={templateCategoryFilter} 
                onValueChange={setTemplateCategoryFilter}
              >
                <SelectTrigger className="w-full sm:w-[180px]">
                  <SelectValue placeholder="Filtrar categoria" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as categorias</SelectItem>
                  <SelectItem value="admin">Templates do Admin</SelectItem>
                  <SelectItem value="mine">Meus Templates</SelectItem>
                  {categories.filter(c => c.is_active).map((cat) => (
                    <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button onClick={() => { resetForm(); setShowTemplateDialog(true); }}>
                <Plus className="h-4 w-4 mr-2" />
                Novo Template
              </Button>
            </div>
          </div>

          {filteredTemplates.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Copy className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium mb-2">Nenhum template disponível</h3>
                <p className="text-muted-foreground text-center">
                  {templateCategoryFilter !== 'all' ? 'Nenhum template nesta categoria' : 'Crie seu primeiro template ou aguarde o administrador'}
                </p>
                <Button className="mt-4" onClick={() => { resetForm(); setShowTemplateDialog(true); }}>
                  <Plus className="h-4 w-4 mr-2" />
                  Criar Template
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {filteredTemplates.map((template) => {
                const isOwn = template.seller_id === user?.id;
                const isAdminTemplate = template.seller_id === null;
                const canManage = isOwn || (isAdmin && isAdminTemplate);
                const categoryName = categories.find(c => c.id === template.category)?.name;
                
                return (
                  <Card key={template.id} className={!template.is_active ? 'opacity-60' : ''}>
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <CardTitle className="text-base">{template.name}</CardTitle>
                            {isAdminTemplate && (
                              <Badge variant="secondary" className="text-xs">Admin</Badge>
                            )}
                          </div>
                          {template.description && (
                            <CardDescription>{template.description}</CardDescription>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          {canManage && (
                            <div className="flex items-center gap-2 mr-2">
                              <Switch
                                checked={template.is_active}
                                onCheckedChange={async (checked) => {
                                  await updateTemplate(template.id, { is_active: checked });
                                }}
                              />
                              <span className={`text-xs font-medium ${template.is_active ? 'text-green-600' : 'text-muted-foreground'}`}>
                                {template.is_active ? 'Ativo' : 'Inativo'}
                              </span>
                            </div>
                          )}
                          {canManage && (
                            <>
                              <Button variant="ghost" size="icon" onClick={() => openEditTemplate(template)}>
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => { setDeletingItem({ type: 'template', id: template.id }); setShowDeleteDialog(true); }}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant="outline">{COOLDOWN_MODES[template.cooldown_mode]?.asterisks}</Badge>
                          <Badge variant="outline">{RESPONSE_TYPES[template.response_type]?.label}</Badge>
                          {categoryName && (
                            <Badge variant="secondary">{categoryName}</Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground line-clamp-2">
                          {template.response_content.text}
                        </p>
                        <Button
                          variant="secondary"
                          size="sm"
                          className="w-full mt-2"
                          onClick={() => handleUseTemplate(template)}
                          disabled={isSaving || !template.is_active}
                        >
                          {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
                          Usar Template
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* Contacts Tab */}
        <TabsContent value="contacts" className="space-y-4">
          <h2 className="text-lg font-semibold">Contatos Recentes</h2>
          
          {contacts.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Users className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium mb-2">Nenhum contato ainda</h3>
                <p className="text-muted-foreground text-center">
                  Os contatos aparecerão aqui quando interagirem com o chatbot
                </p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <ScrollArea className="h-[400px]">
                <div className="divide-y">
                  {contacts.map((contact) => (
                    <div key={contact.id} className="p-4 flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-medium">{contact.name || contact.phone}</p>
                          <Badge variant="outline" className="text-xs">
                            {CONTACT_FILTERS[contact.contact_status]?.label}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">{contact.phone}</p>
                      </div>
                      <div className="text-right text-sm text-muted-foreground">
                        <p>{contact.interaction_count} interações</p>
                        <p>
                          {format(new Date(contact.last_interaction_at), "dd/MM HH:mm", { locale: ptBR })}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </Card>
          )}
        </TabsContent>

        {/* Settings Tab */}
        <TabsContent value="settings" className="space-y-4">
          <h2 className="text-lg font-semibold">Configurações do Chatbot</h2>
          
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Configurações Gerais</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label>Chatbot Ativo</Label>
                  <p className="text-sm text-muted-foreground">Ativar respostas automáticas</p>
                </div>
                <Switch
                  checked={settingsForm.is_enabled}
                  onCheckedChange={(checked) => setSettingsForm(prev => ({ ...prev, is_enabled: checked }))}
                />
              </div>
              
              <Separator />
              
              <div className="flex items-center justify-between">
                <div>
                  <Label>Ignorar Grupos</Label>
                  <p className="text-sm text-muted-foreground">Não responder mensagens de grupos</p>
                </div>
                <Switch
                  checked={settingsForm.ignore_groups}
                  onCheckedChange={(checked) => setSettingsForm(prev => ({ ...prev, ignore_groups: checked }))}
                />
              </div>
              
              <div className="flex items-center justify-between">
                <div>
                  <Label>Ignorar Próprias Mensagens</Label>
                  <p className="text-sm text-muted-foreground">Não processar mensagens enviadas por você</p>
                </div>
                <Switch
                  checked={settingsForm.ignore_own_messages}
                  onCheckedChange={(checked) => setSettingsForm(prev => ({ ...prev, ignore_own_messages: checked }))}
                />
              </div>
              
              <Separator />

              {/* Typing Status Section */}
              <div className="flex items-center justify-between">
                <div>
                  <Label className="flex items-center gap-2">
                    ✍️ Simular "Digitando..."
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Mostra status "digitando" antes de enviar a mensagem (mais humano)
                  </p>
                </div>
                <Switch
                  checked={settingsForm.typing_enabled}
                  onCheckedChange={(checked) => setSettingsForm(prev => ({ ...prev, typing_enabled: checked }))}
                />
              </div>

              {settingsForm.typing_enabled && (
                <div className="grid grid-cols-2 gap-4 pl-4 border-l-2 border-primary/20">
                  <div>
                    <Label>Tempo Mínimo (segundos)</Label>
                    <Input
                      type="number"
                      min={1}
                      max={10}
                      value={settingsForm.typing_duration_min}
                      onChange={(e) => setSettingsForm(prev => ({ ...prev, typing_duration_min: parseInt(e.target.value) || 2 }))}
                    />
                    <p className="text-xs text-muted-foreground mt-1">Mínimo de digitação</p>
                  </div>
                  <div>
                    <Label>Tempo Máximo (segundos)</Label>
                    <Input
                      type="number"
                      min={1}
                      max={15}
                      value={settingsForm.typing_duration_max}
                      onChange={(e) => setSettingsForm(prev => ({ ...prev, typing_duration_max: parseInt(e.target.value) || 5 }))}
                    />
                    <p className="text-xs text-muted-foreground mt-1">Máximo de digitação</p>
                  </div>
                </div>
              )}

              <Separator />

              <div className="space-y-2">
                <Label>Delay de Resposta (quando "Digitando" está desativado)</Label>
                <p className="text-sm text-muted-foreground">
                  Tempo de espera antes de enviar a resposta
                </p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-xs">Mínimo (segundos)</Label>
                    <Input
                      type="number"
                      min={1}
                      max={30}
                      value={settingsForm.response_delay_min}
                      onChange={(e) => setSettingsForm(prev => ({ ...prev, response_delay_min: parseInt(e.target.value) || 2 }))}
                      disabled={settingsForm.typing_enabled}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Máximo (segundos)</Label>
                    <Input
                      type="number"
                      min={1}
                      max={60}
                      value={settingsForm.response_delay_max}
                      onChange={(e) => setSettingsForm(prev => ({ ...prev, response_delay_max: parseInt(e.target.value) || 5 }))}
                      disabled={settingsForm.typing_enabled}
                    />
                  </div>
                </div>
              </div>
              
              <Button onClick={handleSaveSettings} disabled={isSaving}>
                {isSaving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                Salvar Configurações
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Rule Dialog */}
      <Dialog open={showRuleDialog} onOpenChange={setShowRuleDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingRule ? 'Editar Regra' : 'Nova Regra'}</DialogTitle>
            <DialogDescription>
              Configure quando e como o chatbot deve responder
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label>Nome da Regra *</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                placeholder="Ex: Boas-vindas"
              />
            </div>

            <div>
              <Label>Gatilho *</Label>
              <Input
                value={formData.trigger_text}
                onChange={(e) => setFormData(prev => ({ ...prev, trigger_text: e.target.value }))}
                placeholder="Ex: oi, olá, * (captura global)"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Use * para captura global, ** para moderado, *** para livre
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Modo de Resposta</Label>
                <Select
                  value={formData.cooldown_mode}
                  onValueChange={(value) => setFormData(prev => ({ ...prev, cooldown_mode: value as ChatbotRule['cooldown_mode'] }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(COOLDOWN_MODES).map(([key, { label, description }]) => (
                      <SelectItem key={key} value={key}>
                        <div>
                          <p>{label}</p>
                          <p className="text-xs text-muted-foreground">{description}</p>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Filtro de Contato</Label>
                <Select
                  value={formData.contact_filter}
                  onValueChange={(value) => setFormData(prev => ({ ...prev, contact_filter: value as ChatbotRule['contact_filter'] }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(CONTACT_FILTERS).map(([key, { label }]) => (
                      <SelectItem key={key} value={key}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {formData.cooldown_mode === 'moderate' && (
              <div>
                <Label>Intervalo (horas)</Label>
                <Input
                  type="number"
                  min={1}
                  max={168}
                  value={formData.cooldown_hours}
                  onChange={(e) => setFormData(prev => ({ ...prev, cooldown_hours: parseInt(e.target.value) || 24 }))}
                />
              </div>
            )}

            <div>
              <Label>Tipo de Resposta</Label>
              <Select
                value={formData.response_type}
                onValueChange={(value) => setFormData(prev => ({ ...prev, response_type: value as ChatbotRule['response_type'] }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(RESPONSE_TYPES).map(([key, { label }]) => (
                    <SelectItem key={key} value={key} disabled={formData.cooldown_mode === 'free' && (key === 'text_buttons' || key === 'text_list')}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {formData.cooldown_mode === 'free' && (
                <p className="text-xs text-amber-600 mt-1 flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" />
                  Modo livre não permite botões ou lista
                </p>
              )}
            </div>

            <div>
              <Label>Mensagem de Texto *</Label>
              <Textarea
                value={formData.response_content?.text || ''}
                onChange={(e) => setFormData(prev => ({
                  ...prev,
                  response_content: { ...prev.response_content, text: e.target.value }
                }))}
                placeholder="Digite a mensagem de resposta..."
                rows={4}
              />
            </div>

            {formData.response_type === 'text_image' && (
              <div>
                <Label>🖼️ Link da Imagem</Label>
                <Input
                  value={formData.response_content?.image_url || ''}
                  onChange={(e) => setFormData(prev => ({
                    ...prev,
                    response_content: { ...prev.response_content, image_url: e.target.value }
                  }))}
                  placeholder="https://exemplo.com/imagem.jpg"
                />
                <p className="text-xs text-muted-foreground mt-1">Cole o link direto da imagem (JPG, PNG, GIF) que deseja exibir junto à mensagem</p>
              </div>
            )}

            {formData.response_type === 'text_buttons' && (
              <div className="space-y-2">
                <Label>Botões (máx. 3)</Label>
                {[0, 1, 2].map((index) => {
                  const button = formData.response_content?.buttons?.[index];
                  return (
                    <div key={index} className="grid grid-cols-2 gap-2">
                      <Input
                        placeholder={`Texto do botão ${index + 1}`}
                        value={button?.text || ''}
                        onChange={(e) => {
                          const buttons = [...(formData.response_content?.buttons || [])];
                          buttons[index] = { ...buttons[index], id: `btn_${index}`, text: e.target.value, trigger: buttons[index]?.trigger || '' };
                          setFormData(prev => ({
                            ...prev,
                            response_content: { ...prev.response_content, buttons }
                          }));
                        }}
                      />
                      <Input
                        placeholder="Gatilho de retorno"
                        value={button?.trigger || ''}
                        onChange={(e) => {
                          const buttons = [...(formData.response_content?.buttons || [])];
                          buttons[index] = { ...buttons[index], id: `btn_${index}`, trigger: e.target.value, text: buttons[index]?.text || '' };
                          setFormData(prev => ({
                            ...prev,
                            response_content: { ...prev.response_content, buttons }
                          }));
                        }}
                      />
                    </div>
                  );
                })}
              </div>
            )}

            <div className="flex items-center gap-2">
              <Switch
                checked={formData.is_active}
                onCheckedChange={(checked) => setFormData(prev => ({ ...prev, is_active: checked }))}
              />
              <Label>Regra Ativa</Label>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRuleDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSaveRule} disabled={isSaving}>
              {isSaving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {editingRule ? 'Salvar' : 'Criar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Template Dialog */}
      <Dialog open={showTemplateDialog} onOpenChange={setShowTemplateDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingTemplate ? 'Editar Template' : 'Novo Template'}</DialogTitle>
            <DialogDescription>
              {isAdmin ? 'Templates globais ficam disponíveis para todos os revendedores' : 'Crie templates para usar no seu chatbot'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label>Nome do Template *</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                placeholder="Ex: Boas-vindas Padrão"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Gatilho Sugerido *</Label>
                <Input
                  value={formData.trigger_text}
                  onChange={(e) => setFormData(prev => ({ ...prev, trigger_text: e.target.value }))}
                  placeholder="Ex: oi, olá, *"
                />
              </div>

              <div>
                <Label>Categoria</Label>
                <Select
                  value={templateFormCategory}
                  onValueChange={setTemplateFormCategory}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Sem categoria</SelectItem>
                    {categories.filter(c => c.is_active).map((cat) => (
                      <SelectItem key={cat.id} value={cat.id}>{cat.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Modo de Resposta</Label>
                <Select
                  value={formData.cooldown_mode}
                  onValueChange={(value) => setFormData(prev => ({ ...prev, cooldown_mode: value as ChatbotRule['cooldown_mode'] }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(COOLDOWN_MODES).map(([key, { label }]) => (
                      <SelectItem key={key} value={key}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Tipo de Resposta</Label>
                <Select
                  value={formData.response_type}
                  onValueChange={(value) => setFormData(prev => ({ ...prev, response_type: value as ChatbotRule['response_type'] }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(RESPONSE_TYPES).map(([key, { label }]) => (
                      <SelectItem key={key} value={key}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label>Mensagem *</Label>
              <Textarea
                value={formData.response_content?.text || ''}
                onChange={(e) => setFormData(prev => ({
                  ...prev,
                  response_content: { ...prev.response_content, text: e.target.value }
                }))}
                placeholder="Digite a mensagem do template..."
                rows={4}
              />
            </div>

            <div className="flex items-center gap-2">
              <Switch
                checked={formData.is_active}
                onCheckedChange={(checked) => setFormData(prev => ({ ...prev, is_active: checked }))}
              />
              <Label>Template Ativo</Label>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowTemplateDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSaveTemplateWithCategory} disabled={isSaving}>
              {isSaving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {editingTemplate ? 'Salvar' : 'Criar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir {deletingItem?.type === 'rule' ? 'esta regra' : 'este template'}? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
