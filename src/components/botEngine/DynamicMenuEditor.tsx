/**
 * BOT ENGINE - Editor de Menu Dinâmico
 * Formulário para criar/editar menus e submenus
 */

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import type { DynamicMenu, CreateDynamicMenu, DynamicMenuType, MENU_TYPE_OPTIONS } from '@/lib/botEngine/menuTypes';
import { useBotEngineFlows } from '@/hooks/useBotEngineFlows';

interface DynamicMenuEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  menu: DynamicMenu | null;
  parentMenuId: string | null;
  menus: DynamicMenu[];
  onSave: (data: CreateDynamicMenu) => Promise<unknown>;
  onUpdate: (id: string, data: Partial<CreateDynamicMenu>) => Promise<unknown>;
  isSaving: boolean;
}

const MENU_TYPES: { value: DynamicMenuType; label: string; description: string }[] = [
  { value: 'submenu', label: 'Abrir Submenu', description: 'Navega para outro menu' },
  { value: 'flow', label: 'Executar Fluxo', description: 'Inicia um fluxo do bot' },
  { value: 'command', label: 'Executar Comando', description: 'Executa um comando específico' },
  { value: 'link', label: 'Abrir Link', description: 'Envia um link externo' },
  { value: 'message', label: 'Enviar Mensagem', description: 'Envia uma mensagem de texto' },
];

