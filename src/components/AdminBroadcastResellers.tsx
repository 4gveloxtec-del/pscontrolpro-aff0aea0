import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { toast } from 'sonner';
import { Send, Users, Clock, CheckCircle, XCircle, Loader2, MessageSquare, Link as LinkIcon, Play, Pause, RotateCcw, Filter, ChevronDown, FileText, Calendar } from 'lucide-react';

interface Seller {
  id: string;
  email: string;
  full_name: string | null;
  whatsapp: string | null;
  is_active: boolean;
  is_permanent: boolean;
  plan_period: string | null;
  plan_type: string | null;
  subscription_expires_at: string | null;
}

interface Broadcast {
  id: string;
  message: string;
  status: string;
  total_recipients: number;
  sent_count: number;
  failed_count: number;
  interval_seconds: number;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

interface WhatsAppTemplate {
  id: string;
  name: string;
  type: string;
  message: string;
}

// Períodos de plano disponíveis
const PLAN_PERIODS = [
  { value: 'permanente', label: 'Permanente', days: null, aliases: ['vitalicio', 'permanent'] },
  { value: 'mensal', label: 'Mensal', days: 30, aliases: ['monthly'] },
  { value: 'trimestral', label: 'Trimestral', days: 90, aliases: ['quarterly'] },
  { value: 'semestral', label: 'Semestral', days: 180, aliases: ['semiannual'] },
  { value: 'anual', label: 'Anual', days: 365, aliases: ['annual', 'yearly'] },
];

// Tipos de mensagem/categorias
const MESSAGE_CATEGORIES = [
  { value: 'welcome', label: 'Boas-vindas', icon: '👋' },
  { value: 'billing', label: 'Cobrança', icon: '💰' },
  { value: 'expiring', label: 'Vencimento', icon: '⏰' },
  { value: 'expired', label: 'Vencido', icon: '❌' },
  { value: 'renewal', label: 'Renovação', icon: '✅' },
  { value: 'general', label: 'Avisos Gerais', icon: '📢' },
];

export function AdminBroadcastResellers() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [intervalSeconds, setIntervalSeconds] = useState(30);
  const [isSending, setIsSending] = useState(false);
  const [currentBroadcastId, setCurrentBroadcastId] = useState<string | null>(null);
  
