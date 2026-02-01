/**
 * Editor de Menu Interativo - ULTRA SIMPLIFICADO
 * Permite criar menus com submenus de forma visual e intuitiva
 * 
 * PRINCÍPIO: Clicou, adicionou - sem opções técnicas confusas
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
import {
  Plus,
  Trash2,
  Edit2,
  ChevronRight,
  ArrowLeft,
  FolderPlus,
  MessageCircle,
  UserCircle,
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

// Mapeamento de tipos para exibição - APENAS OS ESSENCIAIS
const ACTION_DISPLAY: Record<MenuOptionActionType, { emoji: string; label: string; color: string }> = {
  submenu: { emoji: '📂', label: 'Submenu', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' },
  message: { emoji: '💬', label: 'Mensagem', color: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' },
  command: { emoji: '⚡', label: 'Comando', color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300' },
  transfer_human: { emoji: '👤', label: 'Atendente', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' },
  end_session: { emoji: '🏁', label: 'Encerrar', color: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' },
  goto_flow: { emoji: '↪️', label: 'Ir para Fluxo', color: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300' },
  goto_node: { emoji: '🎯', label: 'Ir para Nó', color: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300' },
};

// Card de opção ultra simplificado
function OptionCard({
  option,
  index,
  onNavigateIn,
  onEdit,
  onDelete,
}: {
  option: BotMenuOption;
  index: number;
  onNavigateIn?: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const display = ACTION_DISPLAY[option.action_type] || ACTION_DISPLAY.message;
  const hasChildren = option.action_type === 'submenu' && (option.submenu_options?.length || 0) > 0;
  
  return (
    <Card className={cn(
      "transition-all hover:shadow-md group",
      option.action_type === 'submenu' && "border-blue-200 dark:border-blue-800"
    )}>
      <CardContent className="p-3">
        <div className="flex items-center gap-3">
          {/* Número */}
          <div className="flex items-center justify-center w-7 h-7 rounded-full bg-primary/10 text-primary font-bold text-sm shrink-0">
            {index + 1}
          </div>
          
          {/* Conteúdo clicável */}
          <div 
            className={cn(
              "flex-1 min-w-0 flex items-center gap-2",
              option.action_type === 'submenu' && "cursor-pointer"
            )}
            onClick={() => option.action_type === 'submenu' && onNavigateIn?.()}
          >
            <span className="text-lg">{option.emoji || display.emoji}</span>
            <div className="min-w-0 flex-1">
              <p className="font-medium truncate text-sm">{option.title}</p>
              {option.description && (
                <p className="text-xs text-muted-foreground truncate">{option.description}</p>
              )}
            </div>
          </div>
          
          {/* Badge do tipo */}
          <Badge variant="secondary" className={cn("shrink-0 text-xs px-2 py-0.5", display.color)}>
            {display.label}
            {hasChildren && ` (${option.submenu_options?.length})`}
          </Badge>
          
          {/* Seta para submenu */}
          {option.action_type === 'submenu' && (
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-7 w-7 shrink-0"
              onClick={onNavigateIn}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          )}
          
          {/* Ações */}
          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onEdit}>
              <Edit2 className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={onDelete}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function MenuNodeEditor({
  config,
  onConfigChange,
}: MenuNodeEditorProps) {
  // Navegação
  const [navigationPath, setNavigationPath] = useState<{ id: string; title: string }[]>([]);
  
  // Dialog
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingOption, setEditingOption] = useState<BotMenuOption | null>(null);
  const [dialogType, setDialogType] = useState<'submenu' | 'message' | 'command' | 'atendente'>('message');
  
  // Form
  const [formTitle, setFormTitle] = useState('');
  const [formEmoji, setFormEmoji] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formMessage, setFormMessage] = useState('');
  const [formCommand, setFormCommand] = useState('');
  
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
  
  // Atualizar opções
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
  
  // Criar opção
  const openCreateDialog = (type: 'submenu' | 'message' | 'command' | 'atendente') => {
    setEditingOption(null);
    setDialogType(type);
    setFormTitle('');
    setFormEmoji(type === 'submenu' ? '📂' : type === 'message' ? '💬' : type === 'command' ? '⚡' : '👤');
    setFormDescription('');
    setFormMessage('');
    setFormCommand('');
    setIsDialogOpen(true);
  };
  
  // Editar opção
  const openEditDialog = (option: BotMenuOption) => {
    setEditingOption(option);
    setDialogType(
      option.action_type === 'submenu' ? 'submenu' : 
      option.action_type === 'message' ? 'message' : 
      option.action_type === 'command' ? 'command' : 'atendente'
    );
    setFormTitle(option.title);
    setFormEmoji(option.emoji || '');
    setFormDescription(option.description || '');
    setFormMessage(option.message_text || '');
    setFormCommand(option.command || '');
    setIsDialogOpen(true);
  };
  
  // Salvar
  const handleSave = () => {
    if (!formTitle.trim()) return;
    
    const currentOptions = getCurrentOptions();
    
    const actionType: MenuOptionActionType = 
      dialogType === 'submenu' ? 'submenu' :
      dialogType === 'command' ? 'command' :
      dialogType === 'atendente' ? 'transfer_human' : 'message';
    
    const newOption: BotMenuOption = {
      id: editingOption?.id || generateOptionId(),
      title: formTitle.trim(),
      emoji: formEmoji.trim() || undefined,
      description: formDescription.trim() || undefined,
      action_type: actionType,
      command: actionType === 'command' ? formCommand.trim() : undefined,
      message_text: (actionType === 'message' || actionType === 'transfer_human') ? formMessage.trim() : undefined,
      submenu_options: editingOption?.submenu_options || (actionType === 'submenu' ? [] : undefined),
    };
    
    if (editingOption) {
      setCurrentOptions(currentOptions.map(o => o.id === editingOption.id ? newOption : o));
    } else {
      setCurrentOptions([...currentOptions, newOption]);
      
      // Navegar automaticamente para submenu criado
      if (actionType === 'submenu') {
        setTimeout(() => navigateToSubmenu(newOption), 100);
      }
    }
    
    setIsDialogOpen(false);
  };
  
  // Deletar
  const handleDelete = (optionId: string) => {
    if (!confirm('Excluir esta opção?')) return;
    setCurrentOptions(getCurrentOptions().filter(o => o.id !== optionId));
  };
  
  const currentOptions = getCurrentOptions();
  const isInSubmenu = navigationPath.length > 0;
  
  return (
    <div className="space-y-4">
      {/* Mensagem de boas-vindas */}
      <div className="space-y-2">
        <Label className="text-sm font-medium">👋 Mensagem de Boas-vindas</Label>
        <Textarea
          placeholder="Olá! Como posso ajudar você hoje?"
          value={config.message_text || ''}
          onChange={(e) => onConfigChange({ ...config, message_text: e.target.value })}
          rows={2}
          className="text-sm"
        />
      </div>
      
      {/* Breadcrumb de navegação */}
      {isInSubmenu && (
        <div className="flex items-center gap-2 p-2 bg-blue-50 dark:bg-blue-950/30 rounded-lg border border-blue-200 dark:border-blue-800">
          <Button variant="ghost" size="sm" onClick={navigateToRoot} className="h-7 gap-1 text-xs">
            <Home className="h-3.5 w-3.5" />
            Início
          </Button>
          {navigationPath.map((nav, idx) => (
            <div key={nav.id} className="flex items-center gap-1">
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
              <Button
                variant={idx === navigationPath.length - 1 ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setNavigationPath(navigationPath.slice(0, idx + 1))}
                className="h-7 text-xs"
              >
                📂 {nav.title}
              </Button>
            </div>
          ))}
        </div>
      )}
      
      {/* BOTÕES DE AÇÃO - SIMPLES E CLAROS */}
      <div className="grid grid-cols-4 gap-2">
        <Button
          variant="outline"
          className="h-14 flex-col gap-1 border-2 border-dashed border-blue-300 hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-950/30"
          onClick={() => openCreateDialog('submenu')}
        >
          <FolderPlus className="h-5 w-5 text-blue-600" />
          <span className="text-xs">Submenu</span>
        </Button>
        <Button
          variant="outline"
          className="h-14 flex-col gap-1 border-2 border-dashed border-green-300 hover:border-green-500 hover:bg-green-50 dark:hover:bg-green-950/30"
          onClick={() => openCreateDialog('message')}
        >
          <MessageCircle className="h-5 w-5 text-green-600" />
          <span className="text-xs">Mensagem</span>
        </Button>
        <Button
          variant="outline"
          className="h-14 flex-col gap-1 border-2 border-dashed border-purple-300 hover:border-purple-500 hover:bg-purple-50 dark:hover:bg-purple-950/30"
          onClick={() => openCreateDialog('command')}
        >
          <Zap className="h-5 w-5 text-purple-600" />
          <span className="text-xs">Comando</span>
        </Button>
        <Button
          variant="outline"
          className="h-14 flex-col gap-1 border-2 border-dashed border-amber-300 hover:border-amber-500 hover:bg-amber-50 dark:hover:bg-amber-950/30"
          onClick={() => openCreateDialog('atendente')}
        >
          <UserCircle className="h-5 w-5 text-amber-600" />
          <span className="text-xs">Atendente</span>
        </Button>
      </div>
      
      {/* Lista de opções */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-sm font-medium">
            {isInSubmenu ? `📂 ${navigationPath[navigationPath.length - 1]?.title}` : '📋 Opções do Menu'}
          </Label>
          {isInSubmenu && (
            <Button variant="ghost" size="sm" onClick={navigateBack} className="h-7 gap-1 text-xs">
              <ArrowLeft className="h-3.5 w-3.5" />
              Voltar
            </Button>
          )}
        </div>
        
        <ScrollArea className="max-h-[250px]">
          <div className="space-y-2 pr-2">
            {currentOptions.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-6 text-center border-2 border-dashed rounded-lg bg-muted/20">
                <FolderOpen className="h-10 w-10 text-muted-foreground/30 mb-2" />
                <p className="text-sm text-muted-foreground">
                  {isInSubmenu ? 'Submenu vazio' : 'Nenhuma opção ainda'}
                </p>
                <p className="text-xs text-muted-foreground">
                  Clique nos botões acima para adicionar
                </p>
              </div>
            ) : (
              currentOptions.map((option, index) => (
                <OptionCard
                  key={option.id}
                  option={option}
                  index={index}
                  onNavigateIn={() => navigateToSubmenu(option)}
                  onEdit={() => openEditDialog(option)}
                  onDelete={() => handleDelete(option.id)}
                />
              ))
            )}
          </div>
        </ScrollArea>
      </div>
      
      {/* DIALOG SIMPLIFICADO */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {dialogType === 'submenu' && <><FolderPlus className="h-5 w-5 text-blue-600" /> {editingOption ? 'Editar Submenu' : 'Novo Submenu'}</>}
              {dialogType === 'message' && <><MessageCircle className="h-5 w-5 text-green-600" /> {editingOption ? 'Editar Mensagem' : 'Nova Mensagem'}</>}
              {dialogType === 'command' && <><Zap className="h-5 w-5 text-purple-600" /> {editingOption ? 'Editar Comando' : 'Novo Comando'}</>}
              {dialogType === 'atendente' && <><UserCircle className="h-5 w-5 text-amber-600" /> {editingOption ? 'Editar' : 'Chamar Atendente'}</>}
            </DialogTitle>
            <DialogDescription>
              {dialogType === 'submenu' && 'Crie uma pasta para organizar mais opções'}
              {dialogType === 'message' && 'Envie uma mensagem quando clicado'}
              {dialogType === 'command' && 'Execute um comando como /teste'}
              {dialogType === 'atendente' && 'Transfere para atendimento humano'}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-2">
            {/* Emoji + Título */}
            <div className="grid gap-3 grid-cols-[60px_1fr]">
              <div className="space-y-1">
                <Label className="text-xs">Emoji</Label>
                <Input
                  placeholder="📂"
                  value={formEmoji}
                  onChange={(e) => setFormEmoji(e.target.value)}
                  className="text-center text-lg"
                  maxLength={4}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Nome *</Label>
                <Input
                  placeholder="Ex: Ver Planos"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  autoFocus
                />
              </div>
            </div>
            
            {/* Descrição */}
            <div className="space-y-1">
              <Label className="text-xs">Descrição (opcional)</Label>
              <Input
                placeholder="Texto que aparece abaixo"
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
              />
            </div>
            
            {/* Mensagem */}
            {(dialogType === 'message' || dialogType === 'atendente') && (
              <div className="space-y-1">
                <Label className="text-xs">💬 Mensagem</Label>
                <Textarea
                  placeholder={dialogType === 'atendente' 
                    ? "Aguarde, um atendente irá te responder..." 
                    : "Digite a mensagem..."
                  }
                  value={formMessage}
                  onChange={(e) => setFormMessage(e.target.value)}
                  rows={3}
                />
              </div>
            )}
            
            {/* Comando */}
            {dialogType === 'command' && (
              <div className="space-y-1">
                <Label className="text-xs">⚡ Comando</Label>
                <Input
                  placeholder="/teste, /renovar, /planos..."
                  value={formCommand}
                  onChange={(e) => setFormCommand(e.target.value)}
                />
              </div>
            )}
            
            {/* Info submenu */}
            {dialogType === 'submenu' && (
              <div className="p-3 bg-blue-50 dark:bg-blue-950/30 rounded-lg text-sm text-blue-700 dark:text-blue-300">
                📂 Após salvar, você poderá adicionar opções dentro deste submenu
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
