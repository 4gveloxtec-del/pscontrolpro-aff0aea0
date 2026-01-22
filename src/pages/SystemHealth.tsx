import { useState } from 'react';
import { useSystemHealth } from '@/hooks/useSystemHealth';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  Activity, 
  Shield, 
  ShieldCheck, 
  ShieldAlert, 
  RefreshCw, 
  Settings, 
  History,
  Database,
  MessageSquare,
  Wifi,
  Bot,
  Users,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Wrench,
  Clock
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const componentIcons: Record<string, React.ReactNode> = {
  database_connection: <Database className="h-4 w-4" />,
  whatsapp_api: <MessageSquare className="h-4 w-4" />,
  evolution_api: <Wifi className="h-4 w-4" />,
  seller_contacts: <Users className="h-4 w-4" />,
  message_queue: <MessageSquare className="h-4 w-4" />,
  seller_instances: <Users className="h-4 w-4" />,
  authentication: <Shield className="h-4 w-4" />,
  backup_service: <Database className="h-4 w-4" />,
};

const componentNames: Record<string, string> = {
  database_connection: 'Conexão com Banco',
  whatsapp_api: 'API WhatsApp',
  evolution_api: 'Evolution API',
  seller_contacts: 'Contatos dos Sellers',
  message_queue: 'Fila de Mensagens',
  seller_instances: 'Instâncias dos Sellers',
  authentication: 'Autenticação',
  backup_service: 'Serviço de Backup',
};

const statusColors: Record<string, string> = {
  healthy: 'bg-green-500',
  warning: 'bg-yellow-500',
  critical: 'bg-red-500',
  recovering: 'bg-blue-500',
  unknown: 'bg-gray-500',
};

const statusLabels: Record<string, string> = {
  healthy: 'Saudável',
  warning: 'Atenção',
  critical: 'Crítico',
  recovering: 'Recuperando',
  unknown: 'Desconhecido',
};

const severityColors: Record<string, string> = {
  info: 'bg-blue-100 text-blue-800',
  low: 'bg-green-100 text-green-800',
  medium: 'bg-yellow-100 text-yellow-800',
  high: 'bg-orange-100 text-orange-800',
  critical: 'bg-red-100 text-red-800',
};

