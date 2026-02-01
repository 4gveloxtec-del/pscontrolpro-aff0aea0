/**
 * Editor de Nós de Menu Interativo (v2 - SIMPLIFICADO)
 * Permite criar menus com submenus de forma visual e intuitiva
 * 
 * PRINCÍPIO: Tão simples que uma criança de 5 anos consegue usar
 */

import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import {
  Plus,
  Trash2,
  Edit2,
  ChevronRight,
  ArrowLeft,
  FolderPlus,
  MessageCircle,
  Terminal,
  UserCircle,
  XCircle,
  Copy,
  Home,
  FolderOpen,
  Zap,
} from 'lucide-react';
import type { BotMenuOption, MenuOptionActionType, BotNodeConfig } from '@/lib/botEngine/types';
import { cn } from '@/lib/utils';

interface MenuNodeEditorProps {
  config: BotNodeConfig;
  onConfigChange: (config: BotNodeConfig) => void;
  availableFlows?: { id: string; name: string }[];
  availableNodes?: { id: string; name: string }[];
}

// Gera ID único para opções
const generateOptionId = () => `opt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

// Mapeamento de tipos para exibição
const ACTION_DISPLAY: Record<MenuOptionActionType, { emoji: string; label: string; color: string }> = {
  submenu: { emoji: '📂', label: 'Submenu', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' },
  message: { emoji: '💬', label: 'Mensagem', color: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' },
  command: { emoji: '⚡', label: 'Comando', color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300' },
  transfer_human: { emoji: '👤', label: 'Atendente', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' },
  end_session: { emoji: '🏁', label: 'Encerrar', color: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' },
  goto_flow: { emoji: '↪️', label: 'Ir para Fluxo', color: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300' },
  goto_node: { emoji: '🎯', label: 'Ir para Nó', color: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300' },
};

// Card de opção simplificado
function SimpleOptionCard({
  option,
  index,
  onNavigateIn,
  onEdit,
  onDelete,
  onDuplicate,
}: {
  option: BotMenuOption;
  index: number;
  onNavigateIn?: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
}) {
  const display = ACTION_DISPLAY[option.action_type] || ACTION_DISPLAY.message;
  const hasChildren = option.action_type === 'submenu' && (option.submenu_options?.length || 0) > 0;
  
  return (
    <Card className={cn(
      "transition-all hover:shadow-md group cursor-pointer",
      option.action_type === 'submenu' && "border-blue-300 dark:border-blue-700"
    )}>
      <CardContent className="p-3">
        <div className="flex items-center gap-3">
          {/* Número da opção */}
          <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 text-primary font-bold text-sm shrink-0">
            {index + 1}
          </div>
          
          {/* Emoji e título */}
          <div 
            className="flex-1 min-w-0 flex items-center gap-2"
            onClick={() => option.action_type === 'submenu' && onNavigateIn?.()}
          >
            <span className="text-xl">{option.emoji || display.emoji}</span>
            <div className="min-w-0">
              <p className="font-medium truncate">{option.title}</p>
              {option.description && (
                <p className="text-xs text-muted-foreground truncate">{option.description}</p>
              )}
            </div>
          </div>
          
          {/* Badge do tipo */}
          <Badge variant="secondary" className={cn("shrink-0 text-xs", display.color)}>
            {display.emoji} {display.label}
            {hasChildren && ` (${option.submenu_options?.length})`}
          </Badge>
          
          {/* Seta para submenu */}
          {option.action_type === 'submenu' && (
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-8 w-8 shrink-0"
              onClick={onNavigateIn}
            >
              <ChevronRight className="h-5 w-5" />
            </Button>
          )}
          
          {/* Ações (visíveis no hover) */}
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onDuplicate} title="Duplicar">
              <Copy className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onEdit} title="Editar">
              <Edit2 className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={onDelete} title="Excluir">
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
        
        {/* Preview do conteúdo */}
        {option.action_type === 'command' && option.command && (
          <div className="mt-2 ml-11">
            <code className="text-xs bg-muted px-2 py-1 rounded">{option.command}</code>
          </div>
        )}
        {option.action_type === 'message' && option.message_text && (
          <div className="mt-2 ml-11 text-xs text-muted-foreground truncate">
            "{option.message_text.slice(0, 60)}..."
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function MenuNodeEditor({
  config,
  onConfigChange,
  availableFlows = [],
  availableNodes = [],
}: MenuNodeEditorProps) {
  // Navegação simplificada
  const [navigationPath, setNavigationPath] = useState<{ id: string; title: string }[]>([]);
  
  // Dialog de edição
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingOption, setEditingOption] = useState<BotMenuOption | null>(null);
  const [dialogType, setDialogType] = useState<'submenu' | 'message' | 'command' | 'other'>('message');
  
  // Form states
  const [formTitle, setFormTitle] = useState('');
  const [formEmoji, setFormEmoji] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formMessage, setFormMessage] = useState('');
  const [formCommand, setFormCommand] = useState('');
  const [formActionType, setFormActionType] = useState<MenuOptionActionType>('message');
  
  // Obter opções do nível atual
  const getCurrentOptions = useCallback((): BotMenuOption[] => {
    let options: BotMenuOption[] = Array.isArray(config.menu_options) ? config.menu_options : [];
    
    for (const nav of navigationPath) {
      const parent = options.find(o => o.id === nav.id);
      if (parent?.submenu_options) {
        options = parent.submenu_options;
      }
    }
    return options;
  }, [config.menu_options, navigationPath]);
  
  // Atualizar opções no nível atual
  const setCurrentOptions = useCallback((newOptions: BotMenuOption[]) => {
    if (navigationPath.length === 0) {
      onConfigChange({ ...config, menu_options: newOptions });
    } else {
      const updateNested = (options: BotMenuOption[], path: typeof navigationPath): BotMenuOption[] => {
        if (path.length === 0) return newOptions;
        
        return options.map(opt => {
          if (opt.id === path[0].id) {
            return {
              ...opt,
              submenu_options: updateNested(opt.submenu_options || [], path.slice(1)),
            };
          }
          return opt;
        });
      };
      
      onConfigChange({
        ...config,
        menu_options: updateNested(config.menu_options || [], navigationPath),
      });
    }
  }, [config, navigationPath, onConfigChange]);
  
  // Navegação
  const navigateToSubmenu = (option: BotMenuOption) => {
    if (option.action_type === 'submenu') {
      setNavigationPath([...navigationPath, { id: option.id, title: option.title }]);
    }
  };
  
  const navigateBack = () => setNavigationPath(navigationPath.slice(0, -1));
  const navigateToRoot = () => setNavigationPath([]);
  
  // Abrir dialog para criar opção
  const openCreateDialog = (type: 'submenu' | 'message' | 'command' | 'other') => {
    setEditingOption(null);
    setDialogType(type);
    setFormTitle('');
    setFormEmoji(type === 'submenu' ? '📂' : type === 'message' ? '💬' : type === 'command' ? '⚡' : '');
    setFormDescription('');
    setFormMessage('');
    setFormCommand('');
    setFormActionType(type === 'other' ? 'transfer_human' : type);
    setIsDialogOpen(true);
  };
  
  // Abrir dialog para editar opção
  const openEditDialog = (option: BotMenuOption) => {
    setEditingOption(option);
    setDialogType(option.action_type === 'submenu' ? 'submenu' : 
                   option.action_type === 'message' ? 'message' : 
                   option.action_type === 'command' ? 'command' : 'other');
    setFormTitle(option.title);
    setFormEmoji(option.emoji || '');
    setFormDescription(option.description || '');
    setFormMessage(option.message_text || '');
    setFormCommand(option.command || '');
    setFormActionType(option.action_type);
    setIsDialogOpen(true);
  };
  
  // Salvar opção
  const handleSave = () => {
    const currentOptions = getCurrentOptions();
    
    const actionType: MenuOptionActionType = dialogType === 'other' ? formActionType : dialogType;
    
    const newOption: BotMenuOption = {
      id: editingOption?.id || generateOptionId(),
      title: formTitle.trim(),
      emoji: formEmoji.trim() || undefined,
      description: formDescription.trim() || undefined,
      action_type: actionType,
      command: actionType === 'command' ? formCommand.trim() : undefined,
      message_text: actionType === 'message' ? formMessage.trim() : undefined,
      submenu_options: editingOption?.submenu_options || (actionType === 'submenu' ? [] : undefined),
    };
    
    if (editingOption) {
      setCurrentOptions(currentOptions.map(o => o.id === editingOption.id ? newOption : o));
    } else {
      setCurrentOptions([...currentOptions, newOption]);
      
      // Se criou submenu, navegar automaticamente para dentro
      if (actionType === 'submenu') {
        setTimeout(() => navigateToSubmenu(newOption), 100);
      }
    }
    
    setIsDialogOpen(false);
  };
  
  // Deletar opção
  const handleDelete = (optionId: string) => {
    setCurrentOptions(getCurrentOptions().filter(o => o.id !== optionId));
  };
  
  // Duplicar opção
  const handleDuplicate = (option: BotMenuOption) => {
    const duplicate: BotMenuOption = {
      ...option,
      id: generateOptionId(),
      title: `${option.title} (cópia)`,
      submenu_options: option.submenu_options ? JSON.parse(JSON.stringify(option.submenu_options)) : undefined,
    };
    setCurrentOptions([...getCurrentOptions(), duplicate]);
  };
  
  const currentOptions = getCurrentOptions();
  const isInSubmenu = navigationPath.length > 0;
  
  return (
    <div className="space-y-4">
      {/* Header simplificado */}
      <div className="grid gap-3 grid-cols-1 sm:grid-cols-2">
        <div className="space-y-2">
          <Label className="text-sm font-medium">📋 Título do Menu</Label>
          <Input
            placeholder="Menu Principal"
            value={config.menu_title || ''}
            onChange={(e) => onConfigChange({ ...config, menu_title: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label className="text-sm font-medium">📝 Cabeçalho</Label>
          <Input
            placeholder="Olá! Escolha uma opção:"
            value={config.menu_header || ''}
            onChange={(e) => onConfigChange({ ...config, menu_header: e.target.value })}
          />
        </div>
      </div>
      
      {/* Navegação (breadcrumb) - só aparece quando está em submenu */}
      {isInSubmenu && (
        <div className="flex items-center gap-2 p-3 bg-blue-50 dark:bg-blue-950/30 rounded-lg border border-blue-200 dark:border-blue-800">
          <Button variant="ghost" size="sm" onClick={navigateToRoot} className="h-8 gap-1">
            <Home className="h-4 w-4" />
            Menu Principal
          </Button>
          {navigationPath.map((nav, idx) => (
            <div key={nav.id} className="flex items-center gap-1">
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
              <Button
                variant={idx === navigationPath.length - 1 ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setNavigationPath(navigationPath.slice(0, idx + 1))}
                className="h-8"
              >
                📂 {nav.title}
              </Button>
            </div>
          ))}
        </div>
      )}
      
      {/* ========================================= */}
      {/* BOTÕES GRANDES DE AÇÃO - O PONTO CHAVE! */}
      {/* ========================================= */}
      <div className="grid grid-cols-3 gap-2">
        <Button
          variant="outline"
          className="h-16 flex-col gap-1 border-2 border-dashed border-blue-300 hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-950/30"
          onClick={() => openCreateDialog('submenu')}
        >
          <FolderPlus className="h-6 w-6 text-blue-600" />
          <span className="text-xs font-medium">Submenu</span>
        </Button>
        <Button
          variant="outline"
          className="h-16 flex-col gap-1 border-2 border-dashed border-green-300 hover:border-green-500 hover:bg-green-50 dark:hover:bg-green-950/30"
          onClick={() => openCreateDialog('message')}
        >
          <MessageCircle className="h-6 w-6 text-green-600" />
          <span className="text-xs font-medium">Mensagem</span>
        </Button>
        <Button
          variant="outline"
          className="h-16 flex-col gap-1 border-2 border-dashed border-purple-300 hover:border-purple-500 hover:bg-purple-50 dark:hover:bg-purple-950/30"
          onClick={() => openCreateDialog('command')}
        >
          <Zap className="h-6 w-6 text-purple-600" />
          <span className="text-xs font-medium">Comando</span>
        </Button>
      </div>
      
      {/* Botão para outras ações */}
      <div className="flex justify-center">
        <Button
          variant="ghost"
          size="sm"
          className="text-xs text-muted-foreground"
          onClick={() => openCreateDialog('other')}
        >
          + Outras ações (Atendente, Encerrar...)
        </Button>
      </div>
      
      {/* Lista de opções */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-sm font-medium">
            {isInSubmenu ? `📂 Itens de "${navigationPath[navigationPath.length - 1]?.title}"` : '📋 Opções do Menu'}
          </Label>
          {isInSubmenu && (
            <Button variant="outline" size="sm" onClick={navigateBack} className="h-8 gap-1">
              <ArrowLeft className="h-4 w-4" />
              Voltar
            </Button>
          )}
        </div>
        
        <ScrollArea className="max-h-[300px]">
          <div className="space-y-2 pr-4">
            {currentOptions.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center border-2 border-dashed rounded-lg bg-muted/30">
                <FolderOpen className="h-12 w-12 text-muted-foreground/30 mb-3" />
                <p className="text-sm text-muted-foreground mb-1">
                  {isInSubmenu ? 'Este submenu está vazio' : 'Nenhuma opção ainda'}
                </p>
                <p className="text-xs text-muted-foreground">
                  Use os botões acima para adicionar opções
                </p>
              </div>
            ) : (
              currentOptions.map((option, index) => (
                <SimpleOptionCard
                  key={option.id}
                  option={option}
                  index={index}
                  onNavigateIn={() => navigateToSubmenu(option)}
                  onEdit={() => openEditDialog(option)}
                  onDelete={() => handleDelete(option.id)}
                  onDuplicate={() => handleDuplicate(option)}
                />
              ))
            )}
          </div>
        </ScrollArea>
      </div>
      
      {/* Configurações extras */}
      <div className="flex flex-wrap items-center gap-4 p-3 bg-muted/30 rounded-lg">
        <div className="flex items-center gap-2">
          <Switch
            checked={config.show_back_button ?? true}
            onCheckedChange={(checked) => onConfigChange({ ...config, show_back_button: checked })}
          />
          <Label className="text-sm">Botão Voltar</Label>
        </div>
        <div className="flex items-center gap-2">
          <Switch
            checked={config.silent_on_invalid ?? false}
            onCheckedChange={(checked) => onConfigChange({ ...config, silent_on_invalid: checked })}
          />
          <Label className="text-sm">Ignorar inválidas</Label>
        </div>
      </div>
      
      {/* ========================================= */}
      {/* DIALOG SIMPLIFICADO */}
      {/* ========================================= */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {dialogType === 'submenu' && <><FolderPlus className="h-5 w-5 text-blue-600" /> {editingOption ? 'Editar Submenu' : 'Novo Submenu'}</>}
              {dialogType === 'message' && <><MessageCircle className="h-5 w-5 text-green-600" /> {editingOption ? 'Editar Mensagem' : 'Nova Mensagem'}</>}
              {dialogType === 'command' && <><Zap className="h-5 w-5 text-purple-600" /> {editingOption ? 'Editar Comando' : 'Novo Comando'}</>}
              {dialogType === 'other' && <>{editingOption ? 'Editar Opção' : 'Nova Opção'}</>}
            </DialogTitle>
            <DialogDescription>
              {dialogType === 'submenu' && 'Crie uma pasta para organizar mais opções dentro'}
              {dialogType === 'message' && 'Envie uma mensagem quando o cliente escolher esta opção'}
              {dialogType === 'command' && 'Execute um comando como /teste ou /renovar'}
              {dialogType === 'other' && 'Configure uma ação especial'}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-2">
            {/* Emoji + Título (sempre visível) */}
            <div className="grid gap-3 grid-cols-[70px_1fr]">
              <div className="space-y-2">
                <Label className="text-sm">Emoji</Label>
                <Input
                  placeholder="📂"
                  value={formEmoji}
                  onChange={(e) => setFormEmoji(e.target.value)}
                  className="text-center text-xl"
                  maxLength={4}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm">Nome *</Label>
                <Input
                  placeholder={dialogType === 'submenu' ? 'Ex: Suporte' : dialogType === 'command' ? 'Ex: Gerar Teste' : 'Ex: Ver Planos'}
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  autoFocus
                />
              </div>
            </div>
            
            {/* Descrição (opcional) */}
            <div className="space-y-2">
              <Label className="text-sm">Descrição (opcional)</Label>
              <Input
                placeholder="Aparece abaixo do título no WhatsApp"
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
              />
            </div>
            
            {/* Campo específico: Mensagem */}
            {dialogType === 'message' && (
              <div className="space-y-2">
                <Label className="text-sm">💬 Mensagem para enviar</Label>
                <Textarea
                  placeholder="Digite a mensagem que será enviada..."
                  value={formMessage}
                  onChange={(e) => setFormMessage(e.target.value)}
                  rows={3}
                />
              </div>
            )}
            
            {/* Campo específico: Comando */}
            {dialogType === 'command' && (
              <div className="space-y-2">
                <Label className="text-sm">⚡ Comando a executar</Label>
                <Input
                  placeholder="/teste, /renovar, /planos..."
                  value={formCommand}
                  onChange={(e) => setFormCommand(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Este comando será executado automaticamente
                </p>
              </div>
            )}
            
            {/* Info: Submenu */}
            {dialogType === 'submenu' && (
              <div className="p-3 bg-blue-50 dark:bg-blue-950/30 rounded-lg border border-blue-200 dark:border-blue-800">
                <p className="text-sm text-blue-700 dark:text-blue-300">
                  📂 Após salvar, você será levado para adicionar as opções dentro deste submenu
                </p>
              </div>
            )}
            
            {/* Seletor para "Outras ações" */}
            {dialogType === 'other' && (
              <div className="space-y-3">
                <Label className="text-sm">Tipo de ação</Label>
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    type="button"
                    variant={formActionType === 'transfer_human' ? 'default' : 'outline'}
                    className="h-12 flex-col gap-1"
                    onClick={() => setFormActionType('transfer_human')}
                  >
                    <UserCircle className="h-5 w-5" />
                    <span className="text-xs">Atendente</span>
                  </Button>
                  <Button
                    type="button"
                    variant={formActionType === 'end_session' ? 'default' : 'outline'}
                    className="h-12 flex-col gap-1"
                    onClick={() => setFormActionType('end_session')}
                  >
                    <XCircle className="h-5 w-5" />
                    <span className="text-xs">Encerrar</span>
                  </Button>
                </div>
                
                {formActionType === 'transfer_human' && (
                  <div className="p-3 bg-amber-50 dark:bg-amber-950/30 rounded-lg text-sm text-amber-700 dark:text-amber-300">
                    👤 O cliente será transferido para atendimento humano
                  </div>
                )}
                {formActionType === 'end_session' && (
                  <div className="p-3 bg-red-50 dark:bg-red-950/30 rounded-lg text-sm text-red-700 dark:text-red-300">
                    🏁 A conversa será encerrada
                  </div>
                )}
              </div>
            )}
          </div>
          
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={!formTitle.trim()}>
              {editingOption ? 'Salvar' : 'Adicionar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
