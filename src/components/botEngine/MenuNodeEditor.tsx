/**
 * Editor de Nós de Menu Interativo
 * Permite criar menus com submenus infinitos de forma visual
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
  ChevronDown,
  ArrowLeft,
  FolderTree,
  MessageCircle,
  Terminal,
  GitFork,
  UserCircle,
  XCircle,
  GripVertical,
  Copy,
  Home,
} from 'lucide-react';
import type { BotMenuOption, MenuOptionActionType, BotNodeConfig } from '@/lib/botEngine/types';
import { cn } from '@/lib/utils';

interface MenuNodeEditorProps {
  config: BotNodeConfig;
  onConfigChange: (config: BotNodeConfig) => void;
  availableFlows?: { id: string; name: string }[];
  availableNodes?: { id: string; name: string }[];
}

// Ações disponíveis para cada opção
const ACTION_TYPES: { value: MenuOptionActionType; label: string; emoji: string; description: string }[] = [
  { value: 'submenu', label: 'Submenu', emoji: '📂', description: 'Abre outro menu' },
  { value: 'message', label: 'Mensagem', emoji: '💬', description: 'Envia uma mensagem' },
  { value: 'command', label: 'Comando', emoji: '⚡', description: 'Executa /teste, /renovar, etc' },
  { value: 'goto_flow', label: 'Ir para Fluxo', emoji: '↪️', description: 'Navega para outro fluxo' },
  { value: 'goto_node', label: 'Ir para Nó', emoji: '🎯', description: 'Pula para outro nó' },
  { value: 'transfer_human', label: 'Atendente', emoji: '👤', description: 'Transfere para humano' },
  { value: 'end_session', label: 'Encerrar', emoji: '🏁', description: 'Finaliza conversa' },
];

// Gera ID único para opções
const generateOptionId = () => `opt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

// Componente para exibir uma opção de menu
function MenuOptionCard({
  option,
  index,
  depth = 0,
  isExpanded,
  onToggleExpand,
  onEdit,
  onDelete,
  onDuplicate,
  onAddChild,
}: {
  option: BotMenuOption;
  index: number;
  depth?: number;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onAddChild: () => void;
}) {
  const actionInfo = ACTION_TYPES.find(a => a.value === option.action_type);
  const hasChildren = option.action_type === 'submenu' && option.submenu_options && option.submenu_options.length > 0;
  
  return (
    <div className={cn("relative", depth > 0 && "ml-6 border-l-2 border-muted pl-4")}>
      <Card className={cn(
        "transition-all hover:shadow-md group",
        depth === 0 ? "border-2" : "border",
        option.action_type === 'submenu' && "border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/20"
      )}>
        <CardContent className="p-3">
          <div className="flex items-start gap-2">
            {/* Grip for ordering */}
            <div className="flex flex-col items-center gap-1 pt-1">
              <span className="text-xs font-mono text-muted-foreground bg-background rounded px-1">
                {index + 1}
              </span>
              <GripVertical className="h-4 w-4 text-muted-foreground/30 cursor-grab" />
            </div>
            
            {/* Expand/Collapse for submenus */}
            {option.action_type === 'submenu' && (
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 shrink-0"
                onClick={onToggleExpand}
              >
                {isExpanded ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}
              </Button>
            )}
            
            {/* Content */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-lg">{option.emoji || actionInfo?.emoji || '📌'}</span>
                <span className="font-medium truncate">{option.title}</span>
                <Badge variant="secondary" className="text-xs shrink-0">
                  {actionInfo?.label || option.action_type}
                </Badge>
              </div>
              
              {option.description && (
                <p className="text-sm text-muted-foreground line-clamp-1">
                  {option.description}
                </p>
              )}
              
              {/* Show action details */}
              <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                {option.action_type === 'command' && option.command && (
                  <code className="bg-muted px-1 rounded">{option.command}</code>
                )}
                {option.action_type === 'submenu' && option.submenu_options && (
                  <span>{option.submenu_options.length} opção(ões)</span>
                )}
                {option.action_type === 'message' && option.message_text && (
                  <span className="truncate max-w-[200px]">"{option.message_text.slice(0, 50)}..."</span>
                )}
              </div>
            </div>
            
            {/* Actions */}
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              {option.action_type === 'submenu' && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={onAddChild}
                  title="Adicionar sub-opção"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={onDuplicate}
                title="Duplicar"
              >
                <Copy className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={onEdit}
                title="Editar"
              >
                <Edit2 className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-destructive hover:text-destructive"
                onClick={onDelete}
                title="Excluir"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export function MenuNodeEditor({
  config,
  onConfigChange,
  availableFlows = [],
  availableNodes = [],
}: MenuNodeEditorProps) {
  // Estado local
  const [expandedOptions, setExpandedOptions] = useState<Set<string>>(new Set());
  const [editingOption, setEditingOption] = useState<BotMenuOption | null>(null);
  const [editingPath, setEditingPath] = useState<number[]>([]);
  const [isOptionDialogOpen, setIsOptionDialogOpen] = useState(false);
  
  // Navegação por breadcrumb para submenus
  const [navigationPath, setNavigationPath] = useState<{ id: string; title: string }[]>([]);
  
  // Form states para editar opção
  const [optTitle, setOptTitle] = useState('');
  const [optEmoji, setOptEmoji] = useState('');
  const [optDescription, setOptDescription] = useState('');
  const [optActionType, setOptActionType] = useState<MenuOptionActionType>('message');
  const [optCommand, setOptCommand] = useState('');
  const [optMessage, setOptMessage] = useState('');
  const [optTargetFlow, setOptTargetFlow] = useState('');
  const [optTargetNode, setOptTargetNode] = useState('');
  
  // Opções atuais (baseado na navegação)
  const getCurrentOptions = useCallback((): BotMenuOption[] => {
    // Garantir que menu_options é um array válido
    let options: BotMenuOption[] = Array.isArray(config.menu_options) 
      ? config.menu_options 
      : [];
    
    for (const nav of navigationPath) {
      const parent = options.find(o => o.id === nav.id);
      if (parent && Array.isArray(parent.submenu_options)) {
        options = parent.submenu_options;
      } else {
        // Se o caminho ficou inválido, resetar navegação
        break;
      }
    }
    return options;
  }, [config.menu_options, navigationPath]);
  
  // Atualizar opções no nível atual
  const setCurrentOptions = useCallback((newOptions: BotMenuOption[]) => {
    if (navigationPath.length === 0) {
      onConfigChange({ ...config, menu_options: newOptions });
    } else {
      // Navegar até o nível correto e atualizar
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
  
  // Navegar para submenu
  const navigateToSubmenu = (option: BotMenuOption) => {
    if (option.action_type === 'submenu') {
      setNavigationPath([...navigationPath, { id: option.id, title: option.title }]);
    }
  };
  
  // Voltar um nível
  const navigateBack = () => {
    setNavigationPath(navigationPath.slice(0, -1));
  };
  
  // Voltar para raiz
  const navigateToRoot = () => {
    setNavigationPath([]);
  };
  
  // Abrir dialog para nova opção
  const openNewOptionDialog = () => {
    setEditingOption(null);
    setOptTitle('');
    setOptEmoji('');
    setOptDescription('');
    setOptActionType('message');
    setOptCommand('');
    setOptMessage('');
    setOptTargetFlow('');
    setOptTargetNode('');
    setIsOptionDialogOpen(true);
  };
  
  // Abrir dialog para editar opção
  const openEditOptionDialog = (option: BotMenuOption) => {
    setEditingOption(option);
    setOptTitle(option.title);
    setOptEmoji(option.emoji || '');
    setOptDescription(option.description || '');
    setOptActionType(option.action_type);
    setOptCommand(option.command || '');
    setOptMessage(option.message_text || '');
    setOptTargetFlow(option.target_flow_id || '');
    setOptTargetNode(option.target_node_id || '');
    setIsOptionDialogOpen(true);
  };
  
  // Salvar opção
  const handleSaveOption = () => {
    const currentOptions = getCurrentOptions();
    
    const newOption: BotMenuOption = {
      id: editingOption?.id || generateOptionId(),
      title: optTitle.trim(),
      emoji: optEmoji.trim() || undefined,
      description: optDescription.trim() || undefined,
      action_type: optActionType,
      command: optActionType === 'command' ? optCommand.trim() : undefined,
      message_text: optActionType === 'message' ? optMessage.trim() : undefined,
      target_flow_id: optActionType === 'goto_flow' ? optTargetFlow : undefined,
      target_node_id: optActionType === 'goto_node' ? optTargetNode : undefined,
      submenu_options: editingOption?.submenu_options || (optActionType === 'submenu' ? [] : undefined),
    };
    
    if (editingOption) {
      // Atualizar opção existente
      setCurrentOptions(currentOptions.map(o => o.id === editingOption.id ? newOption : o));
    } else {
      // Adicionar nova opção
      setCurrentOptions([...currentOptions, newOption]);
    }
    
    setIsOptionDialogOpen(false);
  };
  
  // Deletar opção
  const handleDeleteOption = (optionId: string) => {
    const currentOptions = getCurrentOptions();
    setCurrentOptions(currentOptions.filter(o => o.id !== optionId));
  };
  
  // Duplicar opção
  const handleDuplicateOption = (option: BotMenuOption) => {
    const currentOptions = getCurrentOptions();
    const duplicate: BotMenuOption = {
      ...option,
      id: generateOptionId(),
      title: `${option.title} (cópia)`,
      submenu_options: option.submenu_options ? JSON.parse(JSON.stringify(option.submenu_options)) : undefined,
    };
    setCurrentOptions([...currentOptions, duplicate]);
  };
  
  // Adicionar opção filha (submenu)
  const handleAddChildOption = (parentOption: BotMenuOption) => {
    navigateToSubmenu(parentOption);
    setTimeout(() => openNewOptionDialog(), 100);
  };
  
  // Toggle expandir/colapsar
  const toggleExpand = (optionId: string) => {
    const newExpanded = new Set(expandedOptions);
    if (newExpanded.has(optionId)) {
      newExpanded.delete(optionId);
    } else {
      newExpanded.add(optionId);
    }
    setExpandedOptions(newExpanded);
  };
  
  const currentOptions = getCurrentOptions();
  
  return (
    <div className="space-y-3 sm:space-y-4">
      {/* Header do Menu */}
      <div className="space-y-3">
        <div className="grid gap-2 sm:gap-3 grid-cols-1 sm:grid-cols-2">
          <div className="space-y-1.5 sm:space-y-2">
            <Label className="text-xs sm:text-sm">📋 Título do Menu</Label>
            <Input
              placeholder="Menu Principal"
              value={config.menu_title || ''}
              onChange={(e) => onConfigChange({ ...config, menu_title: e.target.value })}
              className="text-base h-9 sm:h-10"
            />
          </div>
          <div className="space-y-1.5 sm:space-y-2">
            <Label className="text-xs sm:text-sm">🔙 Texto do Voltar</Label>
            <Input
              placeholder="⬅️ Voltar"
              value={config.back_button_text || ''}
              onChange={(e) => onConfigChange({ ...config, back_button_text: e.target.value })}
              className="text-base h-9 sm:h-10"
            />
          </div>
        </div>
        
        <div className="space-y-1.5 sm:space-y-2">
          <Label className="text-xs sm:text-sm">📝 Cabeçalho (opcional)</Label>
          <Textarea
            placeholder="Olá! Escolha uma opção:"
            value={config.menu_header || ''}
            onChange={(e) => onConfigChange({ ...config, menu_header: e.target.value })}
            rows={2}
            className="text-base resize-none"
          />
        </div>
        
        <div className="flex flex-wrap items-center gap-3 sm:gap-4">
          <div className="flex items-center gap-2">
            <Switch
              checked={config.show_back_button ?? true}
              onCheckedChange={(checked) => onConfigChange({ ...config, show_back_button: checked })}
            />
            <Label className="text-xs sm:text-sm">Voltar</Label>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              checked={config.silent_on_invalid ?? false}
              onCheckedChange={(checked) => onConfigChange({ ...config, silent_on_invalid: checked })}
            />
            <Label className="text-xs sm:text-sm">Silenciar inválidas</Label>
          </div>
        </div>
      </div>
      
      {/* Breadcrumb de navegação */}
      {navigationPath.length > 0 && (
        <div className="flex items-center gap-1 p-2 bg-muted rounded-lg text-xs sm:text-sm overflow-x-auto">
          <Button variant="ghost" size="sm" onClick={navigateToRoot} className="h-6 sm:h-7 px-1.5 sm:px-2 shrink-0">
            <Home className="h-3 w-3 sm:h-4 sm:w-4 mr-0.5 sm:mr-1" />
            <span className="hidden xs:inline">Raiz</span>
          </Button>
          {navigationPath.map((nav, idx) => (
            <div key={nav.id} className="flex items-center shrink-0">
              <ChevronRight className="h-3 w-3 sm:h-4 sm:w-4 text-muted-foreground" />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setNavigationPath(navigationPath.slice(0, idx + 1))}
                className="h-6 sm:h-7 px-1.5 sm:px-2 max-w-[80px] sm:max-w-none"
              >
                <span className="truncate">{nav.title}</span>
              </Button>
            </div>
          ))}
        </div>
      )}
      
      {/* Lista de opções */}
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <Label className="text-sm sm:text-base font-medium truncate">
            {navigationPath.length === 0 ? '📋 Opções' : `📂 "${navigationPath[navigationPath.length - 1]?.title}"`}
          </Label>
          <div className="flex items-center gap-1 sm:gap-2 shrink-0">
            {navigationPath.length > 0 && (
              <Button variant="outline" size="sm" onClick={navigateBack} className="gap-1 h-7 sm:h-8 px-2">
                <ArrowLeft className="h-3 w-3 sm:h-4 sm:w-4" />
                <span className="hidden xs:inline">Voltar</span>
              </Button>
            )}
            <Button size="sm" onClick={openNewOptionDialog} className="gap-1 h-7 sm:h-8 px-2 sm:px-3">
              <Plus className="h-3 w-3 sm:h-4 sm:w-4" />
              <span className="hidden xs:inline">Nova</span>
            </Button>
          </div>
        </div>
        
        <ScrollArea className="max-h-[250px] sm:max-h-[350px]">
          <div className="space-y-2 pr-2 sm:pr-4">
            {currentOptions.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-6 sm:py-8 text-center border-2 border-dashed rounded-lg">
                <FolderTree className="h-10 w-10 sm:h-12 sm:w-12 text-muted-foreground/30 mb-2 sm:mb-3" />
                <p className="text-xs sm:text-sm text-muted-foreground mb-2 sm:mb-3">
                  Nenhuma opção configurada
                </p>
                <Button onClick={openNewOptionDialog} variant="outline" size="sm" className="gap-2">
                  <Plus className="h-4 w-4" />
                  Adicionar
                </Button>
              </div>
            ) : (
              currentOptions.map((option, index) => (
                <div key={option.id}>
                  <MenuOptionCard
                    option={option}
                    index={index}
                    isExpanded={expandedOptions.has(option.id)}
                    onToggleExpand={() => {
                      if (option.action_type === 'submenu') {
                        navigateToSubmenu(option);
                      }
                    }}
                    onEdit={() => openEditOptionDialog(option)}
                    onDelete={() => handleDeleteOption(option.id)}
                    onDuplicate={() => handleDuplicateOption(option)}
                    onAddChild={() => handleAddChildOption(option)}
                  />
                </div>
              ))
            )}
          </div>
        </ScrollArea>
      </div>
      
      {/* Footer */}
      <div className="space-y-1.5 sm:space-y-2">
        <Label className="text-xs sm:text-sm">📝 Rodapé (opcional)</Label>
        <Input
          placeholder="Digite o número da opção"
          value={config.menu_footer || ''}
          onChange={(e) => onConfigChange({ ...config, menu_footer: e.target.value })}
          className="text-base h-9 sm:h-10"
        />
      </div>
      
      {/* Dialog para editar/criar opção */}
      <Dialog open={isOptionDialogOpen} onOpenChange={setIsOptionDialogOpen}>
        <DialogContent className="w-[calc(100vw-1rem)] sm:w-[calc(100vw-2rem)] max-w-lg max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader className="shrink-0">
            <DialogTitle className="text-base sm:text-lg">
              {editingOption ? '✏️ Editar Opção' : '➕ Nova Opção'}
            </DialogTitle>
            <DialogDescription className="text-xs sm:text-sm">
              Configure os detalhes desta opção
            </DialogDescription>
          </DialogHeader>
          
          <div className="flex-1 overflow-y-auto -mx-6 px-6 space-y-3 sm:space-y-4 py-2">
            {/* Linha 1: Emoji + Título */}
            <div className="grid gap-2 sm:gap-3 grid-cols-[60px_1fr] sm:grid-cols-[80px_1fr]">
              <div className="space-y-1 sm:space-y-2">
                <Label className="text-xs sm:text-sm">Emoji</Label>
                <Input
                  placeholder="📋"
                  value={optEmoji}
                  onChange={(e) => setOptEmoji(e.target.value)}
                  className="text-center text-lg sm:text-xl h-9 sm:h-10"
                  maxLength={4}
                />
              </div>
              <div className="space-y-1 sm:space-y-2">
                <Label className="text-xs sm:text-sm">Título *</Label>
                <Input
                  placeholder="Ver Planos"
                  value={optTitle}
                  onChange={(e) => setOptTitle(e.target.value)}
                  className="text-base h-9 sm:h-10"
                />
              </div>
            </div>
            
            {/* Descrição */}
            <div className="space-y-1 sm:space-y-2">
              <Label className="text-xs sm:text-sm">Descrição (menu interativo)</Label>
              <Input
                placeholder="Conheça nossos planos"
                value={optDescription}
                onChange={(e) => setOptDescription(e.target.value)}
                className="text-base h-9 sm:h-10"
              />
            </div>
            
            {/* Tipo de Ação */}
            <div className="space-y-1 sm:space-y-2">
              <Label className="text-xs sm:text-sm">O que acontece?</Label>
              <Select value={optActionType} onValueChange={(v) => setOptActionType(v as MenuOptionActionType)}>
                <SelectTrigger className="h-9 sm:h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ACTION_TYPES.map(action => (
                    <SelectItem key={action.value} value={action.value}>
                      <div className="flex items-center gap-2">
                        <span>{action.emoji}</span>
                        <span className="text-sm">{action.label}</span>
                        <span className="text-xs text-muted-foreground hidden sm:inline">- {action.description}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            {/* Campos específicos por tipo */}
            {optActionType === 'message' && (
              <div className="space-y-1 sm:space-y-2">
                <Label className="text-xs sm:text-sm">💬 Mensagem</Label>
                <Textarea
                  placeholder="Mensagem para o cliente..."
                  value={optMessage}
                  onChange={(e) => setOptMessage(e.target.value)}
                  rows={3}
                  className="text-base resize-none"
                />
              </div>
            )}
            
            {optActionType === 'command' && (
              <div className="space-y-1 sm:space-y-2">
                <Label className="text-xs sm:text-sm">⚡ Comando</Label>
                <Input
                  placeholder="/teste, /renovar..."
                  value={optCommand}
                  onChange={(e) => setOptCommand(e.target.value)}
                  className="text-base h-9 sm:h-10"
                />
                <p className="text-[10px] sm:text-xs text-muted-foreground">
                  Executado ao escolher esta opção
                </p>
              </div>
            )}
            
            {optActionType === 'goto_flow' && (
              <div className="space-y-2">
                <Label>↪️ Fluxo de destino</Label>
                <Select value={optTargetFlow} onValueChange={setOptTargetFlow}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione um fluxo..." />
                  </SelectTrigger>
                  <SelectContent>
                    {availableFlows.map(flow => (
                      <SelectItem key={flow.id} value={flow.id}>
                        {flow.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            
            {optActionType === 'goto_node' && (
              <div className="space-y-2">
                <Label>🎯 Nó de destino</Label>
                <Select value={optTargetNode} onValueChange={setOptTargetNode}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione um nó..." />
                  </SelectTrigger>
                  <SelectContent>
                    {availableNodes.map(node => (
                      <SelectItem key={node.id} value={node.id}>
                        {node.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            
            {optActionType === 'submenu' && (
              <div className="p-3 bg-blue-50 dark:bg-blue-950/30 rounded-lg border border-blue-200 dark:border-blue-800">
                <p className="text-sm text-blue-700 dark:text-blue-300">
                  📂 Um submenu será criado. Após salvar, clique na opção para adicionar suas sub-opções.
                </p>
              </div>
            )}
            
            {optActionType === 'transfer_human' && (
              <div className="p-3 bg-amber-50 dark:bg-amber-950/30 rounded-lg border border-amber-200 dark:border-amber-800">
                <p className="text-sm text-amber-700 dark:text-amber-300">
                  👤 O cliente será transferido para atendimento humano e o bot será pausado.
                </p>
              </div>
            )}
            
            {optActionType === 'end_session' && (
              <div className="p-3 bg-red-50 dark:bg-red-950/30 rounded-lg border border-red-200 dark:border-red-800">
                <p className="text-sm text-red-700 dark:text-red-300">
                  🏁 A conversa será encerrada após esta opção.
                </p>
              </div>
            )}
          </div>
          
          <DialogFooter className="shrink-0 pt-2 flex-col-reverse sm:flex-row gap-2">
            <Button variant="outline" onClick={() => setIsOptionDialogOpen(false)} className="w-full sm:w-auto">
              Cancelar
            </Button>
            <Button onClick={handleSaveOption} disabled={!optTitle.trim()} className="w-full sm:w-auto">
              {editingOption ? 'Salvar' : 'Adicionar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
