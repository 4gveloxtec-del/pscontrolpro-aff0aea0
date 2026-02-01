/**
 * Editor Simplificado de Nós do Chatbot - ULTRA SIMPLES
 * Interface intuitiva: apenas Menu Interativo com submenus hierárquicos
 * 
 * PRINCÍPIO: Clicou, cadastrou - sem opções técnicas confusas
 */

import { useState, useEffect } from 'react';
import { useBotEngineNodes } from '@/hooks/useBotEngineNodes';
import { useBotEngineFlows } from '@/hooks/useBotEngineFlows';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import {
  X,
  Check,
  Sparkles,
} from 'lucide-react';
import type { BotNode, BotNodeConfig } from '@/lib/botEngine/types';
import { MenuNodeEditor } from './MenuNodeEditor';

interface SimpleNodeEditorProps {
  flowId: string;
  flowName: string;
  onClose: () => void;
}

// Config padrão para menu interativo
const DEFAULT_MENU_CONFIG: BotNodeConfig = {
  message_type: 'menu',
  menu_title: 'Menu Principal',
  message_text: '👋 Olá! Como posso ajudar você hoje?',
  menu_header: '',
  menu_footer: '',
  show_back_button: true,
  back_button_text: '⬅️ Voltar',
  silent_on_invalid: true,
  menu_options: [],
};

export function SimpleNodeEditor({ flowId, flowName, onClose }: SimpleNodeEditorProps) {
  const { nodes, isLoading, createNode, updateNode, isUpdatingNode } = useBotEngineNodes(flowId);
  const { flows } = useBotEngineFlows();
  
  const [editingNode, setEditingNode] = useState<BotNode | null>(null);
  const [editingConfig, setEditingConfig] = useState<BotNodeConfig>({});
  const [nodeName, setNodeName] = useState('');
  const [isInitialized, setIsInitialized] = useState(false);

  // Encontrar o nó de menu principal (entry point ou primeiro nó de menu)
  const findMainMenuNode = (): BotNode | null => {
    // Primeiro, procurar entry point que seja menu
    const entryMenu = nodes.find(n => 
      n.is_entry_point && n.config?.message_type === 'menu'
    );
    if (entryMenu) return entryMenu;

    // Depois, qualquer nó de menu
    const anyMenu = nodes.find(n => n.config?.message_type === 'menu');
    if (anyMenu) return anyMenu;

    // Depois, entry point normal
    const entryPoint = nodes.find(n => n.is_entry_point);
    if (entryPoint) return entryPoint;

    // Por último, primeiro nó
    return nodes[0] || null;
  };

  // Inicializar automaticamente quando carregar
  useEffect(() => {
    if (isLoading || isInitialized) return;

    const mainNode = findMainMenuNode();
    
    if (mainNode) {
      // Já existe um nó - abrir para edição
      setEditingNode(mainNode);
      setNodeName(mainNode.name || '🌳 Menu Principal');
      setEditingConfig(mainNode.config || DEFAULT_MENU_CONFIG);
    } else {
      // Não existe nenhum nó - criar menu automaticamente
      handleCreateDefaultMenu();
    }
    
    setIsInitialized(true);
  }, [isLoading, nodes, isInitialized]);

  // Criar menu padrão automaticamente
  const handleCreateDefaultMenu = async () => {
    try {
      const newNode = await createNode({
        flow_id: flowId,
        seller_id: '',
        node_type: 'message',
        name: '🌳 Menu Principal',
        config: DEFAULT_MENU_CONFIG,
        position_x: 100,
        position_y: 100,
        is_entry_point: true,
      });
      
      if (newNode) {
        setEditingNode(newNode);
        setNodeName('🌳 Menu Principal');
        setEditingConfig(DEFAULT_MENU_CONFIG);
      }
    } catch (error) {
      console.error('[SimpleNodeEditor] Error creating default menu:', error);
      toast.error('Erro ao criar menu');
    }
  };

  // Salvar alterações
  const handleSave = async () => {
    if (!editingNode) return;

    try {
      await updateNode({
        id: editingNode.id,
        updates: {
          name: nodeName.trim() || '🌳 Menu Principal',
          config: editingConfig,
        },
      });
      toast.success('✅ Menu salvo com sucesso!');
      onClose();
    } catch (error) {
      console.error('[SimpleNodeEditor] Error saving:', error);
      toast.error('Erro ao salvar');
    }
  };

  if (isLoading || !isInitialized) {
    return (
      <Dialog open onOpenChange={onClose}>
        <DialogContent className="max-w-3xl max-h-[90vh]">
          <div className="flex flex-col items-center justify-center py-12">
            <Skeleton className="h-8 w-48 mb-4" />
            <Skeleton className="h-4 w-64 mb-8" />
            <div className="space-y-3 w-full">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-32 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="w-[calc(100vw-1rem)] sm:w-[calc(100vw-2rem)] max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2 text-base sm:text-lg">
            <Sparkles className="h-5 w-5 text-primary" />
            <span className="truncate">{flowName}</span>
          </DialogTitle>
          <DialogDescription className="text-xs sm:text-sm">
            Crie seu menu com submenus - clique para adicionar opções
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto -mx-6 px-6 space-y-4 py-2">
          {/* Nome do nó (oculto por padrão, menos confuso) */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2 text-sm">
              📝 Nome do Fluxo
            </Label>
            <Input
              placeholder="Menu Principal"
              value={nodeName}
              onChange={(e) => setNodeName(e.target.value)}
              className="text-base"
            />
          </div>

          {/* Editor de Menu - COMPONENTE PRINCIPAL */}
          <MenuNodeEditor
            config={editingConfig}
            onConfigChange={setEditingConfig}
            availableFlows={flows.map(f => ({ id: f.id, name: f.name }))}
            availableNodes={nodes.map(n => ({ id: n.id, name: n.name || 'Sem nome' }))}
          />
        </div>

        <DialogFooter className="shrink-0 pt-4 flex-col-reverse sm:flex-row gap-2 border-t">
          <Button variant="outline" onClick={onClose} className="w-full sm:w-auto">
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={isUpdatingNode} className="gap-2 w-full sm:w-auto">
            <Check className="h-4 w-4" />
            {isUpdatingNode ? 'Salvando...' : 'Salvar Menu'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
