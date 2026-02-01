import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Upload, Copy, Check, AlertCircle, Loader2, Server } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';

interface ParsedServer {
  name: string;
  panel_url: string;
  icon_url: string;
  monthly_cost: number;
  notes: string;
  is_active: boolean;
  valid: boolean;
  error?: string;
}

const TEMPLATE = `STAR PLAY;https://painel.starplay.com;https://icon.com/star.png;50;Servidor principal
WPLAY;https://painel.wplay.com;;30;
AZIONIX;https://azionix.net;;45;Servidor novo`;

const TEMPLATE_HEADER = "Nome;URL Painel;URL Ícone;Custo Mensal;Notas";

export function BulkImportServers() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);
  const [inputText, setInputText] = useState('');
  const [copied, setCopied] = useState(false);
  const [parsedServers, setParsedServers] = useState<ParsedServer[]>([]);
  const [step, setStep] = useState<'input' | 'preview'>('input');

  const parseServers = (text: string): ParsedServer[] => {
    const normalizedText = text.replace(/\r\n?/g, '\n').trim();
    const lines = normalizedText.split('\n').filter(line => line.trim());

    if (lines.length === 0) return [];

    const detectDelimiter = (line: string): string => {
      const semicolonCount = (line.match(/;/g) || []).length;
      const commaCount = (line.match(/,/g) || []).length;
      const tabCount = (line.match(/\t/g) || []).length;

      if (semicolonCount > commaCount && semicolonCount > tabCount) return ';';
      if (tabCount > commaCount) return '\t';
      return ',';
    };

    const delimiter = detectDelimiter(lines[0]);
    
    const splitRow = (row: string) =>
      row.split(delimiter).map(p => (p || '').trim().replace(/^["']|["']$/g, ''));

    const normalizeHeader = (h: string) =>
      (h || '').trim().toLowerCase().replace(/\s+/g, '_').replace(/-+/g, '_');

    const firstLine = lines[0].toLowerCase();
    const hasHeader = ['nome', 'name', 'url', 'painel', 'panel', 'icone', 'icon', 'custo', 'cost', 'notas', 'notes'].some(k => firstLine.includes(k));
    
    const headers = hasHeader ? splitRow(lines[0]).map(normalizeHeader) : null;
    
    const findHeaderIndex = (aliases: string[]) => {
      if (!headers) return null;
      const aliasSet = new Set(aliases);
      const idx = headers.findIndex(h => aliasSet.has(h));
      return idx >= 0 ? idx : null;
    };
    
    const headerIdx = hasHeader ? {
      name: findHeaderIndex(['nome', 'name', 'servidor', 'server']),
      panel_url: findHeaderIndex(['url_painel', 'painel', 'panel', 'panel_url', 'url']),
      icon_url: findHeaderIndex(['url_icone', 'icone', 'icon', 'icon_url']),
      monthly_cost: findHeaderIndex(['custo', 'custo_mensal', 'cost', 'monthly_cost', 'valor']),
      notes: findHeaderIndex(['notas', 'notes', 'observações', 'observacoes', 'obs']),
      is_active: findHeaderIndex(['ativo', 'active', 'is_active', 'status']),
    } : null;
    
    const dataLines = hasHeader ? lines.slice(1) : lines;

    return dataLines.map((line, index) => {
      const parts = splitRow(line);
      const rowNumber = index + (hasHeader ? 2 : 1);
      
      let name = '';
      let panel_url = '';
      let icon_url = '';
      let monthly_cost = 0;
      let notes = '';
      let is_active = true;

      if (hasHeader && headerIdx) {
        const get = (idx: number | null) => (idx === null ? '' : (parts[idx] ?? ''));
        
        name = get(headerIdx.name);
        panel_url = get(headerIdx.panel_url);
        icon_url = get(headerIdx.icon_url);
        const costStr = get(headerIdx.monthly_cost);
        notes = get(headerIdx.notes);
        const activeStr = get(headerIdx.is_active);
        
        monthly_cost = parseFloat(costStr.replace(/[^\d.,]/g, '').replace(',', '.')) || 0;
        is_active = activeStr ? !['não', 'nao', 'no', 'false', '0', 'inativo'].includes(activeStr.toLowerCase()) : true;
      } else {
        // Positional format: Nome;URL Painel;URL Ícone;Custo Mensal;Notas
        name = parts[0] || '';
        panel_url = parts[1] || '';
        icon_url = parts[2] || '';
        const costStr = parts[3] || '';
        notes = parts[4] || '';
        
        monthly_cost = parseFloat(costStr.replace(/[^\d.,]/g, '').replace(',', '.')) || 0;
      }

      if (!name || name.length < 2) {
        return { 
          name: '', panel_url: '', icon_url: '', monthly_cost: 0, notes: '', is_active: true,
          valid: false, error: `Linha ${rowNumber}: Nome é obrigatório` 
        };
      }

      return {
        name: name.slice(0, 100),
        panel_url: panel_url.slice(0, 500),
        icon_url: icon_url.slice(0, 500),
        monthly_cost,
        notes: notes.slice(0, 500),
        is_active,
        valid: true
      };
    });
  };

  const handlePreview = () => {
    if (!inputText.trim()) {
      toast.error('Cole os dados dos servidores');
      return;
    }

    const parsed = parseServers(inputText);
    setParsedServers(parsed);
    setStep('preview');
  };

  const importMutation = useMutation({
    mutationFn: async () => {
      const validServers = parsedServers.filter(s => s.valid);
      if (validServers.length === 0) {
        throw new Error('Nenhum servidor válido para importar');
      }

      // Check for existing servers with same name
      const { data: existingServers } = await supabase
        .from('servers')
        .select('name')
        .eq('seller_id', user!.id);

      const existingNames = new Set((existingServers || []).map(s => s.name.toUpperCase()));
      
      // Filter out duplicates
      const serversToInsert = validServers.filter(s => !existingNames.has(s.name.toUpperCase()));
      const duplicatesCount = validServers.length - serversToInsert.length;

      if (serversToInsert.length === 0) {
        throw new Error('Todos os servidores já existem');
      }

      const { error } = await supabase
        .from('servers')
        .insert(serversToInsert.map(server => ({
          seller_id: user!.id,
          name: server.name,
          panel_url: server.panel_url || null,
          icon_url: server.icon_url || null,
          monthly_cost: server.monthly_cost,
          notes: server.notes || null,
          is_active: server.is_active,
        })));

      if (error) throw error;

      return { imported: serversToInsert.length, duplicates: duplicatesCount };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['servers'] });
      let message = `${result.imported} servidor(es) importado(s)!`;
      if (result.duplicates > 0) {
        message += ` ${result.duplicates} ignorado(s) (já existem).`;
      }
      toast.success(message);
      resetForm();
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const resetForm = () => {
    setInputText('');
    setParsedServers([]);
    setStep('input');
    setIsOpen(false);
  };

  const copyTemplate = async () => {
    await navigator.clipboard.writeText(`${TEMPLATE_HEADER}\n${TEMPLATE}`);
    setCopied(true);
    toast.success('Template copiado!');
    setTimeout(() => setCopied(false), 2000);
  };

  const validCount = parsedServers.filter(s => s.valid).length;
  const invalidCount = parsedServers.filter(s => !s.valid).length;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => {
      if (!open && importMutation.isPending) return;
      setIsOpen(open);
      if (!open) resetForm();
    }}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2 text-xs sm:text-sm h-8 sm:h-9 px-2 sm:px-3">
          <Upload className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
          <span className="hidden xs:inline">Importar em Massa</span>
          <span className="xs:hidden">Importar</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="w-[95vw] sm:max-w-2xl max-h-[90vh] overflow-hidden flex flex-col p-3 sm:p-6">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="flex items-center gap-2 text-base sm:text-lg">
            <Server className="h-4 w-4 sm:h-5 sm:w-5 flex-shrink-0" />
            <span className="truncate">Importar Servidores em Massa</span>
          </DialogTitle>
          <DialogDescription className="text-xs sm:text-sm">
            Cole uma lista de servidores para adicionar vários de uma vez
          </DialogDescription>
        </DialogHeader>

        {step === 'input' ? (
          <div className="space-y-3 sm:space-y-4 flex-1 flex flex-col overflow-hidden">
            <div className="space-y-2 flex-1 flex flex-col min-h-0">
              <div className="flex items-center justify-between gap-2">
                <Label className="text-sm truncate">Dados dos Servidores</Label>
                <Button variant="ghost" size="sm" onClick={copyTemplate} className="gap-1 h-7 text-[10px] sm:text-xs px-2 flex-shrink-0">
                  {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                  <span className="hidden xs:inline">Copiar Template</span>
                  <span className="xs:hidden">Template</span>
                </Button>
              </div>
              <Textarea
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder={`${TEMPLATE_HEADER}\n${TEMPLATE}`}
                className="min-h-[150px] sm:min-h-[200px] font-mono text-xs sm:text-sm flex-1"
              />
            </div>

            <Alert className="flex-shrink-0">
              <AlertCircle className="h-3.5 w-3.5 sm:h-4 sm:w-4 flex-shrink-0" />
              <AlertDescription className="text-[10px] sm:text-xs">
                <strong>Formato:</strong> Nome;URL Painel;URL Ícone;Custo Mensal;Notas
                <br />
                <strong>Delimitadores:</strong> ponto-e-vírgula (;), vírgula (,) ou tab
                <br />
                <strong>Cabeçalho:</strong> opcional, detectado automaticamente
              </AlertDescription>
            </Alert>

            <div className="flex justify-end gap-2 pt-2 flex-shrink-0">
              <Button variant="outline" onClick={resetForm} className="h-8 sm:h-9 text-xs sm:text-sm">
                Cancelar
              </Button>
              <Button onClick={handlePreview} disabled={!inputText.trim()} className="h-8 sm:h-9 text-xs sm:text-sm">
                Visualizar
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-3 sm:space-y-4 flex-1 overflow-hidden flex flex-col">
            <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap flex-shrink-0">
              <Badge variant="secondary" className="gap-1 text-[10px] sm:text-xs">
                <Check className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                {validCount} válido(s)
              </Badge>
              {invalidCount > 0 && (
                <Badge variant="destructive" className="gap-1 text-[10px] sm:text-xs">
                  <AlertCircle className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
                  {invalidCount} inválido(s)
                </Badge>
              )}
            </div>

            <ScrollArea className="flex-1 border rounded-md min-h-0">
              <div className="p-1.5 sm:p-2 space-y-1">
                {parsedServers.map((server, index) => (
                  <div
                    key={index}
                    className={`p-1.5 sm:p-2 rounded text-xs sm:text-sm flex items-center gap-1.5 sm:gap-2 ${
                      server.valid 
                        ? 'bg-muted/50' 
                        : 'bg-destructive/10 text-destructive'
                    }`}
                  >
                    {server.icon_url ? (
                      <img 
                        src={server.icon_url} 
                        alt="" 
                        className="h-7 w-7 sm:h-8 sm:w-8 rounded object-cover border border-border flex-shrink-0"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none';
                        }}
                      />
                    ) : (
                      <div className="h-7 w-7 sm:h-8 sm:w-8 rounded bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <Server className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-primary" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate text-xs sm:text-sm">{server.name || '(sem nome)'}</div>
                      {server.valid ? (
                        <div className="text-[10px] sm:text-xs text-muted-foreground truncate">
                          {server.panel_url && <span className="mr-1 sm:mr-2">Painel: {server.panel_url}</span>}
                          {server.monthly_cost > 0 && <span>R$ {server.monthly_cost.toFixed(2)}/mês</span>}
                        </div>
                      ) : (
                        <div className="text-[10px] sm:text-xs">{server.error}</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>

            <div className="flex justify-end gap-2 pt-2 flex-shrink-0">
              <Button variant="outline" onClick={() => setStep('input')} className="h-8 sm:h-9 text-xs sm:text-sm">
                Voltar
              </Button>
              <Button 
                onClick={() => importMutation.mutate()} 
                disabled={validCount === 0 || importMutation.isPending}
                className="h-8 sm:h-9 text-xs sm:text-sm"
              >
                {importMutation.isPending ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1 sm:mr-2 animate-spin" />
                    <span className="hidden xs:inline">Importando...</span>
                    <span className="xs:hidden">...</span>
                  </>
                ) : (
                  <>
                    <span className="hidden xs:inline">Importar {validCount} servidor(es)</span>
                    <span className="xs:hidden">Importar ({validCount})</span>
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