export function DynamicMenuEditor({
  open,
  onOpenChange,
  menu,
  parentMenuId,
  menus,
  onSave,
  onUpdate,
  isSaving,
}: DynamicMenuEditorProps) {
  const { flows } = useBotEngineFlows();
  const isEditing = !!menu;

  // Form state
  const [menuKey, setMenuKey] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [emoji, setEmoji] = useState('');
  const [sectionTitle, setSectionTitle] = useState('');
  const [menuType, setMenuType] = useState<DynamicMenuType>('submenu');
  const [targetMenuKey, setTargetMenuKey] = useState('');
  const [targetFlowId, setTargetFlowId] = useState('');
  const [targetCommand, setTargetCommand] = useState('');
  const [targetUrl, setTargetUrl] = useState('');
  const [targetMessage, setTargetMessage] = useState('');
  const [displayOrder, setDisplayOrder] = useState(0);
  const [isActive, setIsActive] = useState(true);
  const [isRoot, setIsRoot] = useState(false);
  const [showBackButton, setShowBackButton] = useState(true);
  const [backButtonText, setBackButtonText] = useState('⬅️ Voltar');
  const [headerMessage, setHeaderMessage] = useState('');
  const [footerMessage, setFooterMessage] = useState('');

  // Reset form when menu changes
  useEffect(() => {
    if (menu) {
      setMenuKey(menu.menu_key);
      setTitle(menu.title);
      setDescription(menu.description || '');
      setEmoji(menu.emoji || '');
      setSectionTitle(menu.section_title || '');
      setMenuType(menu.menu_type as DynamicMenuType);
      setTargetMenuKey(menu.target_menu_key || '');
      setTargetFlowId(menu.target_flow_id || '');
      setTargetCommand(menu.target_command || '');
      setTargetUrl(menu.target_url || '');
      setTargetMessage(menu.target_message || '');
      setDisplayOrder(menu.display_order);
      setIsActive(menu.is_active);
      setIsRoot(menu.is_root);
      setShowBackButton(menu.show_back_button);
      setBackButtonText(menu.back_button_text || '⬅️ Voltar');
      setHeaderMessage(menu.header_message || '');
      setFooterMessage(menu.footer_message || '');
    } else {
      // Reset para novo
      setMenuKey('');
      setTitle('');
      setDescription('');
      setEmoji('');
      setSectionTitle('');
      setMenuType('submenu');
      setTargetMenuKey('');
      setTargetFlowId('');
      setTargetCommand('');
      setTargetUrl('');
      setTargetMessage('');
      setDisplayOrder(0);
      setIsActive(true);
      setIsRoot(false);
      setShowBackButton(true);
      setBackButtonText('⬅️ Voltar');
      setHeaderMessage('');
      setFooterMessage('');
    }
  }, [menu, open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const data: CreateDynamicMenu = {
      parent_menu_id: parentMenuId,
      menu_key: menuKey.toLowerCase().replace(/\s+/g, '_'),
      title,
      description: description || null,
      emoji: emoji || null,
      section_title: sectionTitle || null,
      menu_type: menuType,
      target_menu_key: menuType === 'submenu' ? targetMenuKey || null : null,
      target_flow_id: menuType === 'flow' ? targetFlowId || null : null,
      target_command: menuType === 'command' ? targetCommand || null : null,
      target_url: menuType === 'link' ? targetUrl || null : null,
      target_message: menuType === 'message' ? targetMessage || null : null,
      display_order: displayOrder,
      is_active: isActive,
      is_root: isRoot,
      show_back_button: showBackButton,
      back_button_text: backButtonText || null,
      header_message: headerMessage || null,
      footer_message: footerMessage || null,
    };

    try {
      if (isEditing) {
        await onUpdate(menu.id, data);
      } else {
        await onSave(data);
      }
      onOpenChange(false);
    } catch (error) {
      // Error handled by hook
    }
  };

  // Menus disponíveis para submenu (excluindo o próprio)
  const availableMenus = menus.filter(m => !menu || m.id !== menu.id);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? 'Editar Menu' : 'Novo Menu'}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Identificação */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="menu_key">Chave do Menu *</Label>
              <Input
                id="menu_key"
                value={menuKey}
                onChange={(e) => setMenuKey(e.target.value)}
                placeholder="ex: planos, suporte"
                required
              />
              <p className="text-xs text-muted-foreground">
                Identificador único (será convertido para minúsculas)
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="title">Título *</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="ex: Ver Planos"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="emoji">Emoji</Label>
              <Input
                id="emoji"
                value={emoji}
                onChange={(e) => setEmoji(e.target.value)}
                placeholder="ex: 📋"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="section_title">Título da Seção</Label>
              <Input
                id="section_title"
                value={sectionTitle}
                onChange={(e) => setSectionTitle(e.target.value)}
                placeholder="ex: Não sou cliente"
              />
              <p className="text-xs text-muted-foreground">
                Agrupa itens na lista do WhatsApp
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Descrição</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Descrição exibida no menu"
              rows={2}
            />
          </div>

          {/* Tipo e Destino */}
          <div className="space-y-4 p-4 border rounded-lg bg-muted/30">
            <Label>Tipo de Ação</Label>
            <Select value={menuType} onValueChange={(v) => setMenuType(v as DynamicMenuType)}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione o tipo" />
              </SelectTrigger>
              <SelectContent>
                {MENU_TYPES.map(type => (
                  <SelectItem key={type.value} value={type.value}>
                    <div>
                      <span className="font-medium">{type.label}</span>
                      <span className="text-xs text-muted-foreground ml-2">
                        - {type.description}
                      </span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Campos condicionais baseados no tipo */}
            {menuType === 'submenu' && (
              <div className="space-y-2">
                <Label>Menu Destino</Label>
                <Select value={targetMenuKey} onValueChange={setTargetMenuKey}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o menu" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableMenus.map(m => (
                      <SelectItem key={m.id} value={m.menu_key}>
                        {m.emoji} {m.title} ({m.menu_key})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {menuType === 'flow' && (
              <div className="space-y-2">
                <Label>Fluxo do Bot</Label>
                <Select value={targetFlowId} onValueChange={setTargetFlowId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o fluxo" />
                  </SelectTrigger>
                  <SelectContent>
                    {flows.map(f => (
                      <SelectItem key={f.id} value={f.id}>
                        {f.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {menuType === 'command' && (
              <div className="space-y-2">
                <Label>Comando</Label>
                <Input
                  value={targetCommand}
                  onChange={(e) => setTargetCommand(e.target.value)}
                  placeholder="ex: /teste, /renovar"
                />
              </div>
            )}

            {menuType === 'link' && (
              <div className="space-y-2">
                <Label>URL</Label>
                <Input
                  value={targetUrl}
                  onChange={(e) => setTargetUrl(e.target.value)}
                  placeholder="https://..."
                  type="url"
                />
              </div>
            )}

            {menuType === 'message' && (
              <div className="space-y-2">
                <Label>Mensagem</Label>
                <Textarea
                  value={targetMessage}
                  onChange={(e) => setTargetMessage(e.target.value)}
                  placeholder="Mensagem a ser enviada..."
                  rows={3}
                />
              </div>
            )}
          </div>

          {/* Configurações */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="display_order">Ordem de Exibição</Label>
              <Input
                id="display_order"
                type="number"
                value={displayOrder}
                onChange={(e) => setDisplayOrder(Number(e.target.value))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="back_button_text">Texto do Botão Voltar</Label>
              <Input
                id="back_button_text"
                value={backButtonText}
                onChange={(e) => setBackButtonText(e.target.value)}
                placeholder="⬅️ Voltar"
              />
            </div>
          </div>

          {/* Mensagens do menu */}
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="header_message">Mensagem de Cabeçalho</Label>
              <Textarea
                id="header_message"
                value={headerMessage}
                onChange={(e) => setHeaderMessage(e.target.value)}
                placeholder="Mensagem exibida no topo do menu"
                rows={2}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="footer_message">Mensagem de Rodapé</Label>
              <Textarea
                id="footer_message"
                value={footerMessage}
                onChange={(e) => setFooterMessage(e.target.value)}
                placeholder="Mensagem exibida no rodapé"
                rows={2}
              />
            </div>
          </div>

          {/* Switches */}
          <div className="flex flex-wrap gap-6">
            <div className="flex items-center gap-2">
              <Switch
                id="is_active"
                checked={isActive}
                onCheckedChange={setIsActive}
              />
              <Label htmlFor="is_active">Ativo</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                id="is_root"
                checked={isRoot}
                onCheckedChange={setIsRoot}
              />
              <Label htmlFor="is_root">Menu Inicial (Raiz)</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                id="show_back_button"
                checked={showBackButton}
                onCheckedChange={setShowBackButton}
              />
              <Label htmlFor="show_back_button">Mostrar Voltar</Label>
            </div>
          </div>

          {/* Ações */}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isSaving}>
              {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {isEditing ? 'Salvar' : 'Criar Menu'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
