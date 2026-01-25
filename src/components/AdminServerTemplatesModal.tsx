import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Search, Server, ExternalLink, Check, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ServerTemplate {
  id: string;
  name: string;
  name_normalized: string;
  icon_url: string;
  panel_url?: string | null;
}

interface AdminServerTemplatesModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectTemplate: (template: ServerTemplate) => void;
}

export function AdminServerTemplatesModal({
  open,
  onOpenChange,
  onSelectTemplate,
}: AdminServerTemplatesModalProps) {
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data: templates = [], isLoading, isError } = useQuery({
    queryKey: ['admin-server-templates'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('default_server_icons')
        .select('*')
        .order('name');
      if (error) throw error;
      return data as ServerTemplate[];
    },
    enabled: open,
  });

  const filteredTemplates = templates.filter(t =>
    t.name.toLowerCase().includes(search.toLowerCase())
  );

  const handleSelect = (template: ServerTemplate) => {
    setSelectedId(template.id);
    onSelectTemplate(template);
    onOpenChange(false);
    setSearch('');
    setSelectedId(null);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Server className="h-5 w-5" />
            Servidores do ADM
          </DialogTitle>
          <DialogDescription>
            Selecione um servidor para preencher automaticamente os dados
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar servidor..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        <ScrollArea className="h-[400px] pr-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          ) : isError ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <AlertCircle className="h-12 w-12 text-destructive/50 mb-2" />
              <p className="text-destructive">Erro ao carregar servidores</p>
            </div>
          ) : filteredTemplates.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Server className="h-12 w-12 text-muted-foreground/50 mb-2" />
              <p className="text-muted-foreground">
                {search ? 'Nenhum servidor encontrado' : 'Nenhum servidor cadastrado pelo ADM'}
              </p>
            </div>
          ) : (
            <div className="grid gap-2">
              {filteredTemplates.map((template) => (
                <button
                  key={template.id}
                  onClick={() => handleSelect(template)}
                  className={cn(
                    "w-full flex items-center gap-4 p-3 rounded-lg border text-left transition-all",
                    "hover:border-primary hover:bg-primary/5",
                    selectedId === template.id && "border-primary bg-primary/10"
                  )}
                >
                  {/* Icon Preview */}
                  <div className="flex-shrink-0 w-14 h-14 rounded-lg overflow-hidden bg-muted border">
                    {template.icon_url ? (
                      <img
                        src={template.icon_url}
                        alt={template.name}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none';
                        }}
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Server className="h-6 w-6 text-muted-foreground" />
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <h4 className="font-semibold truncate">{template.name}</h4>
                    {template.panel_url && (
                      <p className="text-xs text-muted-foreground truncate flex items-center gap-1 mt-0.5">
                        <ExternalLink className="h-3 w-3 flex-shrink-0" />
                        {template.panel_url}
                      </p>
                    )}
                    <div className="flex gap-2 mt-1">
                      {template.icon_url && (
                        <span className="inline-flex items-center text-xs text-green-600 dark:text-green-400">
                          ✓ Ícone
                        </span>
                      )}
                      {template.panel_url && (
                        <span className="inline-flex items-center text-xs text-green-600 dark:text-green-400">
                          ✓ Painel
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Select indicator */}
                  <div className={cn(
                    "flex-shrink-0 w-8 h-8 rounded-full border-2 flex items-center justify-center transition-colors",
                    selectedId === template.id 
                      ? "border-primary bg-primary text-primary-foreground" 
                      : "border-muted-foreground/25"
                  )}>
                    {selectedId === template.id && <Check className="h-4 w-4" />}
                  </div>
                </button>
              ))}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
