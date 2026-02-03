/**
 * ClientFormDialog - Componente de Diálogo para Criação/Edição de Clientes
 * 
 * Etapa 2.13 do refactoring: Extração da renderização do Dialog do Clients.tsx
 * 
 * IMPORTANTE: Este componente foi extraído de Clients.tsx para:
 * - Reduzir complexidade do componente principal
 * - Facilitar manutenção e testes
 * - Permitir reutilização em outros contextos
 * 
 * STATUS: Standalone - NÃO INTEGRADO AO CLIENTS.TSX (aguardando validação)
 * 
 * @see useClientFormData para gerenciamento de dados do formulário
 * @see useClientDialogState para controle de estado do diálogo
 * @see useClientSave para lógica de salvamento
 */

import React, { useState, useCallback, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarPicker } from '@/components/ui/calendar';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { 
  Plus, 
  CalendarIcon, 
  Lock, 
  Loader2, 
  Monitor, 
  ChevronDown, 
  Send,
  Sparkles,
  Trash2,
  DollarSign,
} from 'lucide-react';
import { format, addDays, addMonths } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { PlanSelector } from '@/components/PlanSelector';
import { 
  DnsFieldsSection, 
  SharedCreditsSection, 
  AppsSection, 
  AdditionalServersSection, 
  ServerPartnerAppsSection 
} from '@/components/client-form';
import { ClientPremiumAccounts, PremiumAccount } from '@/components/ClientPremiumAccounts';
import type { SharedCreditSelection } from '@/components/SharedCreditPicker';
import type { 
  Client, 
  ClientCategory, 
  Plan, 
  ServerData, 
  AdditionalServer, 
  MacDevice,
  DEVICE_OPTIONS,
  DEFAULT_CATEGORIES,
} from '@/types/clients';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { ConfirmDialog } from '@/components/ConfirmDialog';

// ============= Interfaces =============

export interface ClientFormDialogProps {
  /** Whether the dialog is open */
  open: boolean;
  /** Callback when open state changes */
  onOpenChange: (open: boolean) => void;
  /** Client being edited (null for new client) */
  editingClient: Client | null;
  /** User ID of the seller */
  userId: string;
  /** Callback when client is saved successfully */
  onSaveSuccess?: () => void;
  /** Callback when save fails */
  onSaveError?: (error: Error) => void;
  /** Trigger element for the dialog */
  trigger?: React.ReactNode;
}

export interface ClientFormData {
  name: string;
  phone: string;
  telegram: string;
  email: string;
  device: string;
  dns: string;
  expiration_date: string;
  plan_id: string;
  plan_name: string;
  plan_price: string;
  premium_price: string;
  server_id: string;
  server_name: string;
  login: string;
  password: string;
  server_id_2: string;
  server_name_2: string;
  login_2: string;
  password_2: string;
  premium_password: string;
  category: string;
  is_paid: boolean;
  pending_amount: string;
  expected_payment_date: string;
  notes: string;
  has_paid_apps: boolean;
  paid_apps_duration: string;
  paid_apps_expiration: string;
  paid_apps_email: string;
  paid_apps_password: string;
  gerencia_app_mac: string;
  gerencia_app_devices: MacDevice[];
  app_name: string;
  app_type: string;
  device_model: string;
  has_adult_content: boolean;
  screens: string;
}

// Device options - matching Clients.tsx
const DEVICE_OPTIONS_LOCAL = [
  { value: 'TV', icon: '📺' },
  { value: 'Celular', icon: '📱' },
  { value: 'TV Box', icon: '📦' },
  { value: 'Computador', icon: '💻' },
  { value: 'Tablet', icon: '📲' },
  { value: 'Outro', icon: '🔌' },
];

// Default categories
const DEFAULT_CATEGORIES_LOCAL = ['IPTV', 'P2P', 'SSH', 'Contas Premium', 'Revendedor'];

const INITIAL_FORM_STATE: ClientFormData = {
  name: '',
  phone: '',
  telegram: '',
  email: '',
  device: '',
  dns: '',
  expiration_date: format(new Date(), 'yyyy-MM-dd'),
  plan_id: '',
  plan_name: '',
  plan_price: '',
  premium_price: '',
  server_id: '',
  server_name: '',
  login: '',
  password: '',
  server_id_2: '',
  server_name_2: '',
  login_2: '',
  password_2: '',
  premium_password: '',
  category: 'IPTV',
  is_paid: true,
  pending_amount: '',
  expected_payment_date: '',
  notes: '',
  has_paid_apps: false,
  paid_apps_duration: '',
  paid_apps_expiration: '',
  paid_apps_email: '',
  paid_apps_password: '',
  gerencia_app_mac: '',
  gerencia_app_devices: [],
  app_name: '',
  app_type: 'server',
  device_model: '',
  has_adult_content: false,
  screens: '1',
};

