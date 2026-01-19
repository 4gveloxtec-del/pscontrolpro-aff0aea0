import { useState, useEffect, useMemo, useCallback, memo } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { 
  MessageCircle, Settings, Users, AlertTriangle, CheckCircle, Loader2, RefreshCw, Shield, Ban, Eye, Clock, ListOrdered
} from 'lucide-react';
import { WhatsAppGlobalConfig } from '@/components/WhatsAppGlobalConfig';
import { WhatsAppSellerConfig } from '@/components/WhatsAppSellerConfig';
import { SimplifiedWhatsAppConfig } from '@/components/SimplifiedWhatsAppConfig';
import { ManualMessageSender } from '@/components/ManualMessageSender';
import { SmartMessageQueue } from '@/components/SmartMessageQueue';
import { useWhatsAppGlobalConfig } from '@/hooks/useWhatsAppGlobalConfig';
import { useWhatsAppSellerInstance } from '@/hooks/useWhatsAppSellerInstance';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface BlockedSeller {
  id: string;
  seller_id: string;
  instance_name: string;
  instance_blocked: boolean;
  blocked_at: string | null;
  blocked_reason: string | null;
  plan_status: string;
  profiles?: {
    full_name: string | null;
    email: string;
    whatsapp: string | null;
    subscription_expires_at: string | null;
  };
}

// Memoized status badges component
const StatusBadges = memo(({ isApiActive, isConnected, autoSendEnabled }: {
  isApiActive: boolean;
  isConnected: boolean;
  autoSendEnabled: boolean;
}) => (
  <div className="flex flex-wrap gap-2">
    <Badge variant={isApiActive ? "default" : "destructive"}>
      API: {isApiActive ? 'Ativa' : 'Inativa'}
    </Badge>
    <Badge variant={isConnected ? "default" : "secondary"}>
      {isConnected ? 'Conectado' : 'Desconectado'}
    </Badge>
    <Badge variant={autoSendEnabled ? "default" : "outline"}>
      {autoSendEnabled ? 'Automático' : 'Manual'}
    </Badge>
  </div>
));

StatusBadges.displayName = 'StatusBadges';

