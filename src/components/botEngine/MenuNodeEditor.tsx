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
    let options = config.menu_options || [];
    for (const nav of navigationPath) {
      const parent = options.find(o => o.id === nav.id);
      if (parent && parent.submenu_options) {
        options = parent.submenu_options;
      } else {
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
    <div className="space-y-4">
      {/* Header do Menu */}
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>📋 Título do Menu</Label>
            <Input
              placeholder="Menu Principal"
              value={config.menu_title || ''}
              onChange={(e) => onConfigChange({ ...config, menu_title: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label>🔙 Texto do botão Voltar</Label>
            <Input
              placeholder="⬅️ Voltar"
              value={config.back_button_text || ''}
              onChange={(e) => onConfigChange({ ...config, back_button_text: e.target.value })}
            />
          </div>
        </div>
        
        <div className="space-y-2">
          <Label>📝 Mensagem de Cabeçalho (opcional)</Label>
          <Textarea
            placeholder="Olá! Escolha uma opção abaixo:"
            value={config.menu_header || ''}
            onChange={(e) => onConfigChange({ ...config, menu_header: e.target.value })}
            rows={2}
          />
        </div>
        
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Switch
              checked={config.show_back_button ?? true}
              onCheckedChange={(checked) => onConfigChange({ ...config, show_back_button: checked })}
            />
            <Label className="text-sm">Mostrar botão Voltar</Label>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              checked={config.silent_on_invalid ?? false}
              onCheckedChange={(checked) => onConfigChange({ ...config, silent_on_invalid: checked })}
            />
            <Label className="text-sm">Silenciar opções inválidas</Label>
          </div>
        </div>
      </div>
      
      {/* Breadcrumb de navegação */}
      {navigationPath.length > 0 && (
        <div className="flex items-center gap-1 p-2 bg-muted rounded-lg text-sm">
          <Button variant="ghost" size="sm" onClick={navigateToRoot} className="h-7 px-2">
            <Home className="h-4 w-4 mr-1" />
            Raiz
          </Button>
          {navigationPath.map((nav, idx) => (
            <div key={nav.id} className="flex items-center">
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setNavigationPath(navigationPath.slice(0, idx + 1))}
                className="h-7 px-2"
              >
                {nav.title}
              </Button>
            </div>
          ))}
        </div>
      )}
      
      {/* Lista de opções */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-base font-medium">
            {navigationPath.length === 0 ? '📋 Opções do Menu' : `📂 Opções de "${navigationPath[navigationPath.length - 1]?.title}"`}
          </Label>
          <div className="flex items-center gap-2">
            {navigationPath.length > 0 && (
              <Button variant="outline" size="sm" onClick={navigateBack} className="gap-1">
                <ArrowLeft className="h-4 w-4" />
                Voltar
              </Button>
            )}
            <Button size="sm" onClick={openNewOptionDialog} className="gap-1">
              <Plus className="h-4 w-4" />
              Nova Opção
            </Button>
          </div>
        </div>
        
        <ScrollArea className="max-h-[400px]">
          <div className="space-y-2 pr-4">
            {currentOptions.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center border-2 border-dashed rounded-lg">
                <FolderTree className="h-12 w-12 text-muted-foreground/30 mb-3" />
                <p className="text-sm text-muted-foreground mb-3">
                  Nenhuma opção configurada
                </p>
                <Button onClick={openNewOptionDialog} variant="outline" className="gap-2">
                  <Plus className="h-4 w-4" />
                  Adicionar Primeira Opção
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
      <div className="space-y-2">
        <Label>📝 Mensagem de Rodapé (opcional)</Label>
        <Input
          placeholder="Digite o número da opção desejada"
          value={config.menu_footer || ''}
          onChange={(e) => onConfigChange({ ...config, menu_footer: e.target.value })}
        />
      </div>
      
      {/* Dialog para editar/criar opção */}
      <Dialog open={isOptionDialogOpen} onOpenChange={setIsOptionDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingOption ? '✏️ Editar Opção' : '➕ Nova Opção'}
            </DialogTitle>
            <DialogDescription>
              Configure os detalhes desta opção do menu
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            {/* Linha 1: Emoji + Título */}
            <div className="grid gap-3 grid-cols-[80px_1fr]">
              <div className="space-y-2">
                <Label>Emoji</Label>
                <Input
                  placeholder="📋"
                  value={optEmoji}
                  onChange={(e) => setOptEmoji(e.target.value)}
                  className="text-center text-xl"
                  maxLength={4}
                />
              </div>
              <div className="space-y-2">
                <Label>Título *</Label>
                <Input
                  placeholder="Ver Planos"
                  value={optTitle}
                  onChange={(e) => setOptTitle(e.target.value)}
                />
              </div>
            </div>
            
            {/* Descrição */}
            <div className="space-y-2">
              <Label>Descrição (aparece no menu interativo)</Label>
              <Input
                placeholder="Conheça nossos planos e preços"
                value={optDescription}
                onChange={(e) => setOptDescription(e.target.value)}
              />
            </div>
            
            {/* Tipo de Ação */}
            <div className="space-y-2">
              <Label>O que acontece ao selecionar?</Label>
              <Select value={optActionType} onValueChange={(v) => setOptActionType(v as MenuOptionActionType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ACTION_TYPES.map(action => (
                    <SelectItem key={action.value} value={action.value}>
                      <div className="flex items-center gap-2">
                        <span>{action.emoji}</span>
                        <span>{action.label}</span>
                        <span className="text-xs text-muted-foreground">- {action.description}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            {/* Campos específicos por tipo */}
            {optActionType === 'message' && (
              <div className="space-y-2">
                <Label>💬 Mensagem a enviar</Label>
                <Textarea
                  placeholder="Digite a mensagem que será enviada ao cliente..."
                  value={optMessage}
                  onChange={(e) => setOptMessage(e.target.value)}
                  rows={4}
                />
              </div>
            )}
            
            {optActionType === 'command' && (
              <div className="space-y-2">
                <Label>⚡ Comando a executar</Label>
                <Input
                  placeholder="/teste, /renovar, /status..."
                  value={optCommand}
                  onChange={(e) => setOptCommand(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  O comando será executado automaticamente quando o cliente escolher esta opção
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
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsOptionDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSaveOption} disabled={!optTitle.trim()}>
              {editingOption ? 'Salvar' : 'Adicionar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