/**
 * ClientFormDialog Component
 * 
 * A self-contained dialog for creating/editing clients.
 * Extracts ~800 lines of JSX from Clients.tsx into a reusable component.
 */
export function ClientFormDialog({
  open,
  onOpenChange,
  editingClient,
  userId,
  onSaveSuccess,
  onSaveError,
  trigger,
}: ClientFormDialogProps) {
  const queryClient = useQueryClient();
  const { dialogProps, confirm } = useConfirmDialog();
  
  // Local type matching AdditionalServersSection internal interface
  type LocalAdditionalServer = { server_id: string; server_name: string; login: string; password: string; expiration_date?: string | null };
  
  // ============= Form State =============
  const [formData, setFormData] = useState<ClientFormData>(INITIAL_FORM_STATE);
  const [selectedSharedCredit, setSelectedSharedCredit] = useState<SharedCreditSelection | null>(null);
  const [externalApps, setExternalApps] = useState<any[]>([]);
  const [premiumAccounts, setPremiumAccounts] = useState<PremiumAccount[]>([]);
  const [additionalServers, setAdditionalServers] = useState<LocalAdditionalServer[]>([]);
  const [serverAppsConfig, setServerAppsConfig] = useState<any[]>([]);
  
  // ============= Popover State =============
  const [addCategoryOpen, setAddCategoryOpen] = useState(false);
  const [expirationPopoverOpen, setExpirationPopoverOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  
  // ============= Data Queries =============
  const { data: plans = [] } = useQuery({
    queryKey: ['plans', userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('plans')
        .select('id, name, price, duration_days, is_active, category')
        .eq('seller_id', userId)
        .eq('is_active', true)
        .order('price');
      if (error) throw error;
      return data as Plan[];
    },
    enabled: !!userId && open,
    staleTime: 1000 * 60 * 5,
  });
  
  const { data: servers = [] } = useQuery({
    queryKey: ['servers-all', userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('servers')
        .select('id, name, is_active, is_credit_based, panel_url, icon_url, iptv_per_credit, p2p_per_credit, total_screens_per_credit')
        .eq('seller_id', userId)
        .order('name');
      if (error) throw error;
      return data as ServerData[];
    },
    enabled: !!userId && open,
    staleTime: 1000 * 60 * 5,
  });
  
  const { data: customCategories = [] } = useQuery({
    queryKey: ['client-categories', userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('client_categories')
        .select('id, name, seller_id')
        .eq('seller_id', userId)
        .order('name');
      if (error) throw error;
      return data as ClientCategory[];
    },
    enabled: !!userId && open,
    staleTime: 1000 * 60 * 5,
  });

  const { data: serverApps = [] } = useQuery({
    queryKey: ['server-apps', userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('server_apps')
        .select('*')
        .eq('seller_id', userId);
      if (error) throw error;
      return data || [];
    },
    enabled: !!userId && open,
  });

  const { data: resellerApps = [] } = useQuery({
    queryKey: ['reseller-device-apps', userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('reseller_device_apps')
        .select('*')
        .eq('seller_id', userId);
      if (error) throw error;
      return data || [];
    },
    enabled: !!userId && open,
  });
  
  // ============= Derived Values =============
  const activeServers = servers.filter(s => s.is_active);
  const allCategories = [...DEFAULT_CATEGORIES_LOCAL, ...customCategories.map(c => c.name)];
  const selectedServer = servers.find(s => s.id === formData.server_id);
  const maxScreens = selectedServer?.total_screens_per_credit || 1;
  const isWplayServer = selectedServer?.name?.toUpperCase() === 'WPLAY';
  
  // ============= Form Reset =============
  const resetForm = useCallback(() => {
    setFormData(INITIAL_FORM_STATE);
    setSelectedSharedCredit(null);
    setExternalApps([]);
    setPremiumAccounts([]);
    setAdditionalServers([]);
    setServerAppsConfig([]);
    setNewCategoryName('');
  }, []);
  
  // ============= Populate form when editing =============
  useEffect(() => {
    if (editingClient && open) {
      setFormData({
        name: editingClient.name || '',
        phone: editingClient.phone || '',
        telegram: editingClient.telegram || '',
        email: editingClient.email || '',
        device: editingClient.device || '',
        dns: editingClient.dns || '',
        expiration_date: editingClient.expiration_date || format(new Date(), 'yyyy-MM-dd'),
        plan_id: editingClient.plan_id || '',
        plan_name: editingClient.plan_name || '',
        plan_price: editingClient.plan_price?.toString() || '',
        premium_price: editingClient.premium_price?.toString() || '',
        server_id: editingClient.server_id || '',
        server_name: editingClient.server_name || '',
        login: editingClient.login || '',
        password: editingClient.password || '',
        server_id_2: editingClient.server_id_2 || '',
        server_name_2: editingClient.server_name_2 || '',
        login_2: editingClient.login_2 || '',
        password_2: editingClient.password_2 || '',
        premium_password: editingClient.premium_password || '',
        category: editingClient.category || 'IPTV',
        is_paid: editingClient.is_paid ?? true,
        pending_amount: editingClient.pending_amount?.toString() || '',
        expected_payment_date: (editingClient as any).expected_payment_date || '',
        notes: editingClient.notes || '',
        has_paid_apps: editingClient.has_paid_apps ?? false,
        paid_apps_duration: editingClient.paid_apps_duration || '',
        paid_apps_expiration: editingClient.paid_apps_expiration || '',
        paid_apps_email: (editingClient as any).paid_apps_email || '',
        paid_apps_password: (editingClient as any).paid_apps_password || '',
        gerencia_app_mac: editingClient.gerencia_app_mac || '',
        gerencia_app_devices: editingClient.gerencia_app_devices || [],
        app_name: editingClient.app_name || '',
        app_type: editingClient.app_type || 'server',
        device_model: editingClient.device_model || '',
        has_adult_content: (editingClient as any).has_adult_content ?? false,
        screens: '1',
      });
      
      // Populate additional servers if exists - map to ensure required fields
      if (editingClient.additional_servers && Array.isArray(editingClient.additional_servers)) {
        setAdditionalServers(
          (editingClient.additional_servers as AdditionalServer[]).map(s => ({
            server_id: s.server_id,
            server_name: s.server_name,
            login: s.login || '',
            password: s.password || '',
            expiration_date: s.expiration_date || null,
          }))
        );
      }
    } else if (!open) {
      resetForm();
    }
  }, [editingClient, open, resetForm]);
  
  // ============= Check for unsaved changes =============
  const hasFormChanges = useCallback(() => {
    if (!editingClient) {
      // For new clients, check if any meaningful data was entered
      return formData.name.trim() !== '' || 
             formData.phone.trim() !== '' ||
             formData.login.trim() !== '' ||
             externalApps.length > 0 ||
             premiumAccounts.length > 0 ||
             additionalServers.length > 0;
    }
    return false;
  }, [formData, editingClient, externalApps.length, premiumAccounts.length, additionalServers.length]);
  
  // ============= Dialog Close Handler =============
  const handleOpenChange = useCallback((newOpen: boolean) => {
    if (!newOpen) {
      // Closing dialog
      if (!editingClient && hasFormChanges()) {
        confirm({
          title: 'Descartar alterações?',
          description: 'Você tem dados não salvos. Deseja sair sem salvar?',
          confirmText: 'Sair sem salvar',
          cancelText: 'Continuar editando',
          variant: 'warning',
          onConfirm: () => {
            resetForm();
            onOpenChange(false);
          },
        });
        return;
      }
      resetForm();
    }
    onOpenChange(newOpen);
  }, [editingClient, hasFormChanges, confirm, resetForm, onOpenChange]);
  
  // ============= Category Mutation =============
  const addCategoryMutation = useMutation({
    mutationFn: async (name: string) => {
      const { error } = await supabase
        .from('client_categories')
        .insert({ name, seller_id: userId });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['client-categories'] });
      setNewCategoryName('');
      setAddCategoryOpen(false);
      toast.success('Categoria criada com sucesso!');
    },
    onError: (error: Error) => {
      if (error.message.includes('duplicate')) {
        toast.error('Esta categoria já existe');
      } else {
        toast.error(error.message);
      }
    },
  });
  
  // ============= Plan Selection Handler =============
  const handlePlanChange = useCallback((planId: string) => {
    const selectedPlan = plans.find(p => p.id === planId);
    if (selectedPlan) {
      const today = new Date();
      today.setHours(12, 0, 0, 0);
      const newExpiration = addDays(today, selectedPlan.duration_days);
      
      setFormData(prev => ({
        ...prev,
        plan_id: planId,
        plan_name: selectedPlan.name,
        plan_price: selectedPlan.price?.toString() || '',
        expiration_date: format(newExpiration, 'yyyy-MM-dd'),
      }));
    }
  }, [plans]);
  
  // ============= Server Selection Handler =============
  const handleServerChange = useCallback((serverId: string) => {
    const server = servers.find(s => s.id === serverId);
    setFormData(prev => ({
      ...prev,
      server_id: serverId,
      server_name: server?.name || '',
    }));
  }, [servers]);
  
  // ============= Shared Credit Handler =============
  const handleSharedCreditSelect = useCallback((credit: SharedCreditSelection | null) => {
    setSelectedSharedCredit(credit);
  }, []);
  
  // ============= Form Submit =============
  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Basic validation
    if (!formData.name.trim()) {
      toast.error('Nome é obrigatório');
      return;
    }
    
    // NOTE: Full save logic should be handled by parent component
    // This component focuses on UI/UX, the parent handles persistence
    toast.info('Salvamento pendente - integração com Clients.tsx necessária');
  }, [formData]);

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
        
        <DialogContent className="max-w-lg sm:max-w-2xl w-[95vw] max-h-[80vh] p-0 flex flex-col overflow-hidden">
          <DialogHeader className="px-4 pt-4 pb-2 sm:px-6 sm:pt-6 sm:pb-3 flex-shrink-0 border-b">
            <DialogTitle className="text-base sm:text-lg">
              {editingClient ? 'Editar Cliente' : 'Novo Cliente'}
            </DialogTitle>
            <DialogDescription className="text-xs sm:text-sm">
              {editingClient ? 'Atualize os dados do cliente' : 'Preencha os dados do novo cliente'}
            </DialogDescription>
          </DialogHeader>
          
          {/* Scroll container - isolated + prevents scroll anchoring jumps */}
          <div
            className="flex-1 min-h-0 overflow-y-auto overscroll-contain touch-pan-y px-4 sm:px-6"
            style={{ WebkitOverflowScrolling: "touch", overflowAnchor: "none" }}
          >
            <form onSubmit={handleSubmit} className="client-form-mobile space-y-3 sm:space-y-4 py-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
                {/* Category Select with Add Button */}
                <div className="space-y-2 md:col-span-2">
                  <Label>Categoria *</Label>
                  <div className="flex gap-2">
                    <Select
                      value={formData.category}
                      onValueChange={(value) => setFormData({ ...formData, category: value })}
                    >
                      <SelectTrigger className="flex-1">
                        <SelectValue placeholder="Selecione a categoria" />
                      </SelectTrigger>
                      <SelectContent>
                        {allCategories.map((cat) => (
                          <SelectItem key={cat} value={cat}>
                            {cat}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Popover open={addCategoryOpen} onOpenChange={setAddCategoryOpen}>
                      <PopoverTrigger asChild>
                        <Button type="button" variant="outline" size="icon">
                          <Plus className="h-4 w-4" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-64 p-3" align="end">
                        <div className="space-y-3">
                          <Label className="text-sm font-medium">Nova Categoria</Label>
                          <Input
                            placeholder="Nome da categoria"
                            value={newCategoryName}
                            onChange={(e) => setNewCategoryName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && newCategoryName.trim()) {
                                e.preventDefault();
                                addCategoryMutation.mutate(newCategoryName.trim());
                              }
                            }}
                          />
                          <Button
                            type="button"
                            size="sm"
                            className="w-full"
                            onClick={() => {
                              if (newCategoryName.trim()) {
                                addCategoryMutation.mutate(newCategoryName.trim());
                              }
                            }}
                            disabled={!newCategoryName.trim() || addCategoryMutation.isPending}
                          >
                            {addCategoryMutation.isPending ? (
                              <Loader2 className="h-4 w-4 animate-spin mr-2" />
                            ) : (
                              <Plus className="h-4 w-4 mr-2" />
                            )}
                            Adicionar
                          </Button>
                        </div>
                      </PopoverContent>
                    </Popover>
                    
                    {/* Adult Content Toggle - Only for IPTV/P2P */}
                    {(formData.category === 'IPTV' || formData.category === 'P2P') && (
                      <Button
                        type="button"
                        variant={formData.has_adult_content ? "default" : "outline"}
                        size="icon"
                        onClick={() => setFormData({ ...formData, has_adult_content: !formData.has_adult_content })}
                        className={cn(
                          "shrink-0 text-lg",
                          formData.has_adult_content 
                            ? "bg-pink-600 hover:bg-pink-700 text-white" 
                            : "hover:bg-muted"
                        )}
                        title={formData.has_adult_content ? "Com conteúdo adulto (+18)" : "Sem conteúdo adulto (-18)"}
                      >
                        {formData.has_adult_content ? '+🔞' : '-🔞'}
                      </Button>
                    )}
                  </div>
                  {(formData.category === 'IPTV' || formData.category === 'P2P') && (
                    <p className="text-xs text-muted-foreground">
                      {formData.has_adult_content 
                        ? '✅ Conteúdo adulto habilitado (+18)' 
                        : '❌ Conteúdo adulto desabilitado (-18)'
                      }
                    </p>
                  )}
                </div>

                {/* Name Field */}
                <div className="space-y-2">
                  <Label htmlFor="name">Nome *</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                  />
                </div>
                
                {/* Phone Field */}
                <div className="space-y-2">
                  <Label htmlFor="phone">Telefone (WhatsApp)</Label>
                  <Input
                    id="phone"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    placeholder="+55 11 99999-9999"
                  />
                </div>
                
                {/* Telegram Field */}
                <div className="space-y-2">
                  <Label htmlFor="telegram" className="flex items-center gap-1">
                    <Send className="h-3 w-3" />
                    Telegram
                  </Label>
                  <Input
                    id="telegram"
                    value={formData.telegram}
                    onChange={(e) => setFormData({ ...formData, telegram: e.target.value })}
                    placeholder="@usuario"
                  />
                </div>

                {/* Premium Accounts - Multiple accounts for Contas Premium category */}
                {formData.category === 'Contas Premium' && (
                  <div className="md:col-span-2 p-4 rounded-lg bg-gradient-to-r from-amber-500/10 to-orange-500/10 border border-amber-500/30">
                    <ClientPremiumAccounts
                      sellerId={userId}
                      onChange={setPremiumAccounts}
                      initialAccounts={premiumAccounts}
                    />
                  </div>
                )}
                
                {/* Devices Selection */}
                <div className="space-y-2 md:col-span-2">
                  <Label>Dispositivos</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className="w-full justify-between font-normal"
                        type="button"
                      >
                        {formData.device 
                          ? formData.device.split(', ').length > 2 
                            ? `${formData.device.split(', ').slice(0, 2).join(', ')} +${formData.device.split(', ').length - 2}`
                            : formData.device
                          : 'Selecione os dispositivos'}
                        <ChevronDown className="h-4 w-4 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-64 p-3" align="start">
                      <div className="space-y-2">
                        {DEVICE_OPTIONS_LOCAL.map((device) => {
                          const isSelected = formData.device.split(', ').includes(device.value);
                          return (
                            <label
                              key={device.value}
                              className="flex items-center gap-3 p-2 rounded-md hover:bg-muted cursor-pointer"
                            >
                              <Checkbox
                                checked={isSelected}
                                onCheckedChange={(checked) => {
                                  const currentDevices = formData.device ? formData.device.split(', ').filter(Boolean) : [];
                                  let newDevices: string[];
                                  
                                  if (checked) {
                                    newDevices = [...currentDevices, device.value];
                                  } else {
                                    newDevices = currentDevices.filter(d => d !== device.value);
                                  }
                                  
                                  setFormData({ ...formData, device: newDevices.join(', ') });
                                }}
                              />
                              <span className="text-lg">{device.icon}</span>
                              <span>{device.value}</span>
                            </label>
                          );
                        })}
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>

                {/* Device Model - Only when device is selected */}
                {formData.device && (
                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="device_model">Marca/Modelo da TV</Label>
                    <Input
                      id="device_model"
                      value={formData.device_model}
                      onChange={(e) => setFormData({ ...formData, device_model: e.target.value })}
                      placeholder="Ex: Samsung 55 Crystal, LG OLED..."
                    />
                    <p className="text-xs text-muted-foreground">
                      Modelo do aparelho principal do cliente (TV, celular, etc.)
                    </p>
                  </div>
                )}

                {/* Plan Selector */}
                <div className="space-y-2 md:col-span-2">
                  <Label>Plano</Label>
                  <PlanSelector
                    plans={plans}
                    value={formData.plan_id}
                    onValueChange={handlePlanChange}
                    placeholder="Selecione um plano"
                    showFilters={true}
                    defaultCategory={formData.category}
                  />
                  {formData.plan_price && (
                    <p className="text-xs text-muted-foreground">
                      Valor: R$ {parseFloat(formData.plan_price).toFixed(2)}
                    </p>
                  )}
                </div>

                {/* Server Selector */}
                {(formData.category === 'IPTV' || formData.category === 'P2P' || formData.category === 'SSH' || formData.category === 'Revendedor') && (
                  <div className="space-y-2 md:col-span-2">
                    <Label>Servidor</Label>
                    <Select
                      value={formData.server_id}
                      onValueChange={handleServerChange}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione o servidor" />
                      </SelectTrigger>
                      <SelectContent className="max-h-[40vh]">
                        {activeServers.map((server) => (
                          <SelectItem key={server.id} value={server.id}>
                            <div className="flex items-center gap-1.5">
                              {server.icon_url && (
                                <img src={server.icon_url} alt="" className="h-4 w-4 rounded" />
                              )}
                              <span className="truncate max-w-[180px]">{server.name}</span>
                              {server.is_credit_based && (
                                <span className="text-[10px] text-muted-foreground ml-0.5">(Créd)</span>
                              )}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* Credit-based server info */}
                {selectedServer?.is_credit_based && (
                  <div className="md:col-span-2 p-4 rounded-lg bg-gradient-to-r from-primary/10 to-purple-500/10 border border-primary/30 space-y-3">
                    <div className="flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-primary" />
                      <Label className="text-sm font-semibold text-primary">Servidor por Créditos</Label>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <p className="text-xs text-muted-foreground">Capacidade por crédito:</p>
                        <div className="flex items-center gap-2 text-sm font-medium">
                          <span className="px-2 py-1 rounded bg-primary/10 text-primary">
                            {selectedServer?.total_screens_per_credit || 1} telas
                          </span>
                          <span className="text-xs text-muted-foreground">
                            ({selectedServer?.iptv_per_credit || 0} IPTV + {selectedServer?.p2p_per_credit || 0} P2P)
                          </span>
                        </div>
                      </div>
                      
                      <div className="space-y-2">
                        <Label className="text-xs">Telas que o cliente comprou</Label>
                        <Select
                          value={formData.screens}
                          onValueChange={(value) => setFormData({ ...formData, screens: value })}
                        >
                          <SelectTrigger className="bg-background">
                            <SelectValue placeholder="Selecione" />
                          </SelectTrigger>
                          <SelectContent>
                            {/* Static list of screen options based on server type */}
                            {isWplayServer && (
                              <>
                                <SelectItem value="1">1 Tela (IPTV)</SelectItem>
                                <SelectItem value="2">2 Telas (IPTV)</SelectItem>
                                <SelectItem value="3">3 Telas (2 IPTV + 1 P2P)</SelectItem>
                              </>
                            )}
                            {!isWplayServer && Array.from({ length: maxScreens }, (_, i) => i + 1).map((num) => (
                              <SelectItem key={`screen-${num}`} value={num.toString()}>
                                {num} {num === 1 ? 'Tela' : 'Telas'}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    
                    {parseInt(formData.screens) < (selectedServer?.total_screens_per_credit || 1) && (
                      <div className="flex items-center gap-2 p-2 rounded-lg bg-amber-500/10 border border-amber-500/30">
                        <Sparkles className="h-4 w-4 text-amber-500 flex-shrink-0" />
                        <p className="text-xs text-amber-600 dark:text-amber-400">
                          <strong>{(selectedServer?.total_screens_per_credit || 1) - parseInt(formData.screens)} vaga(s) sobrando!</strong> Após criar este cliente, as vagas restantes ficarão disponíveis para novos clientes.
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* Expiration Date */}
                <div className="space-y-2">
                  <Label>Data de Vencimento</Label>
                  <div className="flex items-center gap-2">
                    <Popover
                      open={expirationPopoverOpen}
                      onOpenChange={setExpirationPopoverOpen}
                      modal={false}
                    >
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          type="button"
                          className="flex-1 justify-start text-left font-normal"
                        >
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {formData.expiration_date 
                            ? format(new Date(formData.expiration_date + 'T12:00:00'), "dd/MM/yyyy", { locale: ptBR })
                            : "Selecione um plano"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0 z-[100]" align="start" sideOffset={5}>
                        <CalendarPicker
                          mode="single"
                          selected={formData.expiration_date ? new Date(formData.expiration_date + 'T12:00:00') : undefined}
                          onSelect={(date) => {
                            if (date) {
                              const normalizedDate = new Date(date);
                              normalizedDate.setHours(12, 0, 0, 0);
                              setFormData({ ...formData, expiration_date: format(normalizedDate, "yyyy-MM-dd") });
                              setExpirationPopoverOpen(false);
                            }
                          }}
                          initialFocus
                          locale={ptBR}
                          className="p-3 pointer-events-auto"
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const currentDate = formData.expiration_date ? new Date(formData.expiration_date + 'T12:00:00') : new Date();
                        currentDate.setHours(12, 0, 0, 0);
                        if (!isNaN(currentDate.getTime())) {
                          const newDate = addDays(currentDate, -1);
                          setFormData({ ...formData, expiration_date: format(newDate, 'yyyy-MM-dd') });
                        }
                      }}
                    >
                      -1 dia
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const currentDate = formData.expiration_date ? new Date(formData.expiration_date + 'T12:00:00') : new Date();
                        currentDate.setHours(12, 0, 0, 0);
                        if (!isNaN(currentDate.getTime())) {
                          const newDate = addDays(currentDate, 1);
                          setFormData({ ...formData, expiration_date: format(newDate, 'yyyy-MM-dd') });
                        }
                      }}
                    >
                      +1 dia
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const currentDate = formData.expiration_date ? new Date(formData.expiration_date + 'T12:00:00') : new Date();
                        if (!isNaN(currentDate.getTime())) {
                          setFormData({ ...formData, expiration_date: format(addMonths(currentDate, -1), 'yyyy-MM-dd') });
                        }
                      }}
                    >
                      -1 mês
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const currentDate = formData.expiration_date ? new Date(formData.expiration_date + 'T12:00:00') : new Date();
                        if (!isNaN(currentDate.getTime())) {
                          setFormData({ ...formData, expiration_date: format(addMonths(currentDate, 1), 'yyyy-MM-dd') });
                        }
                      }}
                    >
                      +1 mês
                    </Button>
                  </div>
                </div>

                {/* Login and Password - Only for IPTV, P2P, SSH, or Revendedor */}
                {(formData.category === 'IPTV' || formData.category === 'P2P' || formData.category === 'SSH' || formData.category === 'Revendedor') && (
                  <>
                    <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="login" className="flex items-center gap-1">
                          Login (Servidor 1)
                          <Lock className="h-3 w-3 text-muted-foreground" />
                        </Label>
                        <Input
                          id="login"
                          value={formData.login}
                          onChange={(e) => setFormData({ ...formData, login: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="password" className="flex items-center gap-1">
                          Senha (Servidor 1)
                          <Lock className="h-3 w-3 text-muted-foreground" />
                        </Label>
                        <Input
                          id="password"
                          value={formData.password}
                          onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                        />
                      </div>
                    </div>
                    
                    {/* Additional Servers Section */}
                    <AdditionalServersSection
                      servers={activeServers as any}
                      additionalServers={additionalServers}
                      onChange={setAdditionalServers}
                      legacyServer2={{
                        server_id_2: formData.server_id_2,
                        server_name_2: formData.server_name_2,
                        login_2: formData.login_2,
                        password_2: formData.password_2,
                      }}
                      onLegacyServer2Change={(data) => setFormData({ ...formData, ...data })}
                    />
                    
                    {/* MAC GerenciaApp */}
                    <div className="space-y-3 md:col-span-2 p-4 rounded-lg border border-green-500/30 bg-green-500/10">
                      <div className="flex items-center justify-between">
                        <Label className="flex items-center gap-1 text-green-700 dark:text-green-400">
                          <Monitor className="h-4 w-4" />
                          Gerencia APP (opcional)
                        </Label>
                        {formData.gerencia_app_devices.length < 5 && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setFormData({
                                ...formData,
                                gerencia_app_devices: [
                                  ...formData.gerencia_app_devices,
                                  { name: '', mac: '' }
                                ]
                              });
                            }}
                            className="h-7 text-xs gap-1"
                          >
                            <Plus className="h-3 w-3" />
                            Adicionar
                          </Button>
                        )}
                      </div>
                      
                      <p className="text-xs text-muted-foreground">
                        Cadastre até 5 dispositivos do cliente (TV Sala, TV Quarto, Celular, TV Box...)
                      </p>
                      
                      {formData.gerencia_app_devices.length === 0 ? (
                        <div className="text-center py-4 text-sm text-muted-foreground border border-dashed rounded-lg">
                          Nenhum dispositivo cadastrado. Clique em "Adicionar" para começar.
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {formData.gerencia_app_devices.map((device, index) => (
                            <div key={index} className="flex gap-2 items-start p-3 rounded-lg bg-background border">
                              <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-2">
                                <div className="space-y-1">
                                  <Label className="text-xs text-muted-foreground">Nome/Apelido</Label>
                                  <Input
                                    value={device.name}
                                    onChange={(e) => {
                                      const newDevices = [...formData.gerencia_app_devices];
                                      newDevices[index] = { ...newDevices[index], name: e.target.value };
                                      setFormData({ ...formData, gerencia_app_devices: newDevices });
                                    }}
                                    placeholder="Ex: TV Sala, Celular..."
                                    className="h-9"
                                  />
                                </div>
                                <div className="space-y-1">
                                  <Label className="text-xs text-muted-foreground">Endereço MAC</Label>
                                  <Input
                                    value={device.mac}
                                    onChange={(e) => {
                                      const cleaned = e.target.value.replace(/[^a-fA-F0-9]/g, '').toUpperCase();
                                      const formatted = cleaned.match(/.{1,2}/g)?.join(':') || cleaned;
                                      const mac = formatted.slice(0, 17);
                                      const newDevices = [...formData.gerencia_app_devices];
                                      newDevices[index] = { ...newDevices[index], mac };
                                      setFormData({ ...formData, gerencia_app_devices: newDevices });
                                    }}
                                    placeholder="001A2B3C4D5E"
                                    className="h-9 font-mono"
                                    maxLength={17}
                                  />
                                </div>
                              </div>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={() => {
                                  const newDevices = formData.gerencia_app_devices.filter((_, i) => i !== index);
                                  setFormData({ ...formData, gerencia_app_devices: newDevices });
                                }}
                                className="h-9 w-9 text-destructive hover:text-destructive hover:bg-destructive/10 mt-5"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </>
                )}

                {/* Payment Status */}
                <div className="space-y-2">
                  <Label htmlFor="is_paid">Status de Pagamento</Label>
                  <Select
                    value={formData.is_paid ? 'paid' : 'unpaid'}
                    onValueChange={(v) => setFormData({ 
                      ...formData, 
                      is_paid: v === 'paid', 
                      pending_amount: v === 'paid' ? '' : formData.pending_amount,
                      expected_payment_date: v === 'paid' ? '' : formData.expected_payment_date
                    })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="paid">Pago</SelectItem>
                      <SelectItem value="unpaid">Não Pago</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                {/* Pending Amount - Show when unpaid */}
                {(!formData.is_paid || parseFloat(formData.pending_amount || '0') > 0) && (
                  <div className="md:col-span-2 p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/30 space-y-4">
                    <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400">
                      <DollarSign className="h-4 w-4" />
                      <Label className="text-sm font-medium">Cobrança Pendente</Label>
                    </div>
                    
                    <div className="grid md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="pending_amount">Valor Pendente (R$)</Label>
                        <Input
                          id="pending_amount"
                          type="number"
                          step="0.01"
                          min="0"
                          value={formData.pending_amount}
                          onChange={(e) => {
                            const newValue = e.target.value;
                            setFormData({ 
                              ...formData, 
                              pending_amount: newValue,
                              expected_payment_date: newValue && parseFloat(newValue) > 0 && !formData.expected_payment_date 
                                ? format(addDays(new Date(), 1), 'yyyy-MM-dd')
                                : formData.expected_payment_date
                            });
                          }}
                          placeholder="Ex: 20.00"
                          className="border-emerald-500/30 focus:border-emerald-500"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* Shared Credits Section */}
                {formData.server_id && (
                  <SharedCreditsSection
                    sellerId={userId}
                    category={formData.category}
                    serverId={formData.server_id}
                    planDurationDays={formData.plan_id ? plans.find(p => p.id === formData.plan_id)?.duration_days : undefined}
                    selectedCredit={selectedSharedCredit}
                    onSelect={handleSharedCreditSelect}
                  />
                )}

                {/* Apps Section */}
                <AppsSection
                  category={formData.category}
                  serverId={formData.server_id || undefined}
                  serverName={formData.server_name || undefined}
                  serverApps={serverApps as any}
                  resellerApps={resellerApps as any}
                  appType={formData.app_type}
                  appName={formData.app_name}
                  onAppChange={(appType, appName) => setFormData({ ...formData, app_type: appType as 'server' | 'own', app_name: appName })}
                  clientId={editingClient?.id}
                  sellerId={userId}
                  externalApps={externalApps}
                  onExternalAppsChange={setExternalApps}
                  hasPaidApps={formData.has_paid_apps}
                  paidAppsData={{
                    email: formData.paid_apps_email,
                    password: formData.paid_apps_password,
                    duration: formData.paid_apps_duration,
                    expiration: formData.paid_apps_expiration,
                  }}
                  onPaidAppsChange={(hasPaidApps, data) => setFormData({ 
                    ...formData, 
                    has_paid_apps: hasPaidApps,
                    paid_apps_email: data.email,
                    paid_apps_password: data.password,
                    paid_apps_duration: data.duration,
                    paid_apps_expiration: data.expiration,
                  })}
                />

                {/* Server Partner Apps Section */}
                {formData.server_id && (formData.category === 'IPTV' || formData.category === 'P2P') && (
                  <ServerPartnerAppsSection
                    sellerId={userId}
                    servers={[
                      { id: formData.server_id, name: formData.server_name || '' },
                      ...additionalServers.filter(s => s.server_id).map(s => ({ id: s.server_id, name: s.server_name }))
                    ] as { id: string; name: string }[]}
                    selectedDevices={formData.device}
                    serverAppsConfig={serverAppsConfig}
                    onChange={setServerAppsConfig}
                  />
                )}

                {/* Notes */}
                <div className="space-y-2">
                  <Label htmlFor="notes">Observações</Label>
                  <Textarea
                    id="notes"
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    placeholder="E-mail, senhas, MAC de apps, informações adicionais..."
                    className="min-h-[100px] resize-y"
                  />
                </div>
                
                {/* Encryption Notice */}
                <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 p-3 rounded-lg">
                  <Lock className="w-4 h-4 flex-shrink-0" />
                  <span>Login e senha são criptografados antes de serem salvos.</span>
                </div>
              </div>
            </form>
          </div>
          
          {/* Footer */}
          <div className="flex-shrink-0 border-t px-4 py-3 sm:px-6 sm:py-4 flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
            <Button type="button" variant="outline" size="sm" className="sm:size-default" onClick={() => handleOpenChange(false)}>
              Cancelar
            </Button>
            <Button 
              type="submit" 
              size="sm"
              className="sm:size-default"
              onClick={(e) => {
                e.preventDefault();
                const form = document.querySelector('.client-form-mobile') as HTMLFormElement;
                if (form) {
                  form.requestSubmit();
                }
              }}
            >
              {editingClient ? 'Salvar' : 'Criar Cliente'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      
      {/* Confirm Dialog for unsaved changes */}
      <ConfirmDialog {...dialogProps} />
    </>
  );
}

export default ClientFormDialog;