export default function WhatsAppAutomation() {
  const { user, isAdmin } = useAuth();
  const [isRunningAutomation, setIsRunningAutomation] = useState(false);
  const [isTestingOverdue, setIsTestingOverdue] = useState(false);
  const [testPreviewOpen, setTestPreviewOpen] = useState(false);
  const [testResults, setTestResults] = useState<any[]>([]);
  const [overdueClients, setOverdueClients] = useState<any[]>([]);
  const [expiringClients, setExpiringClients] = useState<any[]>([]);
  const [expiringResellers, setExpiringResellers] = useState<any[]>([]);
  const [blockedSellers, setBlockedSellers] = useState<BlockedSeller[]>([]);
  const [activeSellers, setActiveSellers] = useState<BlockedSeller[]>([]);

  const { isApiActive } = useWhatsAppGlobalConfig();
  const { instance: sellerInstance } = useWhatsAppSellerInstance();

  // Memoized values to prevent unnecessary re-renders
  const isConnected = useMemo(() => 
    sellerInstance?.is_connected && isApiActive,
    [sellerInstance?.is_connected, isApiActive]
  );

  const canRunAutomation = useMemo(() => 
    isConnected && sellerInstance?.auto_send_enabled,
    [isConnected, sellerInstance?.auto_send_enabled]
  );

  const fetchSellerInstances = useCallback(async () => {
    const { data: instances } = await supabase
      .from('whatsapp_seller_instances')
      .select(`
        id,
        seller_id,
        instance_name,
        instance_blocked,
        blocked_at,
        blocked_reason,
        plan_status,
        profiles:seller_id (
          full_name,
          email,
          whatsapp,
          subscription_expires_at
        )
      `);

    if (instances) {
      const blocked = instances.filter(i => i.instance_blocked);
      const active = instances.filter(i => !i.instance_blocked);
      setBlockedSellers(blocked as unknown as BlockedSeller[]);
      setActiveSellers(active as unknown as BlockedSeller[]);
    }
  }, []);

  useEffect(() => {
    if (!user?.id) return;
    
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const in30Days = new Date();
    in30Days.setDate(in30Days.getDate() + 30);

    if (!isAdmin) {
      // Fetch data in parallel for better performance
      Promise.all([
        supabase.from('clients').select('id, name, category, expiration_date, phone')
          .eq('seller_id', user.id).eq('is_archived', false)
          .gte('expiration_date', today.toISOString().split('T')[0])
          .lte('expiration_date', in30Days.toISOString().split('T')[0])
          .order('expiration_date'),
        supabase.from('clients').select('id, name, phone, pending_amount, expected_payment_date')
          .eq('seller_id', user.id)
          .eq('is_archived', false)
          .eq('is_paid', false)
          .eq('expected_payment_date', yesterday.toISOString().split('T')[0])
          .gt('pending_amount', 0)
          .order('expected_payment_date')
      ]).then(([expiringRes, overdueRes]) => {
        setExpiringClients(expiringRes.data || []);
        setOverdueClients(overdueRes.data || []);
      });
    } else {
      const in7Days = new Date();
      in7Days.setDate(in7Days.getDate() + 7);
      
      supabase.from('profiles').select('id, full_name, email, whatsapp, subscription_expires_at')
        .gte('subscription_expires_at', today.toISOString())
        .lte('subscription_expires_at', in7Days.toISOString())
        .eq('is_active', true)
        .then(({ data }) => setExpiringResellers(data || []));

      fetchSellerInstances();
    }
  }, [user?.id, isAdmin, fetchSellerInstances]);


  const daysUntil = (dateStr: string): number => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const target = new Date(dateStr);
    target.setHours(0, 0, 0, 0);
    return Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  };

  const runManualAutomation = async () => {
    setIsRunningAutomation(true);
    try {
      const { data, error } = await supabase.functions.invoke('whatsapp-automation');
      if (error) throw error;
      toast.success(`Automação executada! ${data?.sent || 0} mensagem(s) enviada(s).`);
    } catch (error: any) {
      toast.error('Erro: ' + error.message);
    } finally {
      setIsRunningAutomation(false);
    }
  };

  const runTestOverdueMessage = async () => {
    setIsTestingOverdue(true);
    try {
      const { data, error } = await supabase.functions.invoke('whatsapp-automation', {
        body: { testMode: true }
      });
      if (error) throw error;
      
      // Filter only payment_overdue_1day results
      const overdueResults = (data?.results || []).filter(
        (r: any) => r.notificationType === 'payment_overdue_1day'
      );
      
      setTestResults(overdueResults);
      setTestPreviewOpen(true);
      
      if (overdueResults.length === 0) {
        toast.info('Nenhum cliente com pagamento atrasado em 1 dia encontrado.');
      } else {
        toast.success(`Preview gerado para ${overdueResults.length} cliente(s) com pagamento atrasado.`);
      }
    } catch (error: any) {
      toast.error('Erro: ' + error.message);
    } finally {
      setIsTestingOverdue(false);
    }
  };

  const groupedClients = {
    today: expiringClients.filter(c => daysUntil(c.expiration_date) === 0),
    in3Days: expiringClients.filter(c => { const d = daysUntil(c.expiration_date); return d > 0 && d <= 3; }),
    in30Days: expiringClients.filter(c => { const d = daysUntil(c.expiration_date); return d > 3 && d <= 30 && c.category === 'Contas Premium'; }),
  };

  const groupedResellers = {
    today: expiringResellers.filter(r => daysUntil(r.subscription_expires_at) === 0),
    in3Days: expiringResellers.filter(r => { const d = daysUntil(r.subscription_expires_at); return d > 0 && d <= 3; }),
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <MessageCircle className="h-8 w-8 text-green-500" />
            Automação WhatsApp
          </h1>
          <p className="text-muted-foreground">
            {isAdmin ? 'Configure a API global e gerencie revendedores' : 'Conecte seu WhatsApp e gerencie lembretes'}
          </p>
        </div>
        {canRunAutomation && (
          <Button onClick={runManualAutomation} disabled={isRunningAutomation}>
            {isRunningAutomation ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
            Executar Agora
          </Button>
        )}
      </div>

      <Tabs defaultValue="dashboard" className="space-y-6">
        <TabsList className={`grid w-full max-w-2xl ${isAdmin ? 'grid-cols-5' : 'grid-cols-3'}`}>
          <TabsTrigger value="dashboard" className="gap-2"><Users className="h-4 w-4" />Dashboard</TabsTrigger>
          <TabsTrigger value="queue" className="gap-2"><ListOrdered className="h-4 w-4" />Fila</TabsTrigger>
          <TabsTrigger value="config" className="gap-2"><Settings className="h-4 w-4" />Instância</TabsTrigger>
          {isAdmin && (
            <>
              <TabsTrigger value="sellers" className="gap-2"><Ban className="h-4 w-4" />Vendedores</TabsTrigger>
              <TabsTrigger value="global" className="gap-2"><Shield className="h-4 w-4" />API</TabsTrigger>
            </>
          )}
        </TabsList>

        <TabsContent value="dashboard" className="space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2">
                {isConnected ? <CheckCircle className="h-5 w-5 text-success" /> : <AlertTriangle className="h-5 w-5 text-warning" />}
                Status
              </CardTitle>
            </CardHeader>
            <CardContent>
              <StatusBadges 
                isApiActive={isApiActive}
                isConnected={isConnected ?? false}
                autoSendEnabled={sellerInstance?.auto_send_enabled ?? false}
              />
            </CardContent>
          </Card>

          {isAdmin ? (
            <div className="grid gap-6 md:grid-cols-2">
              <Card className="border-destructive/30">
                <CardHeader className="pb-3"><CardTitle className="text-destructive">Vencendo Hoje ({groupedResellers.today.length})</CardTitle></CardHeader>
                <CardContent className="space-y-2">
                  {groupedResellers.today.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum</p> : 
                    groupedResellers.today.map((r) => (
                      <div key={r.id} className="flex items-center justify-between p-2 rounded bg-muted/50">
                        <span>{r.full_name || r.email}</span>
                        <Button size="sm" variant="outline" onClick={() => window.open(`https://wa.me/${r.whatsapp?.replace(/\D/g, '')}`, '_blank')}>
                          <MessageCircle className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                </CardContent>
              </Card>
              <Card className="border-warning/30">
                <CardHeader className="pb-3"><CardTitle className="text-warning">Vencendo em 3 dias ({groupedResellers.in3Days.length})</CardTitle></CardHeader>
                <CardContent className="space-y-2">
                  {groupedResellers.in3Days.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum</p> :
                    groupedResellers.in3Days.map((r) => (
                      <div key={r.id} className="flex items-center justify-between p-2 rounded bg-muted/50">
                        <span>{r.full_name || r.email}</span>
                        <Button size="sm" variant="outline" onClick={() => window.open(`https://wa.me/${r.whatsapp?.replace(/\D/g, '')}`, '_blank')}>
                          <MessageCircle className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                </CardContent>
              </Card>
            </div>
          ) : (
            <div className="grid gap-6">
              {/* Payment Overdue 1 Day - NEW SECTION */}
              <Card className="border-orange-500/30">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-orange-500 flex items-center gap-2">
                      <Clock className="h-5 w-5" />
                      Pagamento Atrasado 1 Dia ({overdueClients.length})
                    </CardTitle>
                    <Button 
                      size="sm" 
                      variant="outline" 
                      onClick={runTestOverdueMessage}
                      disabled={isTestingOverdue}
                      className="border-orange-500/50 text-orange-500 hover:bg-orange-500/10"
                    >
                      {isTestingOverdue ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Eye className="h-4 w-4 mr-2" />
                      )}
                      Testar Mensagem
                    </Button>
                  </div>
                  <CardDescription>
                    Clientes que não pagaram e a data combinada foi ontem
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {overdueClients.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Nenhum cliente com pagamento atrasado em 1 dia</p>
                  ) : (
                    overdueClients.map((client) => (
                      <div key={client.id} className="flex items-center justify-between p-3 rounded-lg border border-orange-500/20 bg-orange-500/5">
                        <div>
                          <p className="font-medium">{client.name}</p>
                          <p className="text-xs text-muted-foreground">
                            R$ {client.pending_amount?.toFixed(2)} pendente • Data combinada: {format(new Date(client.expected_payment_date), 'dd/MM/yyyy', { locale: ptBR })}
                          </p>
                        </div>
                        <ManualMessageSender client={client} />
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>

              <Card className="border-destructive/30">
                <CardHeader className="pb-3"><CardTitle className="text-destructive">Vencendo Hoje ({groupedClients.today.length})</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  {groupedClients.today.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum</p> :
                    groupedClients.today.map((client) => (
                      <div key={client.id} className="flex items-center justify-between p-3 rounded-lg border bg-card">
                        <div><p className="font-medium">{client.name}</p><p className="text-xs text-muted-foreground">{client.category}</p></div>
                        <ManualMessageSender client={client} />
                      </div>
                    ))}
                </CardContent>
              </Card>
              <Card className="border-warning/30">
                <CardHeader className="pb-3"><CardTitle className="text-warning">Vencendo em 3 dias ({groupedClients.in3Days.length})</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  {groupedClients.in3Days.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum</p> :
                    groupedClients.in3Days.map((client) => (
                      <div key={client.id} className="flex items-center justify-between p-3 rounded-lg border bg-card">
                        <div><p className="font-medium">{client.name}</p><p className="text-xs text-muted-foreground">{client.category}</p></div>
                        <ManualMessageSender client={client} />
                      </div>
                    ))}
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>

        <TabsContent value="queue">
          <SmartMessageQueue />
        </TabsContent>

        <TabsContent value="config">
          <Card>
            <CardHeader>
              <CardTitle>
                {isAdmin ? 'Minha Instância WhatsApp' : 'Conectar WhatsApp'}
              </CardTitle>
              <CardDescription>
                {isAdmin 
                  ? 'Configure sua própria instância para enviar mensagens aos revendedores'
                  : 'Cole o link da sua instância para ativar o envio automático'
                }
              </CardDescription>
            </CardHeader>
            <CardContent>
              {/* Admin uses full config, resellers use simplified */}
              {isAdmin ? <WhatsAppSellerConfig /> : <SimplifiedWhatsAppConfig />}
            </CardContent>
          </Card>
        </TabsContent>

        {isAdmin && (
          <TabsContent value="sellers" className="space-y-6">
            <div className="grid gap-6 md:grid-cols-2">
              {/* Blocked Sellers */}
              <Card className="border-destructive/30">
                <CardHeader className="pb-3">
                  <CardTitle className="text-destructive flex items-center gap-2">
                    <Ban className="h-5 w-5" />
                    Bloqueados ({blockedSellers.length})
                  </CardTitle>
                  <CardDescription>Vendedores com instância bloqueada por inadimplência</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {blockedSellers.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">Nenhum vendedor bloqueado</p>
                  ) : (
                    blockedSellers.map((seller) => {
                      const profile = seller.profiles as any;
                      return (
                        <div key={seller.id} className="p-3 rounded-lg border border-destructive/30 bg-destructive/5 space-y-2">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="font-medium">{profile?.full_name || profile?.email}</p>
                              <p className="text-xs text-muted-foreground">{seller.instance_name}</p>
                            </div>
                            <Badge variant="destructive">Bloqueado</Badge>
                          </div>
                          <div className="text-xs text-muted-foreground space-y-1">
                            <p>📧 {profile?.email}</p>
                            <p>📱 {profile?.whatsapp || 'Sem WhatsApp'}</p>
                            <p>📅 Venceu: {profile?.subscription_expires_at ? format(new Date(profile.subscription_expires_at), 'dd/MM/yyyy', { locale: ptBR }) : '-'}</p>
                            {seller.blocked_at && (
                              <p>🔒 Bloqueado em: {format(new Date(seller.blocked_at), 'dd/MM/yyyy HH:mm', { locale: ptBR })}</p>
                            )}
                            <p className="text-destructive">⚠️ {seller.blocked_reason || 'Inadimplência'}</p>
                          </div>
                        </div>
                      );
                    })
                  )}
                </CardContent>
              </Card>

              {/* Active Sellers */}
              <Card className="border-success/30">
                <CardHeader className="pb-3">
                  <CardTitle className="text-success flex items-center gap-2">
                    <CheckCircle className="h-5 w-5" />
                    Ativos ({activeSellers.length})
                  </CardTitle>
                  <CardDescription>Vendedores com instância ativa</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {activeSellers.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">Nenhuma instância configurada</p>
                  ) : (
                    activeSellers.map((seller) => {
                      const profile = seller.profiles as any;
                      return (
                        <div key={seller.id} className="p-3 rounded-lg border bg-card space-y-2">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="font-medium">{profile?.full_name || profile?.email}</p>
                              <p className="text-xs text-muted-foreground">{seller.instance_name}</p>
                            </div>
                            <Badge variant="default" className="bg-success">Ativo</Badge>
                          </div>
                          <div className="text-xs text-muted-foreground">
                            <p>📧 {profile?.email}</p>
                            <p>📅 Vence: {profile?.subscription_expires_at ? format(new Date(profile.subscription_expires_at), 'dd/MM/yyyy', { locale: ptBR }) : 'Permanente'}</p>
                          </div>
                        </div>
                      );
                    })
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Run Block Check Button */}
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">Verificação de Bloqueio</p>
                    <p className="text-sm text-muted-foreground">
                      Executar verificação manual de inadimplência
                    </p>
                  </div>
                  <Button 
                    variant="outline" 
                    onClick={async () => {
                      try {
                        const { data, error } = await supabase.functions.invoke('check-instance-blocks');
                        if (error) throw error;
                        toast.success(`Verificação concluída: ${data?.summary?.blocked_count || 0} bloqueado(s), ${data?.summary?.unblocked_count || 0} desbloqueado(s)`);
                        fetchSellerInstances();
                      } catch (err: any) {
                        toast.error('Erro: ' + err.message);
                      }
                    }}
                  >
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Verificar Agora
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        )}

        {isAdmin && (
          <TabsContent value="global">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="h-5 w-5" />
                  Configuração Global da API
                </CardTitle>
                <CardDescription>
                  Configure a API Evolution que será usada por todos os revendedores
                </CardDescription>
              </CardHeader>
              <CardContent><WhatsAppGlobalConfig /></CardContent>
            </Card>
          </TabsContent>
        )}
      </Tabs>

      {/* Test Preview Dialog */}
      <Dialog open={testPreviewOpen} onOpenChange={setTestPreviewOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5 text-orange-500" />
              Preview: Mensagem de Pagamento Atrasado
            </DialogTitle>
            <DialogDescription>
              Veja como a mensagem ficará para clientes com pagamento atrasado em 1 dia
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {testResults.length === 0 ? (
              <p className="text-muted-foreground text-center py-6">
                Nenhum cliente com pagamento atrasado em 1 dia encontrado.
              </p>
            ) : (
              testResults.map((result, index) => (
                <Card key={index} className="border-orange-500/30">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center justify-between">
                      <span>{result.client}</span>
                      <Badge variant="outline" className="text-orange-500 border-orange-500/50">
                        {result.wouldSendVia === 'whatsapp' ? 'WhatsApp' : 'Push'}
                      </Badge>
                    </CardTitle>
                    <CardDescription>
                      Template: {result.templateName}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="bg-muted/50 rounded-lg p-4 whitespace-pre-wrap text-sm">
                      {result.messagePreview || 'Template não encontrado'}
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