  // Advanced filters state
  const [filtersOpen, setFiltersOpen] = useState(true);
  const [selectedPeriods, setSelectedPeriods] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedTemplate, setSelectedTemplate] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'expired'>('all');

  // Fetch sellers with WhatsApp and plan info
  const { data: allSellers = [] } = useQuery({
    queryKey: ['broadcast-sellers-full'],
    queryFn: async () => {
      const { data: roles } = await supabase
        .from('user_roles')
        .select('user_id')
        .eq('role', 'seller');

      if (!roles?.length) return [];

      const sellerIds = roles.map(r => r.user_id);

      const { data, error } = await supabase
        .from('profiles')
        .select('id, email, full_name, whatsapp, is_active, is_permanent, plan_period, plan_type, subscription_expires_at')
        .in('id', sellerIds)
        .not('whatsapp', 'is', null);

      if (error) throw error;
      return (data || []).filter(s => s.whatsapp) as Seller[];
    },
  });

  // Fetch admin templates for sellers
  const { data: templates = [] } = useQuery({
    queryKey: ['admin-seller-templates-broadcast', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error } = await supabase
        .from('whatsapp_templates')
        .select('id, name, type, message')
        .eq('seller_id', user.id)
        .like('name', 'Vendedor%')
        .order('name');
      if (error) throw error;
      return data as WhatsAppTemplate[];
    },
    enabled: !!user?.id,
  });

  // Filter templates by selected category
  const filteredTemplates = useMemo(() => {
    if (selectedCategory === 'all') return templates;
    
    return templates.filter(template => {
      const type = template.type?.toLowerCase() || '';
      const name = template.name.toLowerCase();
      
      switch (selectedCategory) {
        case 'welcome':
          return type === 'welcome' || name.includes('boas-vindas');
        case 'billing':
          return type === 'billing' || name.includes('cobrança');
        case 'expiring':
          return type.includes('expiring') || name.includes('vencimento') || name.includes('vencendo');
        case 'expired':
          return type === 'expired' || name.includes('vencido');
        case 'renewal':
          return type === 'renewal' || name.includes('renovação');
        case 'general':
          return !['welcome', 'billing', 'expired', 'renewal'].includes(type) && 
                 !type.includes('expiring');
        default:
          return true;
      }
    });
  }, [templates, selectedCategory]);

  // Helper function to normalize plan period to a standard value
  const normalizePlanPeriod = (seller: Seller): string => {
    // If seller is permanent, always return 'permanente'
    if (seller.is_permanent) return 'permanente';
    
    // If plan_period is set, normalize it
    if (seller.plan_period) {
      const period = seller.plan_period.toLowerCase().trim();
      
      // Check against known aliases
      if (['permanente', 'vitalicio', 'vitalício', 'permanent', 'lifetime'].includes(period)) {
        return 'permanente';
      }
      if (['mensal', 'monthly', '30'].includes(period)) return 'mensal';
      if (['trimestral', 'quarterly', '90'].includes(period)) return 'trimestral';
      if (['semestral', 'semiannual', '180'].includes(period)) return 'semestral';
      if (['anual', 'annual', 'yearly', '365'].includes(period)) return 'anual';
      
      // Return the normalized version if it matches a known period
      return period;
    }
    
    // Try to infer from subscription_expires_at if plan_period is not set
    if (seller.subscription_expires_at) {
      const expirationDate = new Date(seller.subscription_expires_at);
      const now = new Date();
      const createdDate = now; // We'd ideally use created_at but we don't have it here
      
      // Calculate total days of the plan based on remaining days
      const daysRemaining = Math.ceil(
        (expirationDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      );
      
      // If more than 400 days, likely permanent
      if (daysRemaining > 400) return 'permanente';
      if (daysRemaining > 185) return 'anual';
      if (daysRemaining > 95) return 'semestral';
      if (daysRemaining > 35) return 'trimestral';
      return 'mensal';
    }
    
    return 'mensal'; // Default fallback
  };

  // Filter sellers based on selected filters
  const filteredSellers = useMemo(() => {
    let filtered = allSellers;

    // Filter by active status
    if (statusFilter === 'active') {
      filtered = filtered.filter(s => {
        if (s.is_permanent) return s.is_active;
        if (!s.subscription_expires_at) return s.is_active;
        return s.is_active && new Date(s.subscription_expires_at) > new Date();
      });
    } else if (statusFilter === 'expired') {
      filtered = filtered.filter(s => {
        if (s.is_permanent) return false; // Permanent sellers never expire
        if (!s.subscription_expires_at) return false;
        return new Date(s.subscription_expires_at) <= new Date();
      });
    } else {
      // 'all' - but still only active ones with WhatsApp
      filtered = filtered.filter(s => s.is_active);
    }

    // Filter by selected plan periods
    if (selectedPeriods.length > 0) {
      filtered = filtered.filter(s => {
        const normalizedPeriod = normalizePlanPeriod(s);
        return selectedPeriods.includes(normalizedPeriod);
      });
    }

    return filtered;
  }, [allSellers, selectedPeriods, statusFilter]);

  // Fetch recent broadcasts
  const { data: broadcasts = [] } = useQuery({
    queryKey: ['admin-broadcasts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('admin_broadcasts')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) throw error;
      return data as Broadcast[];
    },
  });

  // Fetch active broadcast progress
  const { data: activeBroadcast } = useQuery({
    queryKey: ['active-broadcast', currentBroadcastId],
    queryFn: async () => {
      if (!currentBroadcastId) return null;
      
      const { data, error } = await supabase
        .from('admin_broadcasts')
        .select('*')
        .eq('id', currentBroadcastId)
        .single();

      if (error) throw error;
      return data as Broadcast;
    },
    enabled: !!currentBroadcastId,
    refetchInterval: isSending ? 2000 : false,
  });

  // Get app URL
  const appUrl = window.location.origin;

  // Default message template
  const defaultMessage = `🎉 Novidades! 

Olá {nome}!

Temos uma atualização importante do nosso sistema de gestão! 

🔗 Acesse agora: ${appUrl}

Este é o novo sistema atualizado com melhorias e novas funcionalidades. Use seu e-mail e senha para acessar.

Qualquer dúvida estamos à disposição!`;

  // Handle template selection
  const handleTemplateSelect = (templateId: string) => {
    setSelectedTemplate(templateId);
    // If custom message selected, don't change the message
    if (templateId === '__custom__') {
      return;
    }
    const template = templates.find(t => t.id === templateId);
    if (template) {
      setMessage(template.message);
    }
  };

  // Toggle period selection
  const togglePeriod = (period: string) => {
    setSelectedPeriods(prev => 
      prev.includes(period) 
        ? prev.filter(p => p !== period)
        : [...prev, period]
    );
  };

  const createBroadcastMutation = useMutation({
    mutationFn: async () => {
      // Create broadcast record
      const { data: broadcast, error: broadcastError } = await supabase
        .from('admin_broadcasts')
        .insert({
          admin_id: user!.id,
          message,
          interval_seconds: intervalSeconds,
          total_recipients: filteredSellers.length,
          status: 'sending',
          started_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (broadcastError) throw broadcastError;

      // Create recipient records
      const recipients = filteredSellers.map(seller => ({
        broadcast_id: broadcast.id,
        seller_id: seller.id,
        status: 'pending',
      }));

      const { error: recipientsError } = await supabase
        .from('admin_broadcast_recipients')
        .insert(recipients);

      if (recipientsError) throw recipientsError;

      return broadcast;
    },
    onSuccess: (broadcast) => {
      setCurrentBroadcastId(broadcast.id);
      setIsSending(true);
      processBroadcast(broadcast.id);
    },
    onError: (error: Error) => {
      toast.error('Erro ao criar broadcast: ' + error.message);
    },
  });

  const processBroadcast = async (broadcastId: string) => {
    try {
      // Get pending recipients
      const { data: pendingRecipients } = await supabase
        .from('admin_broadcast_recipients')
        .select('id, seller_id')
        .eq('broadcast_id', broadcastId)
        .eq('status', 'pending');

      if (!pendingRecipients?.length) {
        // Mark broadcast as completed
        await supabase
          .from('admin_broadcasts')
          .update({ 
            status: 'completed',
            completed_at: new Date().toISOString()
          })
          .eq('id', broadcastId);

        setIsSending(false);
        queryClient.invalidateQueries({ queryKey: ['admin-broadcasts'] });
        toast.success('Broadcast concluído!');
        setDialogOpen(false);
        return;
      }

      // Get global config
      const { data: globalConfig } = await supabase
        .from('whatsapp_global_config')
        .select('*')
        .eq('is_active', true)
        .maybeSingle();

      // Get admin instance
      const { data: adminInstance } = await supabase
        .from('whatsapp_seller_instances')
        .select('*')
        .eq('seller_id', user!.id)
        .eq('is_connected', true)
        .maybeSingle();

      for (const recipient of pendingRecipients) {
        if (!isSending) break;

        const seller = filteredSellers.find(s => s.id === recipient.seller_id);
        if (!seller?.whatsapp) continue;

        // Replace variables in message
        const personalizedMessage = message
          .replace(/{nome}/g, seller.full_name || seller.email.split('@')[0])
          .replace(/{email}/g, seller.email)
          .replace(/{whatsapp}/g, seller.whatsapp);

        let sent = false;

        // Try sending via Evolution API
        if (globalConfig && adminInstance) {
          try {
            const { data, error } = await supabase.functions.invoke('evolution-api', {
              body: {
                action: 'send_message',
                api_url: globalConfig.api_url,
                api_token: globalConfig.api_token,
                instance_name: adminInstance.instance_name,
                phone: seller.whatsapp,
                message: personalizedMessage,
              },
            });

            sent = !error && data?.success;
          } catch (e) {
            console.error('Error sending via API:', e);
          }
        }

        // Update recipient status
        await supabase
          .from('admin_broadcast_recipients')
          .update({
            status: sent ? 'sent' : 'failed',
            sent_at: sent ? new Date().toISOString() : null,
            error_message: sent ? null : 'Falha ao enviar',
          })
          .eq('id', recipient.id);

        // Update broadcast counts
        const { data: currentBroadcast } = await supabase
          .from('admin_broadcasts')
          .select('sent_count, failed_count')
          .eq('id', broadcastId)
          .single();

        if (currentBroadcast) {
          const updateData = sent
            ? { sent_count: (currentBroadcast.sent_count || 0) + 1 }
            : { failed_count: (currentBroadcast.failed_count || 0) + 1 };

          await supabase
            .from('admin_broadcasts')
            .update(updateData)
            .eq('id', broadcastId);
        }

        queryClient.invalidateQueries({ queryKey: ['active-broadcast', broadcastId] });

        // Wait for interval
        await new Promise(resolve => setTimeout(resolve, intervalSeconds * 1000));
      }

      // Recursively process remaining
      if (isSending) {
        processBroadcast(broadcastId);
      }
    } catch (error) {
      console.error('Error processing broadcast:', error);
      setIsSending(false);
    }
  };

  const handleStartBroadcast = () => {
    if (!message.trim()) {
      toast.error('Digite uma mensagem');
      return;
    }
    if (filteredSellers.length === 0) {
      toast.error('Nenhum revendedor corresponde aos filtros selecionados');
      return;
    }
    createBroadcastMutation.mutate();
  };

  const handleStopBroadcast = () => {
    setIsSending(false);
    if (currentBroadcastId) {
      supabase
        .from('admin_broadcasts')
        .update({ status: 'paused' })
        .eq('id', currentBroadcastId);
    }
    toast.info('Broadcast pausado');
  };

  const handleResumeBroadcast = (broadcastId: string) => {
    setCurrentBroadcastId(broadcastId);
    setIsSending(true);
    processBroadcast(broadcastId);
  };

  const clearFilters = () => {
    setSelectedPeriods([]);
    setSelectedCategory('all');
    setSelectedTemplate('');
    setStatusFilter('all');
  };

  const progress = activeBroadcast
    ? ((activeBroadcast.sent_count + activeBroadcast.failed_count) / activeBroadcast.total_recipients) * 100
    : 0;

  const activeFiltersCount = selectedPeriods.length + (selectedCategory !== 'all' ? 1 : 0) + (statusFilter !== 'all' ? 1 : 0);

  return (
    <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <MessageSquare className="h-4 w-4" />
          Broadcast para Revendedores
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="h-5 w-5" />
            Enviar Mensagem para Revendedores
          </DialogTitle>
          <DialogDescription>
            Filtre revendedores por período de plano e tipo de mensagem
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Advanced Filters Section */}
          <Collapsible open={filtersOpen} onOpenChange={setFiltersOpen}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" className="w-full justify-between p-3 h-auto border rounded-lg">
                <div className="flex items-center gap-2">
                  <Filter className="h-4 w-4" />
                  <span className="font-medium">Filtros Avançados</span>
                  {activeFiltersCount > 0 && (
                    <Badge variant="secondary">{activeFiltersCount} ativo(s)</Badge>
                  )}
                </div>
                <ChevronDown className={`h-4 w-4 transition-transform ${filtersOpen ? 'rotate-180' : ''}`} />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-4 space-y-4">
              {/* Status Filter */}
              <div className="space-y-2">
                <Label className="flex items-center gap-2 text-sm">
                  <Users className="h-4 w-4" />
                  Status do Revendedor
                </Label>
                <Tabs value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
                  <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="all">Todos</TabsTrigger>
                    <TabsTrigger value="active">Ativos</TabsTrigger>
                    <TabsTrigger value="expired">Expirados</TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>

              {/* Plan Period Filter */}
              <div className="space-y-2">
                <Label className="flex items-center gap-2 text-sm">
                  <Calendar className="h-4 w-4" />
                  Período do Plano
                </Label>
                <div className="flex flex-wrap gap-2">
                  {PLAN_PERIODS.map((period) => (
                    <div
                      key={period.value}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-colors ${
                        selectedPeriods.includes(period.value)
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-background hover:bg-muted border-border'
                      }`}
                      onClick={() => togglePeriod(period.value)}
                    >
                      <Checkbox
                        checked={selectedPeriods.includes(period.value)}
                        className="pointer-events-none"
                      />
                      <span className="text-sm">{period.label}</span>
                    </div>
                  ))}
                </div>
                {selectedPeriods.length === 0 && (
                  <p className="text-xs text-muted-foreground">
                    Nenhum período selecionado = todos os períodos
                  </p>
                )}
              </div>

              {/* Message Category Filter */}
              <div className="space-y-2">
                <Label className="flex items-center gap-2 text-sm">
                  <FileText className="h-4 w-4" />
                  Categoria de Mensagem
                </Label>
                <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione uma categoria" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">📋 Todas as categorias</SelectItem>
                    {MESSAGE_CATEGORIES.map((cat) => (
                      <SelectItem key={cat.value} value={cat.value}>
                        {cat.icon} {cat.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Template Selection */}
              {filteredTemplates.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-sm">Template de Mensagem</Label>
                  <Select value={selectedTemplate} onValueChange={handleTemplateSelect}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione um template ou escreva sua mensagem" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__custom__">✍️ Mensagem personalizada</SelectItem>
                      {filteredTemplates.map((template) => (
                        <SelectItem key={template.id} value={template.id}>
                          {template.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Clear Filters */}
              {activeFiltersCount > 0 && (
                <Button variant="ghost" size="sm" onClick={clearFilters} className="text-muted-foreground">
                  <RotateCcw className="h-3 w-3 mr-1" />
                  Limpar filtros
                </Button>
              )}
            </CollapsibleContent>
          </Collapsible>

          {/* Stats */}
          <div className="flex gap-4">
            <Card className="flex-1">
              <CardContent className="p-4 flex items-center gap-3">
                <Users className="h-8 w-8 text-primary" />
                <div>
                  <div className="text-2xl font-bold">{filteredSellers.length}</div>
                  <div className="text-xs text-muted-foreground">
                    {filteredSellers.length === allSellers.length 
                      ? 'Revendedores com WhatsApp'
                      : `de ${allSellers.length} (filtrado)`}
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="flex-1">
              <CardContent className="p-4 flex items-center gap-3">
                <LinkIcon className="h-8 w-8 text-blue-500" />
                <div>
                  <div className="text-sm font-mono truncate max-w-[200px]">{appUrl}</div>
                  <div className="text-xs text-muted-foreground">Link do App</div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Filtered Sellers Preview */}
          {selectedPeriods.length > 0 && (
            <div className="space-y-2">
              <Label className="flex items-center justify-between">
                <span>Revendedores Selecionados ({filteredSellers.length})</span>
                {filteredSellers.length === 0 && (
                  <span className="text-xs text-warning">Nenhum revendedor nesta categoria</span>
                )}
              </Label>
              <ScrollArea className="h-32 border rounded-lg">
                <div className="p-2 space-y-1">
                  {filteredSellers.length > 0 ? (
                    filteredSellers.map((seller) => {
                      const period = normalizePlanPeriod(seller);
                      const periodLabel = PLAN_PERIODS.find(p => p.value === period)?.label || period;
                      
                      return (
                        <div
                          key={seller.id}
                          className="flex items-center justify-between p-2 bg-muted/30 rounded text-sm"
                        >
                          <div className="flex items-center gap-2">
                            <span className="font-medium truncate max-w-[150px]">
                              {seller.full_name || seller.email.split('@')[0]}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {seller.whatsapp}
                            </span>
                          </div>
                          <Badge variant="outline" className="text-xs">
                            {periodLabel}
                          </Badge>
                        </div>
                      );
                    })
                  ) : (
                    <div className="flex items-center justify-center h-20 text-sm text-muted-foreground">
                      Nenhum revendedor corresponde aos filtros selecionados
                    </div>
                  )}
                </div>
              </ScrollArea>
            </div>
          )}

          {/* Message */}
          <div className="space-y-2">
            <Label>Mensagem</Label>
            <Textarea
              value={message || defaultMessage}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Digite a mensagem..."
              rows={8}
              className="font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">
              Variáveis: {'{nome}'}, {'{email}'}, {'{whatsapp}'}
            </p>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setMessage(defaultMessage)}
            >
              <RotateCcw className="h-3 w-3 mr-1" />
              Usar mensagem padrão
            </Button>
          </div>

          {/* Interval */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Intervalo entre mensagens (segundos)
            </Label>
            <Input
              type="number"
              min={10}
              max={300}
              value={intervalSeconds}
              onChange={(e) => setIntervalSeconds(parseInt(e.target.value) || 30)}
            />
            <p className="text-xs text-muted-foreground">
              Tempo estimado: {Math.ceil((filteredSellers.length * intervalSeconds) / 60)} minutos
            </p>
          </div>

          {/* Active Broadcast Progress */}
          {activeBroadcast && isSending && (
            <Card className="border-primary">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Enviando...
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <Progress value={progress} className="h-2" />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <CheckCircle className="h-3 w-3 text-green-500" />
                    {activeBroadcast.sent_count} enviados
                  </span>
                  <span className="flex items-center gap-1">
                    <XCircle className="h-3 w-3 text-red-500" />
                    {activeBroadcast.failed_count} falhas
                  </span>
                  <span>
                    {activeBroadcast.sent_count + activeBroadcast.failed_count} / {activeBroadcast.total_recipients}
                  </span>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Recent Broadcasts */}
          {broadcasts.length > 0 && (
            <div className="space-y-2">
              <Label>Broadcasts Recentes</Label>
              <ScrollArea className="h-32 border rounded-lg">
                <div className="p-2 space-y-2">
                  {broadcasts.slice(0, 5).map((broadcast) => (
                    <div
                      key={broadcast.id}
                      className="flex items-center justify-between p-2 bg-muted/30 rounded text-sm"
                    >
                      <div className="flex items-center gap-2">
                        <Badge variant={
                          broadcast.status === 'completed' ? 'default' :
                          broadcast.status === 'sending' ? 'secondary' :
                          'outline'
                        }>
                          {broadcast.status === 'completed' ? 'Concluído' :
                           broadcast.status === 'sending' ? 'Enviando' :
                           broadcast.status === 'paused' ? 'Pausado' : 'Pendente'}
                        </Badge>
                        <span className="text-muted-foreground">
                          {broadcast.sent_count}/{broadcast.total_recipients}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">
                          {new Date(broadcast.created_at).toLocaleDateString('pt-BR')}
                        </span>
                        {broadcast.status === 'paused' && (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6"
                            onClick={() => handleResumeBroadcast(broadcast.id)}
                          >
                            <Play className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          {isSending ? (
            <Button variant="destructive" onClick={handleStopBroadcast}>
              <Pause className="h-4 w-4 mr-2" />
              Pausar
            </Button>
          ) : (
            <Button
              onClick={handleStartBroadcast}
              disabled={filteredSellers.length === 0 || createBroadcastMutation.isPending}
            >
              {createBroadcastMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Send className="h-4 w-4 mr-2" />
              )}
              Iniciar Broadcast ({filteredSellers.length} revendedores)
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}