import { useState, useRef, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { Navigate } from 'react-router-dom';
import { supabaseExternal as supabase } from '@/lib/supabase-external';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Database, Download, Upload, AlertTriangle, CheckCircle, Rocket, Settings2 } from 'lucide-react';
import { ImportClientsFromProject } from '@/components/ImportClientsFromProject';

interface BackupData {
  version: string;
  timestamp: string;
  user: { id: string; email: string };
  stats: Record<string, number>;
  data: {
    plans?: unknown[];
    servers?: unknown[];
    clients?: unknown[];
    whatsapp_templates?: unknown[];
    coupons?: unknown[];
    bills_to_pay?: unknown[];
    referrals?: unknown[];
    shared_panels?: unknown[];
    panel_clients?: unknown[];
    message_history?: unknown[];
    profiles?: unknown[];
    client_categories?: unknown[];
  };
}

export default function Backup() {
  const { user, isAdmin } = useAuth();
  const [isExporting, setIsExporting] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [isDeployExporting, setIsDeployExporting] = useState(false);
  const [restoreDialogOpen, setRestoreDialogOpen] = useState(false);
  const [deployDialogOpen, setDeployDialogOpen] = useState(false);
  const [restoreMode, setRestoreMode] = useState<'append' | 'replace'>('append');
  const [backupFile, setBackupFile] = useState<BackupData | null>(null);
  const [restoreResult, setRestoreResult] = useState<{ restored: Record<string, number>; errors: string[] } | null>(null);
  const [deployEnabled, setDeployEnabled] = useState(false);
  const [isLoadingDeployStatus, setIsLoadingDeployStatus] = useState(true);
  const [deployOptions, setDeployOptions] = useState({
    includeProfiles: true,
    includeClients: true,
    includePlans: true,
    includeServers: true,
    includeTemplates: true,
    includeCoupons: true,
    includeBills: true,
    includeReferrals: true,
    includePanels: true,
    includeCategories: true,
    includeMessageHistory: false,
  });
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load deploy enabled status
  useEffect(() => {
    const loadDeployStatus = async () => {
      try {
        const { data } = await supabase
          .from('app_settings')
          .select('value')
          .eq('key', 'deploy_enabled')
          .maybeSingle();
        
        setDeployEnabled(data?.value === 'true');
      } catch (error) {
        console.error('Error loading deploy status:', error);
      } finally {
        setIsLoadingDeployStatus(false);
      }
    };
    loadDeployStatus();
  }, []);

  const toggleDeployEnabled = async (enabled: boolean) => {
    try {
      const { data: existing } = await supabase
        .from('app_settings')
        .select('id')
        .eq('key', 'deploy_enabled')
        .maybeSingle();

      if (existing) {
        await supabase
          .from('app_settings')
          .update({ value: enabled ? 'true' : 'false' })
          .eq('key', 'deploy_enabled');
      } else {
        await supabase
          .from('app_settings')
          .insert({ 
            key: 'deploy_enabled', 
            value: enabled ? 'true' : 'false',
            description: 'Habilita a opção de deploy para outro projeto'
          });
      }
      
      setDeployEnabled(enabled);
      toast.success(enabled ? 'Deploy ativado!' : 'Deploy desativado!');
    } catch (error) {
      console.error('Error toggling deploy:', error);
      toast.error('Erro ao alterar configuração');
    }
  };

  if (!isAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;
      const token = sessionData.session?.access_token;
      if (!token) throw new Error('Sessão inválida. Faça login novamente.');

      const { data, error } = await supabase.functions.invoke('backup-data', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (error) throw error;

      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `backup-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success('Backup exportado com sucesso!');
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
        const data = JSON.parse(event.target?.result as string) as BackupData;
        if (!data.version || !data.data) {
          throw new Error('Formato de backup inválido');
        }
        setBackupFile(data);
        setRestoreDialogOpen(true);
      } catch (err) {
        toast.error('Arquivo de backup inválido');
      }
    };
    reader.readAsText(file);
    
    // Reset input for re-selection
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleRestore = async () => {
    if (!backupFile) return;

    setIsRestoring(true);
    setRestoreResult(null);

    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;
      const token = sessionData.session?.access_token;
      if (!token) throw new Error('Sessão inválida. Faça login novamente.');

      const { data, error } = await supabase.functions.invoke('restore-data', {
        body: { backup: backupFile, mode: restoreMode },
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (error) throw error;

      setRestoreResult(data);

      const totalRestored = Object.values(data.restored).reduce((a: number, b: unknown) => a + (b as number), 0);

      if (data.errors?.length > 0) {
        toast.warning(`Backup restaurado parcialmente: ${totalRestored} itens. ${data.errors.length} erros.`);
      } else {
        toast.success(`Backup restaurado com sucesso! ${totalRestored} itens importados.`);
      }
    } catch (error) {
      console.error('Erro ao restaurar:', error);
      toast.error((error as { message?: string })?.message || 'Erro ao restaurar backup');
    } finally {
      setIsRestoring(false);
    }
  };

  const closeRestoreDialog = () => {
    setRestoreDialogOpen(false);
    setBackupFile(null);
    setRestoreResult(null);
  };

  const handleDeployExport = async () => {
    setIsDeployExporting(true);
    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;
      const token = sessionData.session?.access_token;
      if (!token) throw new Error('Sessão inválida. Faça login novamente.');

      // Fetch all data based on options - for ALL users (admin export)
      const fetchPromises = [];
      const dataKeys: string[] = [];

      if (deployOptions.includeProfiles) {
        fetchPromises.push(supabase.from('profiles').select('*'));
        dataKeys.push('profiles');
      }
      if (deployOptions.includeClients) {
        fetchPromises.push(supabase.from('clients').select('*'));
        dataKeys.push('clients');
      }
      if (deployOptions.includePlans) {
        fetchPromises.push(supabase.from('plans').select('*'));
        dataKeys.push('plans');
      }
      if (deployOptions.includeServers) {
        fetchPromises.push(supabase.from('servers').select('*'));
        dataKeys.push('servers');
      }
      if (deployOptions.includeTemplates) {
        fetchPromises.push(supabase.from('whatsapp_templates').select('*'));
        dataKeys.push('whatsapp_templates');
      }
      if (deployOptions.includeCoupons) {
        fetchPromises.push(supabase.from('coupons').select('*'));
        dataKeys.push('coupons');
      }
      if (deployOptions.includeBills) {
        fetchPromises.push(supabase.from('bills_to_pay').select('*'));
        dataKeys.push('bills_to_pay');
      }
      if (deployOptions.includeReferrals) {
        fetchPromises.push(supabase.from('referrals').select('*'));
        dataKeys.push('referrals');
      }
      if (deployOptions.includePanels) {
        fetchPromises.push(supabase.from('shared_panels').select('*'));
        fetchPromises.push(supabase.from('panel_clients').select('*'));
        dataKeys.push('shared_panels');
        dataKeys.push('panel_clients');
      }
      if (deployOptions.includeCategories) {
        fetchPromises.push(supabase.from('client_categories').select('*'));
        dataKeys.push('client_categories');
      }
      if (deployOptions.includeMessageHistory) {
        fetchPromises.push(supabase.from('message_history').select('*'));
        dataKeys.push('message_history');
      }

      const results = await Promise.all(fetchPromises);

      const exportData: Record<string, unknown[]> = {};
      const stats: Record<string, number> = {};

      results.forEach((result, index) => {
        const key = dataKeys[index];
        exportData[key] = result.data || [];
        stats[key] = (result.data || []).length;
      });

      const deployBackup = {
        version: '2.0-deploy',
        timestamp: new Date().toISOString(),
        exportType: 'full-deploy',
        description: 'Backup completo para deploy em outro projeto',
        stats,
        data: exportData,
      };

      const blob = new Blob([JSON.stringify(deployBackup, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `deploy-backup-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setDeployDialogOpen(false);
      toast.success('Backup para deploy exportado com sucesso!');
    } catch (error) {
      console.error('Erro ao exportar para deploy:', error);
      toast.error((error as { message?: string })?.message || 'Erro ao exportar backup');
    } finally {
      setIsDeployExporting(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Backup e Restauração</h1>
        <p className="text-muted-foreground">Exporte e importe dados do sistema</p>
      </div>

      {/* Deploy Settings Card */}
      <Card className={deployEnabled ? "border-primary/50 bg-primary/5" : "border-muted"}>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className={`flex items-center gap-2 ${deployEnabled ? 'text-primary' : ''}`}>
                <Rocket className="h-5 w-5" />
                Deploy para Outro Projeto
              </CardTitle>
              <CardDescription>
                Exporte todos os dados para migrar para outro projeto
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Label htmlFor="deploy-toggle" className="text-sm text-muted-foreground">
                {deployEnabled ? 'Ativo' : 'Desativado'}
              </Label>
              <Switch
                id="deploy-toggle"
                checked={deployEnabled}
                onCheckedChange={toggleDeployEnabled}
                disabled={isLoadingDeployStatus}
              />
            </div>
          </div>
        </CardHeader>
        {deployEnabled && (
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Gera um backup completo com todos os dados de todos os vendedores, pronto para importar em outro projeto via GitHub/Lovable.
            </p>
            <Button onClick={() => setDeployDialogOpen(true)} className="w-full">
              <Rocket className="h-4 w-4 mr-2" />
              Configurar Deploy
            </Button>
          </CardContent>
        )}
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Download className="h-5 w-5" />
              Exportar Backup
            </CardTitle>
            <CardDescription>
              Baixe todos os seus dados em formato JSON
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              O backup inclui todos os clientes, servidores, planos, templates, cupons, contas a pagar, indicações e painéis.
            </p>
            <Button onClick={handleExport} disabled={isExporting} className="w-full">
              <Download className="h-4 w-4 mr-2" />
              {isExporting ? 'Exportando...' : 'Exportar Backup'}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5" />
              Restaurar Backup
            </CardTitle>
            <CardDescription>
              Importe dados de um arquivo de backup
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-start gap-2 p-3 bg-warning/10 rounded-lg">
              <AlertTriangle className="h-5 w-5 text-warning flex-shrink-0 mt-0.5" />
              <p className="text-sm text-muted-foreground">
                A restauração importa dados do backup. Recomendamos fazer um backup antes de restaurar.
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

      {/* Import Clients from Project - Admin only */}
      <ImportClientsFromProject />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Informações do Banco de Dados
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            O sistema utiliza Lovable Cloud como backend, garantindo segurança e escalabilidade para seus dados.
          </p>
        </CardContent>
      </Card>

      {/* Restore Dialog */}
      <Dialog open={restoreDialogOpen} onOpenChange={setRestoreDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Restaurar Backup</DialogTitle>
            <DialogDescription>
              {restoreResult ? 'Resultado da restauração' : 'Escolha como deseja restaurar os dados'}
            </DialogDescription>
          </DialogHeader>

          {!restoreResult ? (
            <>
              {backupFile && (
                <div className="space-y-4">
                  <div className="p-3 bg-muted rounded-lg text-sm space-y-1">
                    <p><strong>Versão:</strong> {backupFile.version}</p>
                    <p><strong>Data:</strong> {new Date(backupFile.timestamp).toLocaleString('pt-BR')}</p>
                    {backupFile.stats && (
                      <div className="pt-2">
                        <strong>Itens no backup:</strong>
                        <ul className="list-disc list-inside ml-2 text-muted-foreground">
                          {Object.entries(backupFile.stats).map(([key, value]) => (
                            <li key={key}>{key}: {value}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>

                  <div className="space-y-3">
                    <Label>Modo de restauração:</Label>
                    <RadioGroup value={restoreMode} onValueChange={(v) => setRestoreMode(v as 'append' | 'replace')}>
                      <div className="flex items-start gap-3 p-3 border rounded-lg">
                        <RadioGroupItem value="append" id="append" className="mt-1" />
                        <div>
                          <Label htmlFor="append" className="font-medium">Adicionar</Label>
                          <p className="text-sm text-muted-foreground">
                            Adiciona os dados do backup aos dados existentes
                          </p>
                        </div>
                      </div>
                      <div className="flex items-start gap-3 p-3 border border-destructive/50 rounded-lg">
                        <RadioGroupItem value="replace" id="replace" className="mt-1" />
                        <div>
                          <Label htmlFor="replace" className="font-medium text-destructive">Substituir</Label>
                          <p className="text-sm text-muted-foreground">
                            Remove todos os dados existentes e importa apenas o backup
                          </p>
                        </div>
                      </div>
                    </RadioGroup>
                  </div>
                </div>
              )}

              <DialogFooter>
                <Button variant="outline" onClick={closeRestoreDialog}>
                  Cancelar
                </Button>
                <Button onClick={handleRestore} disabled={isRestoring}>
                  {isRestoring ? 'Restaurando...' : 'Restaurar Backup'}
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <div className="space-y-4">
                <div className="flex items-center gap-2 p-3 bg-success/10 rounded-lg">
                  <CheckCircle className="h-5 w-5 text-success" />
                  <span className="text-sm font-medium">Restauração concluída!</span>
                </div>

                <div className="p-3 bg-muted rounded-lg text-sm">
                  <strong>Itens restaurados:</strong>
                  <ul className="list-disc list-inside ml-2 text-muted-foreground mt-1">
                    {Object.entries(restoreResult.restored).map(([key, value]) => (
                      <li key={key}>{key}: {value}</li>
                    ))}
                  </ul>
                </div>

                {restoreResult.errors?.length > 0 && (
                  <div className="p-3 bg-destructive/10 rounded-lg text-sm">
                    <strong className="text-destructive">Erros ({restoreResult.errors.length}):</strong>
                    <ul className="list-disc list-inside ml-2 text-muted-foreground mt-1 max-h-32 overflow-y-auto">
                      {restoreResult.errors.map((err, i) => (
                        <li key={i}>{err}</li>
                      ))}
                    </ul>
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

      {/* Deploy Dialog */}
      <Dialog open={deployDialogOpen} onOpenChange={setDeployDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Rocket className="h-5 w-5 text-primary" />
              Deploy para Outro Projeto
            </DialogTitle>
            <DialogDescription>
              Selecione quais dados exportar para migrar para outro projeto
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="p-3 bg-primary/10 rounded-lg text-sm">
              <p className="text-muted-foreground">
                Este backup inclui dados de <strong>todos os vendedores</strong> e pode ser importado em outro projeto usando a função "Restaurar Backup".
              </p>
            </div>

            <div className="space-y-3">
              <Label className="text-base font-semibold">Dados a exportar:</Label>
              
              <div className="space-y-2">
                {[
                  { key: 'includeProfiles', label: 'Perfis de Vendedores', desc: 'Dados dos vendedores cadastrados' },
                  { key: 'includeClients', label: 'Clientes', desc: 'Todos os clientes de todos os vendedores' },
                  { key: 'includePlans', label: 'Planos', desc: 'Planos de assinatura configurados' },
                  { key: 'includeServers', label: 'Servidores', desc: 'Servidores e configurações de crédito' },
                  { key: 'includeTemplates', label: 'Templates WhatsApp', desc: 'Modelos de mensagens' },
                  { key: 'includeCoupons', label: 'Cupons', desc: 'Cupons de desconto' },
                  { key: 'includeBills', label: 'Contas a Pagar', desc: 'Registro de contas' },
                  { key: 'includeReferrals', label: 'Indicações', desc: 'Sistema de indicações' },
                  { key: 'includePanels', label: 'Painéis Compartilhados', desc: 'Painéis e clientes vinculados' },
                  { key: 'includeCategories', label: 'Categorias', desc: 'Categorias de clientes' },
                  { key: 'includeMessageHistory', label: 'Histórico de Mensagens', desc: 'Pode ser muito grande!' },
                ].map(({ key, label, desc }) => (
                  <div key={key} className="flex items-center justify-between p-2 border rounded-lg">
                    <div>
                      <Label htmlFor={key} className="font-medium cursor-pointer">{label}</Label>
                      <p className="text-xs text-muted-foreground">{desc}</p>
                    </div>
                    <Switch
                      id={key}
                      checked={deployOptions[key as keyof typeof deployOptions]}
                      onCheckedChange={(checked) => 
                        setDeployOptions(prev => ({ ...prev, [key]: checked }))
                      }
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDeployOptions({
                  includeProfiles: true,
                  includeClients: true,
                  includePlans: true,
                  includeServers: true,
                  includeTemplates: true,
                  includeCoupons: true,
                  includeBills: true,
                  includeReferrals: true,
                  includePanels: true,
                  includeCategories: true,
                  includeMessageHistory: true,
                })}
              >
                Selecionar Todos
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDeployOptions({
                  includeProfiles: false,
                  includeClients: false,
                  includePlans: false,
                  includeServers: false,
                  includeTemplates: false,
                  includeCoupons: false,
                  includeBills: false,
                  includeReferrals: false,
                  includePanels: false,
                  includeCategories: false,
                  includeMessageHistory: false,
                })}
              >
                Desmarcar Todos
              </Button>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDeployDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleDeployExport} disabled={isDeployExporting}>
              <Rocket className="h-4 w-4 mr-2" />
              {isDeployExporting ? 'Exportando...' : 'Exportar para Deploy'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
