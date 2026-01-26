/**
 * BOT ENGINE - Gerenciador de Menus Dinâmicos
 * Interface completa para gerenciar menus e submenus do chatbot
 */

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  Plus, 
  ChevronRight, 
  ChevronDown, 
  Edit, 
  Trash2, 
  Copy, 
  MoreVertical,
  Star,
  ArrowUp,
  ArrowDown,
  FolderTree,
  MessageSquare,
  Link as LinkIcon,
  Terminal,
  Play
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useDynamicMenus } from '@/hooks/useDynamicMenus';
import { DynamicMenuEditor } from './DynamicMenuEditor';
import type { DynamicMenu, DynamicMenuType } from '@/lib/botEngine/menuTypes';
import { cn } from '@/lib/utils';

// Ícones por tipo
const TYPE_ICONS: Record<DynamicMenuType, typeof FolderTree> = {
  submenu: FolderTree,
  flow: Play,
  command: Terminal,
  link: LinkIcon,
  message: MessageSquare,
};

const TYPE_LABELS: Record<DynamicMenuType, string> = {
  submenu: 'Submenu',
  flow: 'Fluxo',
  command: 'Comando',
  link: 'Link',
  message: 'Mensagem',
};

export function DynamicMenuManager() {
  const {
    menus,
    isLoading,
    getChildMenus,
    createMenu,
    updateMenu,
    deleteMenu,
    duplicateMenu,
    toggleActive,
    setAsRoot,
    isCreating,
    isUpdating,
    isDeleting,
  } = useDynamicMenus();

  const [expandedMenus, setExpandedMenus] = useState<Set<string>>(new Set());
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingMenu, setEditingMenu] = useState<DynamicMenu | null>(null);
  const [parentMenuId, setParentMenuId] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [menuToDelete, setMenuToDelete] = useState<DynamicMenu | null>(null);

  // Toggle expansão
  const toggleExpand = (menuId: string) => {
    const newExpanded = new Set(expandedMenus);
    if (newExpanded.has(menuId)) {
      newExpanded.delete(menuId);
    } else {
      newExpanded.add(menuId);
    }
    setExpandedMenus(newExpanded);
  };

  // Abrir editor para novo menu
  const openNewMenu = (parentId: string | null = null) => {
    setEditingMenu(null);
    setParentMenuId(parentId);
    setEditorOpen(true);
  };

  // Abrir editor para editar
  const openEditMenu = (menu: DynamicMenu) => {
    setEditingMenu(menu);
    setParentMenuId(menu.parent_menu_id);
    setEditorOpen(true);
  };

  // Confirmar exclusão
  const confirmDelete = (menu: DynamicMenu) => {
    setMenuToDelete(menu);
    setDeleteDialogOpen(true);
  };

  // Executar exclusão
  const handleDelete = async () => {
    if (menuToDelete) {
      await deleteMenu(menuToDelete.id);
      setDeleteDialogOpen(false);
      setMenuToDelete(null);
    }
  };

  // Renderizar item do menu recursivamente
  const renderMenuItem = (menu: DynamicMenu, level: number = 0) => {
    const children = getChildMenus(menu.id);
    const hasChildren = children.length > 0;
    const isExpanded = expandedMenus.has(menu.id);
    const TypeIcon = TYPE_ICONS[menu.menu_type as DynamicMenuType] || MessageSquare;

    return (
      <div key={menu.id} className="border-b last:border-b-0">
        <div
          className={cn(
            "flex items-center gap-2 p-3 hover:bg-muted/50 transition-colors",
            !menu.is_active && "opacity-50"
          )}
          style={{ paddingLeft: `${(level * 24) + 12}px` }}
        >
          {/* Expand/Collapse */}
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6 shrink-0"
            onClick={() => hasChildren && toggleExpand(menu.id)}
            disabled={!hasChildren}
          >
            {hasChildren ? (
              isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />
            ) : (
              <div className="h-4 w-4" />
            )}
          </Button>

          {/* Emoji/Icon */}
          <span className="text-lg shrink-0">
            {menu.emoji || <TypeIcon className="h-4 w-4 text-muted-foreground" />}
          </span>

          {/* Título e Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-medium truncate">{menu.title}</span>
              {menu.is_root && (
                <Badge variant="default" className="text-xs">
                  <Star className="h-3 w-3 mr-1" />
                  Inicial
                </Badge>
              )}
              <Badge variant="outline" className="text-xs">
                {TYPE_LABELS[menu.menu_type as DynamicMenuType]}
              </Badge>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="font-mono">{menu.menu_key}</span>
              {menu.section_title && (
                <>
                  <span>•</span>
                  <span>Seção: {menu.section_title}</span>
                </>
              )}
              {hasChildren && (
                <>
                  <span>•</span>
                  <span>{children.length} submenu(s)</span>
                </>
              )}
            </div>
          </div>

          {/* Ativo */}
          <Switch
            checked={menu.is_active}
            onCheckedChange={(checked) => toggleActive(menu.id, checked)}
            className="shrink-0"
          />

          {/* Ações */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => openEditMenu(menu)}>
                <Edit className="h-4 w-4 mr-2" />
                Editar
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => openNewMenu(menu.id)}>
                <Plus className="h-4 w-4 mr-2" />
                Adicionar Submenu
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => duplicateMenu(menu.id)}>
                <Copy className="h-4 w-4 mr-2" />
                Duplicar
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {!menu.is_root && (
                <DropdownMenuItem onClick={() => setAsRoot(menu.id)}>
                  <Star className="h-4 w-4 mr-2" />
                  Definir como Inicial
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem 
                onClick={() => confirmDelete(menu)}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Excluir
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Filhos */}
        {hasChildren && isExpanded && (
          <div className="bg-muted/20">
            {children
              .sort((a, b) => a.display_order - b.display_order)
              .map(child => renderMenuItem(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-72" />
        </CardHeader>
        <CardContent className="space-y-2">
          {[1, 2, 3].map(i => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  // Menus raiz (sem parent)
  const rootMenus = menus
    .filter(m => m.parent_menu_id === null)
    .sort((a, b) => a.display_order - b.display_order);

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <FolderTree className="h-5 w-5" />
              Menus Dinâmicos
            </CardTitle>
            <CardDescription>
              Crie e gerencie a estrutura de menus do seu chatbot
            </CardDescription>
          </div>
          <Button onClick={() => openNewMenu(null)}>
            <Plus className="h-4 w-4 mr-2" />
            Novo Menu
          </Button>
        </CardHeader>
        <CardContent>
          {rootMenus.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <FolderTree className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p className="font-medium">Nenhum menu criado</p>
              <p className="text-sm">Clique em "Novo Menu" para começar</p>
              <Button className="mt-4" onClick={() => openNewMenu(null)}>
                <Plus className="h-4 w-4 mr-2" />
                Criar Primeiro Menu
              </Button>
            </div>
          ) : (
            <div className="border rounded-lg overflow-hidden">
              {rootMenus.map(menu => renderMenuItem(menu))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Editor Modal */}
      <DynamicMenuEditor
        open={editorOpen}
        onOpenChange={setEditorOpen}
        menu={editingMenu}
        parentMenuId={parentMenuId}
        menus={menus}
        onSave={createMenu}
        onUpdate={(id, data) => updateMenu({ id, updates: data })}
        isSaving={isCreating || isUpdating}
      />

      {/* Delete Confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Menu</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir o menu "{menuToDelete?.title}"?
              {getChildMenus(menuToDelete?.id || '').length > 0 && (
                <span className="block mt-2 text-destructive font-medium">
                  ⚠️ Todos os submenus também serão excluídos!
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? 'Excluindo...' : 'Excluir'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