export default function SystemHealth() {
  const { isAdmin } = useAuth();
  const [activeTab, setActiveTab] = useState('components');
  const {
    config,
    statuses,
    logs,
    isLoading,
    isRunningCheck,
    toggleSystem,
    toggleAutoRepair,
    runManualCheck,
    updateConfig,
    getOverallStatus,
    getStatusCounts,
  } = useSystemHealth();

  const [configForm, setConfigForm] = useState({
    check_interval_seconds: 300,
    max_repair_attempts: 3,
  });

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center h-full">
        <Card className="w-96">
          <CardHeader>
            <CardTitle>Acesso Restrito</CardTitle>
            <CardDescription>
              Esta página é exclusiva para administradores.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-6 p-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid gap-4 md:grid-cols-4">
          {[1, 2, 3, 4].map(i => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  const overallStatus = getOverallStatus();
  const counts = getStatusCounts();

  return (
    <div className="space-y-6 p-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Activity className="h-6 w-6" />
              Sistema de Autocura
            </h1>
            <p className="text-muted-foreground">
              Monitoramento e reparo automático do sistema
            </p>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Label htmlFor="system-toggle">Sistema</Label>
              <Switch
                id="system-toggle"
                checked={config?.is_enabled ?? false}
                onCheckedChange={toggleSystem}
              />
            </div>
            <Button 
              onClick={runManualCheck}
              disabled={isRunningCheck || !config?.is_enabled}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${isRunningCheck ? 'animate-spin' : ''}`} />
              {isRunningCheck ? 'Verificando...' : 'Verificar Agora'}
            </Button>
          </div>
        </div>

        {/* Status Overview */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card className={`border-l-4 ${
            overallStatus === 'healthy' ? 'border-l-green-500' :
            overallStatus === 'warning' ? 'border-l-yellow-500' : 'border-l-red-500'
          }`}>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Status Geral</p>
                  <p className="text-2xl font-bold capitalize">
                    {overallStatus === 'healthy' ? 'Saudável' :
                     overallStatus === 'warning' ? 'Atenção' : 'Crítico'}
                  </p>
                </div>
                {overallStatus === 'healthy' ? (
                  <ShieldCheck className="h-8 w-8 text-green-500" />
                ) : overallStatus === 'warning' ? (
                  <Shield className="h-8 w-8 text-yellow-500" />
                ) : (
                  <ShieldAlert className="h-8 w-8 text-red-500" />
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Saudáveis</p>
                  <p className="text-2xl font-bold text-green-600">{counts.healthy}</p>
                </div>
                <CheckCircle2 className="h-8 w-8 text-green-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Alertas</p>
                  <p className="text-2xl font-bold text-yellow-600">{counts.warning}</p>
                </div>
                <AlertTriangle className="h-8 w-8 text-yellow-500" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Críticos</p>
                  <p className="text-2xl font-bold text-red-600">{counts.critical}</p>
                </div>
                <XCircle className="h-8 w-8 text-red-500" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList>
            <TabsTrigger value="components" className="gap-2">
              <Activity className="h-4 w-4" />
              Componentes
            </TabsTrigger>
            <TabsTrigger value="logs" className="gap-2">
              <History className="h-4 w-4" />
              Logs
            </TabsTrigger>
            <TabsTrigger value="config" className="gap-2">
              <Settings className="h-4 w-4" />
              Configurações
            </TabsTrigger>
          </TabsList>

          {/* Components Tab */}
          <TabsContent value="components" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {statuses.map((status) => (
                <Card key={status.id} className="relative overflow-hidden">
                  <div className={`absolute top-0 right-0 w-2 h-full ${statusColors[status.status]}`} />
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {componentIcons[status.component_name] || <Activity className="h-4 w-4" />}
                        <CardTitle className="text-base">
                          {componentNames[status.component_name] || status.component_name}
                        </CardTitle>
                      </div>
                      <Badge variant="outline" className={statusColors[status.status].replace('bg-', 'border-')}>
                        {statusLabels[status.status]}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2 text-sm">
                      <div className="flex items-center justify-between text-muted-foreground">
                        <span>Última verificação</span>
                        <span>
                          {status.last_check_at 
                            ? formatDistanceToNow(new Date(status.last_check_at), { addSuffix: true, locale: ptBR })
                            : 'Nunca'}
                        </span>
                      </div>
                      
                      {status.consecutive_failures > 0 && (
                        <div className="flex items-center justify-between text-yellow-600">
                          <span>Falhas consecutivas</span>
                          <span>{status.consecutive_failures}</span>
                        </div>
                      )}
                      
                      {status.repair_attempts > 0 && (
                        <div className="flex items-center justify-between">
                          <span className="flex items-center gap-1">
                            <Wrench className="h-3 w-3" />
                            Reparos tentados
                          </span>
                          <span>{status.repair_attempts}</span>
                        </div>
                      )}
                      
                      {status.last_error && (
                        <div className="mt-2 p-2 bg-red-50 rounded text-xs text-red-700">
                          {status.last_error}
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          {/* Logs Tab */}
          <TabsContent value="logs">
            <Card>
              <CardHeader>
                <CardTitle>Histórico de Eventos</CardTitle>
                <CardDescription>
                  Últimos 100 eventos registrados pelo sistema de autocura
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[500px]">
                  <div className="space-y-2">
                    {logs.length === 0 ? (
                      <p className="text-center text-muted-foreground py-8">
                        Nenhum evento registrado ainda
                      </p>
                    ) : (
                      logs.map((log) => (
                        <div 
                          key={log.id}
                          className="flex items-start gap-3 p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                        >
                          <div className={`px-2 py-1 rounded text-xs font-medium ${severityColors[log.severity]}`}>
                            {log.severity.toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-medium">
                                {componentNames[log.component_name] || log.component_name}
                              </span>
                              <Badge variant="outline" className="text-xs">
                                {log.event_type.replace(/_/g, ' ')}
                              </Badge>
                              {log.was_auto_repaired && (
                                <Badge className="bg-green-100 text-green-800 text-xs">
                                  Auto-reparado
                                </Badge>
                              )}
                            </div>
                            <p className="text-sm text-muted-foreground mt-1 truncate">
                              {log.message}
                            </p>
                            {log.repair_action && (
                              <p className="text-xs text-blue-600 mt-1 flex items-center gap-1">
                                <Wrench className="h-3 w-3" />
                                {log.repair_action}
                              </p>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {format(new Date(log.created_at), 'dd/MM HH:mm', { locale: ptBR })}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Config Tab */}
          <TabsContent value="config">
            <Card>
              <CardHeader>
                <CardTitle>Configurações do Sistema</CardTitle>
                <CardDescription>
                  Configure o comportamento do sistema de autocura
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid gap-6 md:grid-cols-2">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between p-4 rounded-lg border">
                      <div>
                        <Label className="text-base">Sistema de Autocura</Label>
                        <p className="text-sm text-muted-foreground">
                          Ativa o monitoramento contínuo
                        </p>
                      </div>
                      <Switch
                        checked={config?.is_enabled ?? false}
                        onCheckedChange={toggleSystem}
                      />
                    </div>

                    <div className="flex items-center justify-between p-4 rounded-lg border">
                      <div>
                        <Label className="text-base">Reparo Automático</Label>
                        <p className="text-sm text-muted-foreground">
                          Tenta corrigir problemas automaticamente
                        </p>
                      </div>
                      <Switch
                        checked={config?.auto_repair_enabled ?? false}
                        onCheckedChange={toggleAutoRepair}
                      />
                    </div>

                    <div className="flex items-center justify-between p-4 rounded-lg border">
                      <div>
                        <Label className="text-base">Notificar Admin</Label>
                        <p className="text-sm text-muted-foreground">
                          Notifica em casos críticos
                        </p>
                      </div>
                      <Switch
                        checked={config?.notify_admin_on_critical ?? false}
                        onCheckedChange={(checked) => updateConfig({ notify_admin_on_critical: checked })}
                      />
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="interval">Intervalo de Verificação (segundos)</Label>
                      <div className="flex gap-2">
                        <Input
                          id="interval"
                          type="number"
                          min={60}
                          max={3600}
                          value={config?.check_interval_seconds ?? 300}
                          onChange={(e) => setConfigForm({
                            ...configForm,
                            check_interval_seconds: parseInt(e.target.value)
                          })}
                        />
                        <Button 
                          variant="outline"
                          onClick={() => updateConfig({ check_interval_seconds: configForm.check_interval_seconds })}
                        >
                          Salvar
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Mínimo: 60s, Máximo: 3600s (1 hora)
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="max-attempts">Máximo de Tentativas de Reparo</Label>
                      <div className="flex gap-2">
                        <Input
                          id="max-attempts"
                          type="number"
                          min={1}
                          max={10}
                          value={config?.max_repair_attempts ?? 3}
                          onChange={(e) => setConfigForm({
                            ...configForm,
                            max_repair_attempts: parseInt(e.target.value)
                          })}
                        />
                        <Button 
                          variant="outline"
                          onClick={() => updateConfig({ max_repair_attempts: configForm.max_repair_attempts })}
                        >
                          Salvar
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Após esse número, requer intervenção manual
                      </p>
                    </div>
                  </div>
                </div>

                <div className="border-t pt-6">
                  <h3 className="font-medium mb-4">Limites de Segurança</h3>
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    <div className="p-4 rounded-lg bg-green-50 border border-green-200">
                      <CheckCircle2 className="h-5 w-5 text-green-600 mb-2" />
                      <p className="font-medium text-green-800">Dados Protegidos</p>
                      <p className="text-sm text-green-700">
                        O sistema nunca apaga dados críticos de clientes
                      </p>
                    </div>
                    <div className="p-4 rounded-lg bg-green-50 border border-green-200">
                      <CheckCircle2 className="h-5 w-5 text-green-600 mb-2" />
                      <p className="font-medium text-green-800">Ações Seguras</p>
                      <p className="text-sm text-green-700">
                        Apenas ações marcadas como seguras são executadas
                      </p>
                    </div>
                    <div className="p-4 rounded-lg bg-green-50 border border-green-200">
                      <CheckCircle2 className="h-5 w-5 text-green-600 mb-2" />
                      <p className="font-medium text-green-800">Limite Diário</p>
                      <p className="text-sm text-green-700">
                        Cada ação tem um limite máximo de execuções por dia
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
  );
}
