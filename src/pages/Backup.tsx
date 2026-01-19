import { useState, useRef, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { Navigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { 
  Database, 
  Download, 
  Upload, 
  AlertTriangle, 
  CheckCircle, 
  Rocket,
  FileJson,
  Trash2,
  Shield,
  Users,
  Server,
  CreditCard,
  MessageSquare,
  Ticket,
  Receipt,
  UserPlus,
  History,
  Package,
  FolderOpen
} from 'lucide-react';

interface CleanBackupData {
  version: string;
  type?: string;
  format?: string;
  timestamp?: string;
  description?: string;
  exported_at?: string;
  exported_by: string;
  stats: Record<string, number>;
  data: {
    profiles?: any[];
    clients?: any[];
    servers?: any[];
    plans?: any[];
    external_apps?: any[];
    client_external_apps?: any[];
    whatsapp_templates?: any[];
    shared_panels?: any[];
    panel_clients?: any[];
    bills_to_pay?: any[];
    coupons?: any[];
    client_categories?: any[];
    custom_products?: any[];
    referrals?: any[];
    message_history?: any[];
    monthly_profits?: any[];
    server_apps?: any[];
    client_premium_accounts?: any[];
    app_settings?: any[];
    default_server_icons?: any[];
  };
}

const moduleConfig = [
  { key: 'profiles', label: 'Vendedores', icon: Users, description: 'Perfis de vendedores (exceto admin)' },
  { key: 'clients', label: 'Clientes', icon: Users, description: 'Todos os clientes' },
  { key: 'servers', label: 'Servidores', icon: Server, description: 'Servidores e configurações' },
  { key: 'plans', label: 'Planos', icon: CreditCard, description: 'Planos de assinatura' },
  { key: 'external_apps', label: 'Apps Externos', icon: Package, description: 'Aplicativos externos' },
  { key: 'client_external_apps', label: 'Apps de Clientes', icon: Package, description: 'Apps vinculados a clientes' },
  { key: 'whatsapp_templates', label: 'Templates WhatsApp', icon: MessageSquare, description: 'Modelos de mensagens' },
  { key: 'shared_panels', label: 'Painéis Compartilhados', icon: Server, description: 'Painéis de revenda' },
  { key: 'panel_clients', label: 'Clientes de Painel', icon: Users, description: 'Clientes nos painéis' },
  { key: 'bills_to_pay', label: 'Contas a Pagar', icon: Receipt, description: 'Registro de contas' },
  { key: 'coupons', label: 'Cupons', icon: Ticket, description: 'Cupons de desconto' },
  { key: 'client_categories', label: 'Categorias', icon: FolderOpen, description: 'Categorias de clientes' },
  { key: 'custom_products', label: 'Produtos Personalizados', icon: Package, description: 'Produtos customizados' },
  { key: 'referrals', label: 'Indicações', icon: UserPlus, description: 'Sistema de indicações' },
  { key: 'message_history', label: 'Histórico de Mensagens', icon: History, description: 'Pode ser muito grande!' },
  { key: 'monthly_profits', label: 'Lucros Mensais', icon: CreditCard, description: 'Histórico de lucros' },
  { key: 'server_apps', label: 'Apps de Servidor', icon: Package, description: 'Apps por servidor' },
  { key: 'client_premium_accounts', label: 'Contas Premium', icon: CreditCard, description: 'Contas premium de clientes' },
];

export default function Backup() {
  const { user, isAdmin } = useAuth();
  const [isExporting, setIsExporting] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [restoreDialogOpen, setRestoreDialogOpen] = useState(false);
  const [confirmCleanDialogOpen, setConfirmCleanDialogOpen] = useState(false);
  const [restoreMode, setRestoreMode] = useState<'append' | 'replace'>('append');
  const [backupFile, setBackupFile] = useState<CleanBackupData | null>(null);
  const [restoreResult, setRestoreResult] = useState<{ 
    restored: Record<string, number>; 
    errors: string[];
    warnings?: string[];
  } | null>(null);

  const [importJobId, setImportJobId] = useState<string | null>(null);
  const [importProgress, setImportProgress] = useState(0);
  const [importStatus, setImportStatus] = useState<string | null>(null);
  const [importProcessed, setImportProcessed] = useState(0);
  const [importTotal, setImportTotal] = useState(0);

  const [selectedModules, setSelectedModules] = useState<string[]>(
    moduleConfig.map(m => m.key)
  );
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!importJobId || !isRestoring) return;

    const channel = supabase
      .channel(`backup-import-job:${importJobId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'backup_import_jobs',
          filter: `id=eq.${importJobId}`,
        },
        (payload) => {
          const row = payload.new as any;
          if (!row) return;
          if (typeof row.progress === 'number') setImportProgress(row.progress);
          if (typeof row.status === 'string') setImportStatus(row.status);
          if (typeof row.processed_items === 'number') setImportProcessed(row.processed_items);
          if (typeof row.total_items === 'number') setImportTotal(row.total_items);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [importJobId, isRestoring]);

  if (!isAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  const handleExportCleanBackup = async () => {
    setIsExporting(true);
    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;
      const token = sessionData.session?.access_token;
      if (!token) throw new Error('Sessão inválida. Faça login novamente.');

      const { data, error } = await supabase.functions.invoke('complete-backup-export', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (error) throw error;

      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `backup-completo-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success('Backup completo exportado com sucesso!');
    } catch (error) {
      console.error('Erro ao exportar:', error);
      toast.error((error as { message?: string })?.message || 'Erro ao exportar backup');
    } finally {
      setIsExporting(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target?.result as string) as CleanBackupData;
        
        // Accept multiple backup formats - be very flexible
        const hasValidData = data && data.data && typeof data.data === 'object';
        const isNewFormat = data.type === 'complete_clean_backup';
        const isLegacyV3 = data.version === '3.0-complete-clean';
        const isCleanLogical = data.format === 'clean-logical-keys';
        const hasProfiles = data.data?.profiles?.length > 0 || data.data?.clients?.length > 0;
        
        const isValidFormat = hasValidData && (isNewFormat || isLegacyV3 || isCleanLogical || hasProfiles);
        
        if (!isValidFormat) {
          console.error('Invalid backup format:', { hasValidData, isNewFormat, isLegacyV3, isCleanLogical, hasProfiles, keys: Object.keys(data || {}) });
          throw new Error('Formato de backup inválido. O arquivo não contém dados válidos para importação.');
        }
        
        // Ensure version is set for Edge Function validation
        if (!data.version) {
          data.version = '3.0-complete-clean';
        }
        
        // Normalize legacy format fields
        if (!data.exported_at && data.timestamp) {
          data.exported_at = data.timestamp;
        }
        if (!data.type) {
          data.type = 'complete_clean_backup';
        }
        
        setBackupFile(data);
        setSelectedModules(Object.keys(data.data).filter(k => data.data[k as keyof typeof data.data]?.length > 0));
        setRestoreDialogOpen(true);
      } catch (err) {
        toast.error((err as Error).message || 'Arquivo de backup inválido');
      }
    };
    reader.readAsText(file);
    
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleRestore = async () => {
    if (!backupFile) return;

    if (restoreMode === 'replace') {
      setConfirmCleanDialogOpen(true);
      return;
    }

    await executeRestore();
  };

  const executeRestore = async () => {
    if (!backupFile || !user) return;

    let jobIdForError: string | null = null;

    setConfirmCleanDialogOpen(false);
    setIsRestoring(true);
    setRestoreResult(null);
    setImportProgress(0);
    setImportStatus('queued');
    setImportProcessed(0);
    setImportTotal(0);

    try {
      // Create an import job to track progress (0-100%)
      const { data: job, error: jobError } = await supabase
        .from('backup_import_jobs')
        .insert({
          admin_id: user.id,
          mode: restoreMode,
          modules: selectedModules,
          status: 'queued',
          progress: 0,
          total_items: 0,
          processed_items: 0,
        })
        .select('id')
        .single();

      if (jobError) throw jobError;
      setImportJobId(job.id);
      jobIdForError = job.id;

      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;
      const token = sessionData.session?.access_token;
      if (!token) throw new Error('Sessão inválida. Faça login novamente.');

      const { data, error } = await supabase.functions.invoke('complete-backup-import', {
        body: {
          backup: backupFile,
          mode: restoreMode,
          modules: selectedModules,
          jobId: job.id,
        },
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (error) {
        let message = (error as any)?.message || 'Erro ao restaurar backup';

        // Try to extract JSON/text body returned by the function for a clearer message
        try {
          const response: Response | undefined = (error as any)?.context?.response;
          if (response) {
            const text = await response.text();
            try {
              const json = JSON.parse(text);
              message = json?.error || json?.message || message;
            } catch {
              if (text) message = text;
            }
          }
        } catch {
          // ignore
        }

        throw new Error(message);
      }

      setRestoreResult(data);

      const totalRestored = Object.values(data.restored || {}).reduce((a: number, b: unknown) => a + (b as number), 0);

      if (data.errors?.length > 0) {
        toast.warning(`Backup restaurado parcialmente: ${totalRestored} itens. ${data.errors.length} erros.`);
      } else {
        toast.success(`Backup restaurado com sucesso! ${totalRestored} itens importados.`);
      }
    } catch (error) {
      console.error('Erro ao restaurar:', error);

      let message = (error as { message?: string })?.message || 'Erro ao restaurar backup';

      // If the function timed out/crashed, try to read the job row to show the last backend error
      try {
        if (jobIdForError) {
          const { data: jobRow } = await supabase
            .from('backup_import_jobs')
            .select('status, progress, errors')
            .eq('id', jobIdForError)
            .single();

          const jobErrors = (jobRow as any)?.errors;
          if (Array.isArray(jobErrors) && jobErrors.length > 0) {
            message = String(jobErrors[0]);
          }
        }
      } catch {
        // ignore
      }

      toast.error(message);
    } finally {
      setIsRestoring(false);
    }
  };

  const closeRestoreDialog = () => {
    if (isRestoring) return;
    setRestoreDialogOpen(false);
    setBackupFile(null);
    setRestoreResult(null);
    setSelectedModules(moduleConfig.map(m => m.key));
    setImportJobId(null);
    setImportProgress(0);
    setImportStatus(null);
    setImportProcessed(0);
    setImportTotal(0);
  };

  const toggleModule = (key: string) => {
    setSelectedModules(prev => 
      prev.includes(key) 
        ? prev.filter(k => k !== key)
        : [...prev, key]
    );
  };

  const selectAllModules = () => {
    const available = Object.keys(backupFile?.data || {}).filter(
      k => (backupFile?.data[k as keyof typeof backupFile.data] as any)?.length > 0
    );
    setSelectedModules(available);
  };

  const deselectAllModules = () => {
    setSelectedModules([]);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Backup Limpo Completo</h1>
        <p className="text-muted-foreground">Sistema de backup para migração entre projetos (Admin)</p>
      </div>

      {/* Main Backup Card */}
      <Card className="border-primary/50 bg-gradient-to-br from-primary/5 to-primary/10">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-primary">
            <Shield className="h-6 w-6" />
            Backup Completo para Deploy
          </CardTitle>
          <CardDescription>
            Exporta todos os dados sem IDs internos, usando chaves lógicas (emails, nomes) para relacionamentos
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="p-4 bg-background/50 rounded-lg border">
              <h3 className="font-semibold flex items-center gap-2 mb-2">
                <FileJson className="h-4 w-4 text-primary" />
                Exportação Limpa
              </h3>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• Sem UUIDs internos do banco</li>
                <li>• Relacionamentos via email/nome</li>
                <li>• Datas em formato ISO 8601</li>
                <li>• Pronto para importar em outro projeto</li>
              </ul>
            </div>
            <div className="p-4 bg-background/50 rounded-lg border">
              <h3 className="font-semibold flex items-center gap-2 mb-2">
                <Database className="h-4 w-4 text-primary" />
                Importação Inteligente
              </h3>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• Cria novos UUIDs automaticamente</li>
                <li>• Mapeia relacionamentos por chaves</li>
                <li>• Modo adicionar ou substituir</li>
                <li>• Preserva o admin atual</li>
              </ul>
            </div>
          </div>

          <div className="flex items-start gap-2 p-3 bg-warning/10 rounded-lg border border-warning/30">
            <AlertTriangle className="h-5 w-5 text-warning flex-shrink-0 mt-0.5" />
            <p className="text-sm text-muted-foreground">
              <strong>Importante:</strong> Este backup exclui automaticamente o admin atual. 
              Ao importar em outro projeto, apenas os vendedores e seus dados serão restaurados.
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Export Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Download className="h-5 w-5 text-primary" />
              Exportar Backup Completo
            </CardTitle>
            <CardDescription>
              Baixe todos os dados em formato JSON limpo
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-sm text-muted-foreground space-y-2">
              <p>O backup inclui:</p>
              <div className="grid grid-cols-2 gap-1 text-xs">
                {moduleConfig.slice(0, 10).map(m => (
                  <div key={m.key} className="flex items-center gap-1">
                    <m.icon className="h-3 w-3" />
                    <span>{m.label}</span>
                  </div>
                ))}
                <span className="text-muted-foreground">+ mais...</span>
              </div>
            </div>
            <Button onClick={handleExportCleanBackup} disabled={isExporting} className="w-full">
              <Download className="h-4 w-4 mr-2" />
              {isExporting ? 'Exportando...' : 'Exportar Backup Completo'}
            </Button>
          </CardContent>
        </Card>

        {/* Import Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5 text-primary" />
              Importar Backup
            </CardTitle>
            <CardDescription>
              Restaure dados de um arquivo de backup limpo
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-start gap-2 p-3 bg-destructive/10 rounded-lg border border-destructive/30">
              <Trash2 className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
              <p className="text-sm text-muted-foreground">
                <strong>Modo Substituir:</strong> Limpa todos os dados existentes (exceto admin) antes de importar.
              </p>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              onChange={handleFileSelect}
              className="hidden"
            />
            <Button 
              variant="outline" 
              onClick={() => fileInputRef.current?.click()}
              className="w-full"
            >
              <Upload className="h-4 w-4 mr-2" />
              Selecionar Arquivo de Backup
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Database Info */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Tabelas Suportadas
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {moduleConfig.map(m => (
              <Badge key={m.key} variant="secondary" className="flex items-center gap-1">
                <m.icon className="h-3 w-3" />
                {m.label}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Restore Dialog */}
      <Dialog open={restoreDialogOpen} onOpenChange={setRestoreDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5 text-primary" />
              Importar Backup Completo
            </DialogTitle>
            <DialogDescription>
              {restoreResult ? 'Resultado da importação' : 'Configure a importação dos dados'}
            </DialogDescription>
          </DialogHeader>

          {!restoreResult ? (
            <>
              {backupFile && (
                <div className="flex-1 overflow-hidden flex flex-col space-y-4">
                  {/* Backup Info */}
                  <div className="p-3 bg-muted rounded-lg text-sm">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <span className="text-muted-foreground">Versão:</span>
                        <span className="ml-2 font-medium">{backupFile.version}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Tipo:</span>
                        <Badge variant="outline" className="ml-2">{backupFile.type}</Badge>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Data:</span>
                        <span className="ml-2">{new Date(backupFile.exported_at || backupFile.timestamp || '').toLocaleString('pt-BR')}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Por:</span>
                        <span className="ml-2">{backupFile.exported_by}</span>
                      </div>
                    </div>
                  </div>

                  {/* Mode Selection */}
                  <div className="space-y-3">
                    <Label className="font-semibold">Modo de importação:</Label>
                    <RadioGroup value={restoreMode} onValueChange={(v) => setRestoreMode(v as 'append' | 'replace')}>
                      <div className="flex items-start gap-3 p-3 border rounded-lg">
                        <RadioGroupItem value="append" id="append" className="mt-1" />
                        <div>
                          <Label htmlFor="append" className="font-medium cursor-pointer">Adicionar</Label>
                          <p className="text-sm text-muted-foreground">
                            Adiciona os dados do backup aos dados existentes
                          </p>
                        </div>
                      </div>
                      <div className="flex items-start gap-3 p-3 border border-destructive/50 rounded-lg bg-destructive/5">
                        <RadioGroupItem value="replace" id="replace" className="mt-1" />
                        <div>
                          <Label htmlFor="replace" className="font-medium text-destructive cursor-pointer">
                            Substituir (Limpar Tudo)
                          </Label>
                          <p className="text-sm text-muted-foreground">
                            Remove todos os dados existentes (exceto admin) e importa apenas o backup
                          </p>
                        </div>
                      </div>
                    </RadioGroup>
                  </div>

                  {/* Module Selection */}
                  <div className="space-y-3 flex-1 overflow-hidden flex flex-col">
                    <div className="flex items-center justify-between">
                      <Label className="font-semibold">Módulos a importar:</Label>
                      <div className="flex gap-2">
                        <Button variant="ghost" size="sm" onClick={selectAllModules}>
                          Todos
                        </Button>
                        <Button variant="ghost" size="sm" onClick={deselectAllModules}>
                          Nenhum
                        </Button>
                      </div>
                    </div>
                    
                    <ScrollArea className="flex-1 max-h-[200px]">
                      <div className="grid grid-cols-2 gap-2 pr-4">
                        {moduleConfig.map(m => {
                          const count = backupFile.stats?.[m.key] || 0;
                          const hasData = count > 0;
                          
                          return (
                            <div 
                              key={m.key} 
                              className={`flex items-center gap-2 p-2 border rounded-lg ${
                                hasData ? '' : 'opacity-50'
                              }`}
                            >
                              <Checkbox 
                                id={m.key}
                                checked={selectedModules.includes(m.key)}
                                onCheckedChange={() => toggleModule(m.key)}
                                disabled={!hasData}
                              />
                              <div className="flex-1 min-w-0">
                                <Label 
                                  htmlFor={m.key} 
                                  className="text-sm font-medium cursor-pointer flex items-center gap-1"
                                >
                                  <m.icon className="h-3 w-3" />
                                  {m.label}
                                </Label>
                              </div>
                              <Badge variant={hasData ? "default" : "secondary"} className="text-xs">
                                {count}
                              </Badge>
                            </div>
                          );
                        })}
                      </div>
                    </ScrollArea>
                  </div>

                  {/* Summary */}
                  <div className="p-3 bg-primary/10 rounded-lg text-sm">
                    <strong>Resumo:</strong> {selectedModules.length} módulos selecionados, 
                    {' '}{Object.entries(backupFile.stats || {})
                      .filter(([k]) => selectedModules.includes(k))
                      .reduce((sum, [, v]) => sum + (v as number), 0)} itens a importar
                  </div>
                </div>
              )}

              {isRestoring && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Progresso:</span>
                    <span className="font-medium">{importProgress}%</span>
                  </div>
                  <Progress value={importProgress} />
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>Status: {importStatus || '...'} </span>
                    <span>
                      {importTotal > 0 ? `${importProcessed}/${importTotal}` : ''}
                    </span>
                  </div>
                </div>
              )}

              <DialogFooter>
                <Button variant="outline" onClick={closeRestoreDialog} disabled={isRestoring}>
                  Cancelar
                </Button>
                <Button 
                  onClick={handleRestore} 
                  disabled={isRestoring || selectedModules.length === 0}
                  variant={restoreMode === 'replace' ? 'destructive' : 'default'}
                >
                  {isRestoring ? `Importando... ${importProgress}%` : restoreMode === 'replace' ? 'Limpar e Importar' : 'Importar'}
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <div className="space-y-4">
                <div className="flex items-center gap-2 p-3 bg-success/10 rounded-lg border border-success/30">
                  <CheckCircle className="h-5 w-5 text-success" />
                  <span className="text-sm font-medium">Importação concluída!</span>
                </div>

                {Object.keys(restoreResult.restored).length > 0 && (
                  <div className="p-3 bg-muted rounded-lg text-sm">
                    <strong>Itens importados:</strong>
                    <div className="grid grid-cols-2 gap-1 mt-2">
                      {Object.entries(restoreResult.restored).map(([key, value]) => {
                        const module = moduleConfig.find(m => m.key === key);
                        return (
                          <div key={key} className="flex items-center justify-between">
                            <span className="flex items-center gap-1">
                              {module && <module.icon className="h-3 w-3" />}
                              {module?.label || key}
                            </span>
                            <Badge variant="secondary">{value}</Badge>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {restoreResult.warnings && restoreResult.warnings.length > 0 && (
                  <div className="p-3 bg-warning/10 rounded-lg text-sm border border-warning/30">
                    <strong className="text-warning">Avisos ({restoreResult.warnings.length}):</strong>
                    <ScrollArea className="max-h-24 mt-1">
                      <ul className="list-disc list-inside text-muted-foreground">
                        {restoreResult.warnings.slice(0, 10).map((w, i) => (
                          <li key={i} className="text-xs">{w}</li>
                        ))}
                        {restoreResult.warnings.length > 10 && (
                          <li className="text-xs">...e mais {restoreResult.warnings.length - 10}</li>
                        )}
                      </ul>
                    </ScrollArea>
                  </div>
                )}

                {restoreResult.errors?.length > 0 && (
                  <div className="p-3 bg-destructive/10 rounded-lg text-sm border border-destructive/30">
                    <strong className="text-destructive">Erros ({restoreResult.errors.length}):</strong>
                    <ScrollArea className="max-h-24 mt-1">
                      <ul className="list-disc list-inside text-muted-foreground">
                        {restoreResult.errors.slice(0, 10).map((err, i) => (
                          <li key={i} className="text-xs">{err}</li>
                        ))}
                        {restoreResult.errors.length > 10 && (
                          <li className="text-xs">...e mais {restoreResult.errors.length - 10}</li>
                        )}
                      </ul>
                    </ScrollArea>
                  </div>
                )}
              </div>

              <DialogFooter>
                <Button onClick={closeRestoreDialog}>
                  Fechar
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Confirm Clean Dialog */}
      <Dialog open={confirmCleanDialogOpen} onOpenChange={setConfirmCleanDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="h-5 w-5" />
              Confirmar Limpeza Total
            </DialogTitle>
            <DialogDescription>
              Esta ação não pode ser desfeita!
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="p-4 bg-destructive/10 rounded-lg border border-destructive/30">
              <p className="text-sm">
                Você está prestes a <strong className="text-destructive">APAGAR TODOS OS DADOS</strong> do sistema, 
                incluindo todos os vendedores, clientes, servidores, planos, etc.
              </p>
              <p className="text-sm mt-2">
                <strong>Apenas o admin atual será preservado.</strong>
              </p>
            </div>

            <div className="p-3 bg-warning/10 rounded-lg border border-warning/30">
              <p className="text-sm text-muted-foreground">
                Após a limpeza, os dados do backup selecionado serão importados.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmCleanDialogOpen(false)}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={executeRestore} disabled={isRestoring}>
              {isRestoring ? 'Processando...' : 'Confirmar e Limpar Tudo'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
