import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useCrypto } from '@/hooks/useCrypto';
import { useFingerprint } from '@/hooks/useFingerprint';
import { usePrivacyMode } from '@/hooks/usePrivacyMode';
import { useSentMessages } from '@/hooks/useSentMessages';
import { useRenewalMutation } from '@/hooks/useRenewalMutation';
import { useClientValidation } from '@/hooks/useClientValidation';
import { usePerformanceOptimization } from '@/hooks/usePerformanceOptimization';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { useAtomicClientSave } from '@/hooks/useAtomicClientSave';
import { useClientFilters, ClientFilterType } from '@/hooks/useClientFilters';
import { useClientDialogState, ClientForDialog } from '@/hooks/useClientDialogState';
import { useClientFormData, ClientFormData } from '@/hooks/useClientFormData';
import { useClientLookup } from '@/hooks/useClientLookup';
import { useClientCredentials } from '@/hooks/useClientCredentials';
import { useClientQueries } from '@/hooks/useClientQueries';
import { useClientActions } from '@/hooks/useClientActions';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

// Feature flag for atomic save - enable after testing
const USE_ATOMIC_SAVE = true;
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { Plus, Search, Phone, Mail, Calendar as CalendarIcon, CreditCard, User, Trash2, Eye, EyeOff, MessageCircle, Lock, Loader2, Monitor, Smartphone, Tv, Gamepad2, Laptop, Flame, ChevronDown, ExternalLink, AppWindow, Send, Archive, RotateCcw, Sparkles, Server, Copy, UserPlus, CheckCircle, X, DollarSign, Globe, ArrowRightLeft, UserSearch, History, Shield, Package, Beaker } from 'lucide-react';
import { TestCountdown } from '@/components/TestCountdown';
import { BulkImportClients } from '@/components/BulkImportClients';
import { BulkServerMigration } from '@/components/BulkServerMigration';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarPicker } from '@/components/ui/calendar';
import { format, addDays, addMonths, isBefore, isAfter, startOfToday, differenceInDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn, normalizeWhatsAppNumber } from '@/lib/utils';
import { SendMessageDialog } from '@/components/SendMessageDialog';
import { PlanSelector } from '@/components/PlanSelector';
import type { SharedCreditSelection } from '@/components/SharedCreditPicker';
import { DnsFieldsSection, SharedCreditsSection, AppsSection, AdditionalServersSection, ServerPartnerAppsSection } from '@/components/client-form';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ClientExternalAppsDisplay } from '@/components/ClientExternalApps';
import { ClientPremiumAccounts, PremiumAccount } from '@/components/ClientPremiumAccounts';
import { LazyPremiumAccounts } from '@/components/LazyPremiumAccounts';
import { PaginationControls } from '@/components/PaginationControls';
import { BulkLoyaltyMessage } from '@/components/BulkLoyaltyMessage';
import { ExpirationDaySummary } from '@/components/ExpirationDaySummary';
import { useResellerApps } from '@/components/ResellerAppsManager';
import { WelcomeMessagePreview } from '@/components/WelcomeMessagePreview';
import { ConfirmDialog } from '@/components/ConfirmDialog';

// ============= Tipos e constantes importados do módulo centralizado =============
import {
  Client,
  ClientCategory,
  DecryptedCredentials,
  Plan,
  ServerData,
  AdditionalServer,
  MacDevice,
  DEFAULT_CATEGORIES,
  DEVICE_OPTIONS,
  CLIENTS_PER_PAGE,
  SEARCH_PAGE_SIZE,
  AUTOLOAD_ALL_UP_TO,
  MAX_CLIENTS_PER_CREDENTIAL,
} from '@/types/clients';

// Re-export para compatibilidade (usado em outros componentes)
export type { Client, AdditionalServer, MacDevice };

// FilterType agora é importado de useClientFilters como ClientFilterType
type FilterType = ClientFilterType;

export default function Clients() {
  const navigate = useNavigate();
  const { user, isAdmin } = useAuth();
  const { encrypt, decrypt } = useCrypto();
  const { generateFingerprint } = useFingerprint();
  const { isPrivacyMode, maskData } = usePrivacyMode();
  const { isSent, clearSentMark, sentCount, clearAllSentMarks } = useSentMessages();
  const { renewClient: executeRenewal, isRenewing, isPending: isRenewalPending } = useRenewalMutation(user?.id);
  const { validateForCreate, validateForUpdate } = useClientValidation();
  const { dialogProps, confirm } = useConfirmDialog();
  const queryClient = useQueryClient();
  
  // ============= Estados de arrays (declarados antes do useAtomicClientSave para uso no resetForm) =============
  const [selectedSharedCredit, setSelectedSharedCredit] = useState<SharedCreditSelection | null>(null);
  const [externalApps, setExternalApps] = useState<{ appId: string; devices: { name: string; mac: string; device_key?: string }[]; email: string; password: string; expirationDate: string }[]>([]);
  const [premiumAccounts, setPremiumAccounts] = useState<PremiumAccount[]>([]);
  const [additionalServers, setAdditionalServers] = useState<{ server_id: string; server_name: string; login: string; password: string; expiration_date?: string | null }[]>([]);
  const [serverAppsConfig, setServerAppsConfig] = useState<{ serverId: string; serverName: string; apps: { serverAppId: string; authCode?: string; username?: string; password?: string; provider?: string }[] }[]>([]);

  // ============= Hook de formulário (extraído para melhor manutenibilidade) =============
  const {
    formData,
    setFormData,
    resetForm: resetFormData,
    updateFormData,
    setFormDataFromClient,
    hasBasicFormChanges,
  } = useClientFormData();

  // Full reset that includes form data AND related arrays
  const resetForm = useCallback(() => {
    resetFormData();
    setSelectedSharedCredit(null);
    setExternalApps([]);
    setPremiumAccounts([]);
    setAdditionalServers([]);
    setServerAppsConfig([]);
  }, [resetFormData]);

  // Helper to check if form has unsaved changes (includes arrays managed locally)
  const hasFormChanges = useCallback(() => {
    return (
      hasBasicFormChanges() ||
      externalApps.length > 0 ||
      premiumAccounts.length > 0 ||
      additionalServers.length > 0
    );
  }, [hasBasicFormChanges, externalApps.length, premiumAccounts.length, additionalServers.length]);

  // Atomic save hook for transactional client operations
  const { 
    saveClient: atomicSaveClient, 
    isSaving: isAtomicSaving,
    invalidateClientCaches: atomicInvalidateCaches,
  } = useAtomicClientSave({
    onCreateSuccess: () => {
      resetForm();
      setIsDialogOpen(false);
    },
    onUpdateSuccess: () => {
      resetForm();
      setIsDialogOpen(false);
      setEditingClient(null);
    },
    onError: (error) => {
      console.error('[Clients] Atomic save error:', error);
    },
  });
  // ============= Hook de filtros (extraído para melhor manutenibilidade) =============
  const {
    search,
    setSearch,
    debouncedSearch,
    filter,
    setFilter,
    categoryFilter,
    setCategoryFilter,
    serverFilter,
    setServerFilter,
    dnsFilter,
    setDnsFilter,
    dateFilter,
    setDateFilter,
    isViewingArchived,
  } = useClientFilters();

  // ============= Hook de estado do diálogo (extraído para melhor manutenibilidade) =============
  const {
    isDialogOpen,
    setIsDialogOpen,
    editingClient,
    setEditingClient,
    showExitConfirm,
    setShowExitConfirm,
    pendingCloseDialog,
    setPendingCloseDialog,
    addCategoryOpen,
    setAddCategoryOpen,
    expirationPopoverOpen,
    setExpirationPopoverOpen,
    paidAppsExpirationPopoverOpen: _paidAppsExpirationPopoverOpen,
    setPaidAppsExpirationPopoverOpen,
    confirmExitWithoutSaving: dialogConfirmExit,
    cancelExit: dialogCancelExit,
  } = useClientDialogState({
    onDialogClose: () => {
      resetForm();
    },
  });

  const [showPassword, setShowPassword] = useState<string | null>(null);
  const [messageClient, setMessageClient] = useState<Client | null>(null);
  const [renewClientId, setRenewClientId] = useState<string | null>(null);
  const [renewPlanId, setRenewPlanId] = useState<string>('');
  const [renewCustomDate, setRenewCustomDate] = useState<Date | undefined>(undefined);
  const [renewUseCustomDate, setRenewUseCustomDate] = useState(false);
  const [renewExpirationPopoverOpen, setRenewExpirationPopoverOpen] = useState(false);
  
  // ============= Hook de Credenciais (extraído para melhor manutenibilidade) =============
  const {
    decryptedCredentials,
    decrypting,
    isDecryptingAll,
    allCredentialsDecrypted,
    searchDecryptedLogins,
    isDecryptingSearchLogins,
    encryptCredentials,
    decryptCredentialsForClient,
    decryptAllCredentials,
    checkNeedsDecryption,
    findExistingClientWithCredentials,
    decryptSearchLogins,
    clearClientCredentials,
    looksEncrypted: looksEncryptedForSearch,
  } = useClientCredentials({
    userId: user?.id,
    encrypt,
    decrypt,
    generateFingerprint,
  });
  const [newCategoryName, setNewCategoryName] = useState('');
  const [showDeleteAllConfirm, setShowDeleteAllConfirm] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  // Bulk message queue for expired not called clients
  const [bulkMessageQueue, setBulkMessageQueue] = useState<Client[]>([]);
  const [bulkMessageIndex, setBulkMessageIndex] = useState(0);
  const isBulkMessaging = bulkMessageQueue.length > 0;
  // State for welcome message preview
  const [showWelcomePreview, setShowWelcomePreview] = useState(false);
  const [pendingClientData, setPendingClientData] = useState<{ data: Record<string, unknown>; screens: string } | null>(null);
  const [customWelcomeMessage, setCustomWelcomeMessage] = useState<string | null>(null);
  // State for bulk server migration
  const [showMigrationDialog, setShowMigrationDialog] = useState(false);
  
  // ============= Hook da Consulta 360° (extraído para melhor manutenibilidade) =============
  const {
    showLookupDialog,
    setShowLookupDialog,
    lookupSearchQuery,
    setLookupSearchQuery,
    selectedLookupClientId,
    selectedLookupPhone,
    showLookupPasswords,
    setShowLookupPasswords,
    lookupDecryptedCredentials,
    lookupPhoneDecryptedCreds,
    lookupSearchResultsRaw,
    lookupGroupedResults,
    lookupPhoneClients,
    lookupClientData,
    isLoadingLookupPhoneClients,
    isLoadingLookupClient,
    isLookupSearching,
    getLookupStatusBadge,
    openLookupDialog,
    closeLookupDialog,
    selectPhone: selectLookupPhone,
    selectClient: selectLookupClient,
    goBackToSearch: goBackToLookupSearch,
  } = useClientLookup({
    userId: user?.id,
    isAdmin,
    decrypt,
  });
  

  // Confirm exit without saving - uses hook + resets form
  const confirmExitWithoutSaving = useCallback(() => {
    dialogConfirmExit();
    resetForm();
  }, [dialogConfirmExit]);

  // Cancel exit - delegates to hook
  const cancelExit = useCallback(() => {
    dialogCancelExit();
  }, [dialogCancelExit]);

  // ============= Hook de Queries (Etapa 2.11 - Integração Completa) =============
  // Centraliza todas as queries de clientes: contagem, paginação, busca por login, external apps
  const {
    clients,
    allLoadedClients,
    totalClientCount,
    archivedClientsCount,
    isLoading,
    isFetching,
    isSuccess,
    dbPage,
    hasMoreClients,
    loadMoreClients,
    allClientsForSearch,
    loginMatchingClientIds,
    clientsWithExternalApps,
    clientsWithPaidAppsSet,
    resetPagination,
    setAllLoadedClients,
  } = useClientQueries({
    userId: user?.id,
    debouncedSearch,
    isViewingArchived,
  });

  // Wrappers para compatibilidade com useClientActions
  const setDbPage = useCallback((_value: React.SetStateAction<number>) => {
    resetPagination();
  }, [resetPagination]);
  
  const setHasMoreClients = useCallback((_value: React.SetStateAction<boolean>) => {}, []);
  const setTotalClientCount = useCallback((_value: React.SetStateAction<number>) => {}, []);

  // ============= Hook de Ações (extraído para melhor manutenibilidade) =============
  const {
    deleteMutation,
    deleteAllMutation,
    archiveMutation,
    restoreMutation,
    archiveCalledExpiredMutation,
    isDeleting: _isDeleting,
    isArchiving: _isArchiving,
    isRestoring: _isRestoring,
  } = useClientActions({
    userId: user?.id,
    isViewingArchived,
    debouncedSearch,
    allLoadedClients,
    setAllLoadedClients,
    setTotalClientCount,
    setDbPage,
    setHasMoreClients,
    onDeleteAllSuccess: () => setShowDeleteAllConfirm(false),
    onArchiveExpiredSuccess: () => clearAllSentMarks(),
  });

  // ============= Queries movidas para useClientQueries (Etapa 2.11) =============
  // As seguintes queries estão agora centralizadas no hook:
  // - clients-count, clients (paginados), clients-all-for-search
  // - clients-login-matched, archived-clients-count, clients-with-external-apps
  // Efeitos de paginação, reset e loadMore também foram migrados.
  
  // Decrypt logins para busca (usa dados do hook)
  useEffect(() => {
    if (allClientsForSearch.length > 0) {
      decryptSearchLogins(allClientsForSearch);
    }
  }, [allClientsForSearch, decryptSearchLogins]);

  // Get fresh client data from the clients array to ensure we always have the latest values
  const renewClient = useMemo(() => {
    if (!renewClientId) return null;
    return clients.find(c => c.id === renewClientId) || null;
  }, [renewClientId, clients]);

  // PERF: Lazy load plans - only fetch when dialog opens
  const [plansEnabled, setPlansEnabled] = useState(false);
  const { data: plans = [] } = useQuery({
    queryKey: ['plans', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('plans')
        .select('id, name, price, duration_days, is_active, category')
        .eq('seller_id', user!.id)
        .eq('is_active', true)
        .order('price');
      if (error) throw error;
      return data as Plan[];
    },
    enabled: !!user?.id && plansEnabled,
    staleTime: 1000 * 60 * 5, // 5 minutes cache
  });

  // Servers for client list badges - always loaded for quick access
  const { data: serversForBadges = [] } = useQuery({
    queryKey: ['servers-badges', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('servers')
        .select('id, name, panel_url, icon_url')
        .eq('seller_id', user!.id);
      if (error) throw error;
      return data as Pick<ServerData, 'id' | 'name' | 'panel_url' | 'icon_url'>[];
    },
    enabled: !!user?.id,
    staleTime: 1000 * 60 * 10, // 10 minutes cache - stable data
  });

  // PERF: Lazy load full servers - only fetch when dialog opens
  const [serversEnabled, setServersEnabled] = useState(false);
  const { data: servers = [] } = useQuery({
    queryKey: ['servers-all', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('servers')
        .select('id, name, is_active, is_credit_based, panel_url, icon_url, iptv_per_credit, p2p_per_credit, total_screens_per_credit')
        .eq('seller_id', user!.id)
        .order('name');
      if (error) throw error;
      return data as ServerData[];
    },
    enabled: !!user?.id && serversEnabled,
    staleTime: 1000 * 60 * 5, // 5 minutes cache
  });

  // Active servers for the form select
  const activeServers = servers.filter(s => s.is_active);

  // Get selected server details for screen options
  const selectedServer = servers.find(s => s.id === formData.server_id);
  const maxScreens = selectedServer?.total_screens_per_credit || 1;
  
  // Check if WPLAY for special screen options
  const isWplayServer = selectedServer?.name?.toUpperCase() === 'WPLAY';

  // PERF: Lazy load categories - only fetch when dialog opens
  const [categoriesEnabled, setCategoriesEnabled] = useState(false);
  const { data: customCategories = [] } = useQuery({
    queryKey: ['client-categories', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('client_categories')
        .select('id, name, seller_id')
        .eq('seller_id', user!.id)
        .order('name');
      if (error) throw error;
      return data as ClientCategory[];
    },
    enabled: !!user?.id && categoriesEnabled,
    staleTime: 1000 * 60 * 5, // 5 minutes cache
  });

  // PERF: Lazy load custom products - only fetch when dialog opens
  const { data: customProducts = [] } = useQuery({
    queryKey: ['custom-products', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('custom_products')
        .select('name, icon')
        .eq('seller_id', user!.id)
        .eq('is_active', true)
        .order('name');
      if (error) throw error;
      return data as { name: string; icon: string }[];
    },
    enabled: !!user?.id && categoriesEnabled,
    staleTime: 1000 * 60 * 5, // 5 minutes cache
  });

  const allCategories = [...DEFAULT_CATEGORIES, ...customCategories.map(c => c.name)];

  // Fetch reseller apps (custom apps created by the reseller)
  const { data: resellerApps = [] } = useResellerApps(user?.id);

  // Fetch server apps for the selected server
  const { data: serverApps = [] } = useQuery({
    queryKey: ['server-apps-for-client', formData.server_id],
    queryFn: async () => {
      if (!formData.server_id) return [];
      const { data, error } = await supabase
        .from('server_apps' as any)
        .select('*')
        .eq('server_id', formData.server_id)
        .eq('is_active', true)
        .order('name');
      if (error) throw error;
      return (data || []) as unknown as { id: string; name: string; icon: string; app_type: 'own' | 'partnership'; website_url: string | null; is_active: boolean; }[];
    },
    enabled: !!formData.server_id,
  });

  // PERF: Lazy load templates - only fetch when bulk loyalty dialog is used
  const [templatesEnabled, setTemplatesEnabled] = useState(false);
  const { data: templates = [] } = useQuery({
    queryKey: ['templates-loyalty', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('whatsapp_templates')
        .select('id, name, type, message')
        .eq('seller_id', user!.id)
        .in('type', ['loyalty', 'referral'])
        .order('name');
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id && templatesEnabled,
    staleTime: 1000 * 60 * 5, // 5 minutes cache
  });

  // ============= Consulta 360° - Movido para useClientLookup hook =============
  // As queries e efeitos da consulta 360° foram extraídos para src/hooks/useClientLookup.tsx

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copiado!`);
  };

  const handleSharedCreditSelect = useCallback((selection: SharedCreditSelection | null) => {
    setSelectedSharedCredit(selection);
    
    if (selection) {
      // Only update credentials and server, keep user's chosen expiration date
      setFormData(prev => ({
        ...prev,
        server_id: selection.serverId,
        server_name: selection.serverName,
        login: selection.sharedLogin || prev.login,
        password: selection.sharedPassword || prev.password,
        // Only set expiration_date if user hasn't already set one
        expiration_date: prev.expiration_date || selection.expirationDate || format(new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0), 'yyyy-MM-dd'),
      }));
    }
  }, []);

  // ============= Funções de criptografia agora vêm do hook useClientCredentials =============
  // encryptCredentials, decryptCredentialsForClient, decryptAllCredentials, findExistingClientWithCredentials
  // foram movidos para src/hooks/useClientCredentials.tsx

  // Auto-decrypt all credentials when clients load (enables instant search by login)
  useEffect(() => {
    if (clients.length > 0 && !allCredentialsDecrypted && !isDecryptingAll) {
      decryptAllCredentials(clients);
    }
  }, [clients.length, allCredentialsDecrypted, isDecryptingAll, decryptAllCredentials, clients]);

  // Reset decrypted state when clients change (refetch)
  useEffect(() => {
    if (clients.length > 0) {
      checkNeedsDecryption(clients);
    }
  }, [clients, checkNeedsDecryption]);

  // MAX_CLIENTS_PER_CREDENTIAL agora é importado de @/types/clients

  // Enhanced validation with preventive system
  const validateAndCorrectClientData = useCallback((
    data: Record<string, unknown>,
    operation: 'create' | 'update',
    clientId?: string
  ): { isValid: boolean; correctedData: Record<string, unknown>; errorMessage?: string } => {
    const validationResult = operation === 'create' 
      ? validateForCreate(data)
      : validateForUpdate(data, clientId!);
    
    if (validationResult.blocked) {
      return { 
        isValid: false, 
        correctedData: data, 
        errorMessage: 'Aguarde, operação em andamento' 
      };
    }
    
    if (!validationResult.isValid && validationResult.errors.length > 0) {
      return { 
        isValid: false, 
        correctedData: data, 
        errorMessage: validationResult.errors[0] 
      };
    }
    
    return { 
      isValid: true, 
      correctedData: validationResult.data as Record<string, unknown> 
    };
  }, [validateForCreate, validateForUpdate]);

  const createMutation = useMutation({
    mutationFn: async (data: { name: string; expiration_date: string; phone?: string | null; email?: string | null; device?: string | null; dns?: string | null; plan_id?: string | null; plan_name?: string | null; plan_price?: number | null; server_id?: string | null; server_name?: string | null; login?: string | null; password?: string | null; is_paid?: boolean; notes?: string | null; screens?: string; category?: string | null; has_paid_apps?: boolean; paid_apps_duration?: string | null; paid_apps_expiration?: string | null; telegram?: string | null; premium_password?: string | null; has_adult_content?: boolean }) => {
      // Preventive validation with auto-correction
      const validation = validateAndCorrectClientData(data as Record<string, unknown>, 'create');
      if (!validation.isValid) {
        throw new Error(validation.errorMessage || 'Dados inválidos');
      }
      
      // Use corrected data
      const correctedData = validation.correctedData as typeof data;

      // Extract screens before spreading - it's not a column in the clients table
      const { screens, ...clientData } = correctedData;
      
      // If using shared credit, use the ORIGINAL encrypted credentials to ensure matching
      // Otherwise, check if credentials already exist and use those, or encrypt new ones
      let finalLogin: string | null;
      let finalPassword: string | null;
      let credentialsFingerprint: string | null = null;
      
      if (selectedSharedCredit?.encryptedLogin) {
        // Use original encrypted credentials from shared credit (avoids re-encryption mismatch)
        finalLogin = selectedSharedCredit.encryptedLogin;
        finalPassword = selectedSharedCredit.encryptedPassword || null;
        // Generate fingerprint for shared credit credentials
        if (correctedData.login) {
          credentialsFingerprint = await generateFingerprint(correctedData.login, correctedData.password || '');
        }
      } else if (correctedData.server_id && correctedData.login) {
        // Check if there's already a client with these credentials on this server
        const existingCredentials = await findExistingClientWithCredentials(
          correctedData.server_id,
          correctedData.login,
          correctedData.password || ''
        );
        
        if (existingCredentials) {
          // Validate that we haven't exceeded the maximum clients per credential
          if (existingCredentials.clientCount >= MAX_CLIENTS_PER_CREDENTIAL) {
            throw new Error(`Este login já possui ${existingCredentials.clientCount} clientes vinculados. Limite máximo: ${MAX_CLIENTS_PER_CREDENTIAL} clientes por vaga.`);
          }
          
          // Use existing encrypted credentials to ensure proper grouping
          finalLogin = existingCredentials.encryptedLogin;
          finalPassword = existingCredentials.encryptedPassword || null;
          credentialsFingerprint = existingCredentials.fingerprint;
          
          console.log(`Using existing credentials for slot grouping (${existingCredentials.clientCount + 1}/${MAX_CLIENTS_PER_CREDENTIAL} clients)`);
        } else {
          // New credentials - encrypt them and generate fingerprint
          const [encrypted, fingerprint] = await Promise.all([
            encryptCredentials(correctedData.login || null, correctedData.password || null),
            generateFingerprint(correctedData.login, correctedData.password || '')
          ]);
          finalLogin = encrypted.login;
          finalPassword = encrypted.password;
          credentialsFingerprint = fingerprint;
        }
      } else if (correctedData.login) {
        // Has login but no server - encrypt and generate fingerprint
        const [encrypted, fingerprint] = await Promise.all([
          encryptCredentials(correctedData.login || null, correctedData.password || null),
          generateFingerprint(correctedData.login, correctedData.password || '')
        ]);
        finalLogin = encrypted.login;
        finalPassword = encrypted.password;
        credentialsFingerprint = fingerprint;
      } else {
        // No login - no encryption needed
        finalLogin = null;
        finalPassword = null;
      }
      
      // Criar novo cliente (permite múltiplos clientes com mesmo telefone)
      let reusedExistingClient = false;
      const { data: insertedData, error } = await supabase
        .from('clients')
        .insert([
          {
            ...clientData,
            login: finalLogin,
            password: finalPassword,
            credentials_fingerprint: credentialsFingerprint,
            seller_id: user!.id,
            renewed_at: new Date().toISOString(), // Track creation as first renewal for monthly profit
          },
        ])
        .select('id')
        .single();
      if (error) throw error;
      
      // Shared credits are tracked by counting clients with the same login/password on the server
      // No need to insert into panel_clients - the SharedCreditPicker counts directly from clients table
      
      // If it's a credit-based server and NOT using shared credit, register the screens used
      // Se reutilizou cliente existente, não registrar slots/apps para evitar duplicações derivadas
      if (!reusedExistingClient && !selectedSharedCredit && correctedData.server_id && insertedData?.id) {
        const server = servers.find(s => s.id === correctedData.server_id);
        if (server?.is_credit_based) {
          const screensUsed = parseInt(screens || '1');
          const category = formData.category;
          
          // Determine slot types based on category and screens
          const panelEntries: { panel_id: string; client_id: string; seller_id: string; slot_type: string }[] = [];
          
          if (category === 'P2P') {
            // P2P client - all screens are P2P
            for (let i = 0; i < screensUsed; i++) {
              panelEntries.push({
                panel_id: data.server_id,
                client_id: insertedData.id,
                seller_id: user!.id,
                slot_type: 'p2p',
              });
            }
          } else {
            // IPTV or mixed - handle WPLAY special case
            const isWplay = server.name?.toUpperCase() === 'WPLAY';
            
            if (isWplay && screensUsed === 3) {
              // WPLAY 3 screens = 2 IPTV + 1 P2P
              panelEntries.push(
                { panel_id: data.server_id, client_id: insertedData.id, seller_id: user!.id, slot_type: 'iptv' },
                { panel_id: data.server_id, client_id: insertedData.id, seller_id: user!.id, slot_type: 'iptv' },
                { panel_id: data.server_id, client_id: insertedData.id, seller_id: user!.id, slot_type: 'p2p' }
              );
            } else {
              // All IPTV
              for (let i = 0; i < screensUsed; i++) {
                panelEntries.push({
                  panel_id: data.server_id,
                  client_id: insertedData.id,
                  seller_id: user!.id,
                  slot_type: 'iptv',
                });
              }
            }
          }
          
          // CRITICAL: Await panel entries to prevent race conditions with credit sync
          if (panelEntries.length > 0) {
            const { error: panelError } = await supabase.from('panel_clients').insert(panelEntries);
            if (panelError) {
              console.error('[Clients] Error registering credit slots:', panelError);
              toast.error('Erro ao vincular créditos: ' + panelError.message);
            }
          }
        }
      }
      
      // Save external apps in background - don't block the response
      if (!reusedExistingClient && externalApps.length > 0 && insertedData?.id) {
        (async () => {
          for (const app of externalApps) {
            if (!app.appId) continue;
            
            // Encrypt password if present
            let encryptedPassword = app.password || null;
            if (encryptedPassword) {
              try {
                encryptedPassword = await encrypt(encryptedPassword);
              } catch (e) {
                console.error('Error encrypting app password:', e);
              }
            }
            
            // Check if it's a fixed app (starts with "fixed-"), a reseller app, or a custom app (UUID)
            const isFixedApp = app.appId.startsWith('fixed-');
            const isResellerApp = resellerApps.some(ra => ra.id === app.appId);
            
            let fixedAppName: string | null = null;
            let externalAppId: string | null = null;
            
            if (isFixedApp) {
              fixedAppName = app.appId.replace('fixed-', '').toUpperCase().replace(/-/g, ' ');
            } else if (isResellerApp) {
              // For reseller apps, store the name with a prefix to identify it
              const resellerApp = resellerApps.find(ra => ra.id === app.appId);
              fixedAppName = resellerApp ? `RESELLER:${resellerApp.name}` : null;
            } else {
              // It's a custom external app - use the UUID
              externalAppId = app.appId;
            }
            
            // Build insert data with proper typing - use type assertion for new column
            const insertData = {
              client_id: insertedData.id,
              seller_id: user!.id,
              devices: app.devices.filter(d => d.mac.trim() !== '') as unknown as any,
              email: app.email || null,
              password: encryptedPassword,
              expiration_date: app.expirationDate || null,
              external_app_id: externalAppId,
              fixed_app_name: fixedAppName,
            } as any;
            
            const { error } = await supabase.from('client_external_apps').insert(insertData);
            if (error) {
              console.error('[Clients] Error saving external app:', error);
              toast.error('Erro ao salvar app: ' + error.message);
            }
          }
        })();
      }
      
      // Save premium accounts in background - don't block the response
      if (premiumAccounts.length > 0 && insertedData?.id) {
        (async () => {
          for (const account of premiumAccounts) {
            if (!account.planName && !account.email) continue;
            
            const { error } = await supabase.from('client_premium_accounts').insert([{
              client_id: insertedData.id,
              seller_id: user!.id,
              plan_name: account.planName || null,
              email: account.email || null,
              password: account.password || null,
              price: account.price ? parseFloat(account.price) : 0,
              expiration_date: account.expirationDate || null,
              notes: account.notes || null,
            }]);
            if (error) {
              console.error('[Clients] Error saving premium account:', error);
              toast.error('Erro ao salvar conta premium: ' + error.message);
            }
          }
        })();
      }
      
      // Save server partner app credentials in background
      if (!reusedExistingClient && serverAppsConfig.length > 0 && insertedData?.id) {
        (async () => {
          for (const config of serverAppsConfig) {
            for (const app of config.apps) {
              if (!app.serverAppId) continue;
              
              // Encrypt sensitive data
              let encryptedPassword = app.password || null;
              if (encryptedPassword) {
                try {
                  encryptedPassword = await encrypt(encryptedPassword);
                } catch (e) {
                  console.error('Error encrypting app password:', e);
                }
              }
              
              const { error } = await supabase.from('client_server_app_credentials' as any).insert([{
                client_id: insertedData.id,
                seller_id: user!.id,
                server_id: config.serverId,
                server_app_id: app.serverAppId,
                auth_code: app.authCode || null,
                username: app.username || null,
                password: encryptedPassword,
                provider: app.provider || null,
              }]);
              
              if (error) {
                console.error('Error saving server app credential:', error);
              }
            }
          }
        })();
      }
      
      // Send welcome message via WhatsApp API in background (only if user confirmed)
      if (insertedData?.id && formData.phone && customWelcomeMessage !== null) {
        supabase.functions.invoke('send-welcome-message', {
          body: {
            clientId: insertedData.id,
            sellerId: user!.id,
            customMessage: customWelcomeMessage || undefined,
          },
        }).then(({ data: welcomeData, error: welcomeError }) => {
          if (welcomeError) {
            console.log('Welcome message not sent:', welcomeError.message);
          } else if (welcomeData?.success) {
            console.log('Welcome message sent successfully');
          }
        });
      }
      
      return insertedData;
    },
    onMutate: async () => {
      // Show saving indicator
      toast.loading('Salvando cliente...', { id: 'saving-client' });
    },
    onSuccess: () => {
      toast.dismiss('saving-client');
      // Reset pagination to load fresh data with new client
      setDbPage(0);
      setAllLoadedClients([]);
      setHasMoreClients(true);
      
      // PERF: Critical invalidations immediately
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      queryClient.invalidateQueries({ queryKey: ['clients-count'] });
      
      // Go to page 1 to see the new client
      goToPage(1, false);
      toast.success(selectedSharedCredit 
        ? 'Cliente criado e vinculado ao crédito compartilhado! ✅' 
        : 'Cliente salvo com sucesso! ✅');
      resetForm();
      setIsDialogOpen(false);
      
      // PERF: Defer less critical invalidations (run after UI update)
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['server-credit-clients'] });
        queryClient.invalidateQueries({ queryKey: ['server-client-counts'] });
        queryClient.invalidateQueries({ queryKey: ['all-panel-clients'] });
        queryClient.invalidateQueries({ queryKey: ['clients-all-for-search'] });
      }, 100);
    },
    onError: (error: Error) => {
      toast.dismiss('saving-client');
      toast.error(`Falha ao salvar: ${error.message}`);
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<Client> }) => {
      // Preventive validation with auto-correction
      const validation = validateAndCorrectClientData(data as Record<string, unknown>, 'update', id);
      if (!validation.isValid) {
        throw new Error(validation.errorMessage || 'Dados inválidos');
      }
      
      // Use corrected data
      const correctedData = validation.correctedData as Partial<Client>;

      // Encrypt login and password if they were changed
      let updateData: Record<string, unknown> = { ...correctedData };

      // Never send form-only fields to the clients table
      const { screens: _screens, ...cleanUpdateData } = updateData as Record<string, any>;
      updateData = cleanUpdateData;

      if (correctedData.login !== undefined || correctedData.password !== undefined) {
        const serverId = (correctedData as any).server_id;
        const plainLogin = (correctedData as any).login || '';
        const plainPassword = (correctedData as any).password || '';
        
        // If we have shared credit selected, use those encrypted credentials
        if (selectedSharedCredit?.encryptedLogin) {
          (updateData as any).login = selectedSharedCredit.encryptedLogin;
          (updateData as any).password = selectedSharedCredit.encryptedPassword || null;
          // Generate fingerprint for shared credit
          if (plainLogin) {
            (updateData as any).credentials_fingerprint = await generateFingerprint(plainLogin, plainPassword);
          }
        } else if (serverId && plainLogin) {
          // Check if credentials already exist on this server (excluding current client)
          const existingCredentials = await findExistingClientWithCredentials(
            serverId,
            plainLogin,
            plainPassword
          );
          
          if (existingCredentials) {
            // Exclude current client from count check
            const currentClientInCount = existingCredentials.clientCount;
            // The client being edited might already be using these credentials
            // so we need to check if adding would exceed the limit
            const { data: currentClient } = await supabase
              .from('clients')
              .select('login, credentials_fingerprint')
              .eq('id', id)
              .single();
            
            const isAlreadyUsingThese = currentClient?.credentials_fingerprint === existingCredentials.fingerprint;
            const effectiveCount = isAlreadyUsingThese ? currentClientInCount : currentClientInCount + 1;
            
            if (effectiveCount > MAX_CLIENTS_PER_CREDENTIAL) {
              throw new Error(`Este login já possui ${existingCredentials.clientCount} clientes vinculados. Limite máximo: ${MAX_CLIENTS_PER_CREDENTIAL} clientes por vaga.`);
            }
            
            // Use existing encrypted credentials
            (updateData as any).login = existingCredentials.encryptedLogin;
            (updateData as any).password = existingCredentials.encryptedPassword || null;
            (updateData as any).credentials_fingerprint = existingCredentials.fingerprint;
          } else {
            // New credentials - encrypt them and generate fingerprint in parallel
            const [encrypted, fingerprint] = await Promise.all([
              encryptCredentials(plainLogin || null, plainPassword || null),
              generateFingerprint(plainLogin, plainPassword)
            ]);
            (updateData as any).login = encrypted.login;
            (updateData as any).password = encrypted.password;
            (updateData as any).credentials_fingerprint = fingerprint;
          }
        } else if (plainLogin) {
          // Has login but no server - encrypt and generate fingerprint
          const [encrypted, fingerprint] = await Promise.all([
            encryptCredentials(plainLogin || null, plainPassword || null),
            generateFingerprint(plainLogin, plainPassword)
          ]);
          (updateData as any).login = encrypted.login;
          (updateData as any).password = encrypted.password;
          (updateData as any).credentials_fingerprint = fingerprint;
        } else {
          // No login - clear credentials
          (updateData as any).login = null;
          (updateData as any).password = null;
          (updateData as any).credentials_fingerprint = null;
        }
      }

      const { error } = await supabase.from('clients').update(updateData).eq('id', id);
      if (error) throw error;

      // Save/update external apps and premium accounts in BACKGROUND - don't block response
      // Added .catch() to prevent silent failures
      if (user) {
        (async () => {
          try {
            // Delete existing apps for this client
            await supabase.from('client_external_apps').delete().eq('client_id', id);
            
            // Insert updated apps
            if (externalApps.length > 0) {
              for (const app of externalApps) {
                if (!app.appId) continue;
                
                // Encrypt password if present
                let encryptedPassword = app.password || null;
                if (encryptedPassword) {
                  try {
                    encryptedPassword = await encrypt(encryptedPassword);
                  } catch (e) {
                    console.error('Error encrypting app password:', e);
                  }
                }
                
                // Check if it's a fixed app (starts with "fixed-"), a reseller app, or a custom app (UUID)
                const isFixedApp = app.appId.startsWith('fixed-');
                const isResellerApp = resellerApps.some(ra => ra.id === app.appId);
                
                let fixedAppName: string | null = null;
                let externalAppId: string | null = null;
                
                if (isFixedApp) {
                  fixedAppName = app.appId.replace('fixed-', '').toUpperCase().replace(/-/g, ' ');
                } else if (isResellerApp) {
                  // For reseller apps, store the name with a prefix to identify it
                  const resellerApp = resellerApps.find(ra => ra.id === app.appId);
                  fixedAppName = resellerApp ? `RESELLER:${resellerApp.name}` : null;
                } else {
                  // It's a custom external app - use the UUID
                  externalAppId = app.appId;
                }
                
                // Build insert data with proper typing
                const insertData = {
                  client_id: id,
                  seller_id: user.id,
                  devices: app.devices.filter(d => d.mac.trim() !== '') as unknown as any,
                  email: app.email || null,
                  password: encryptedPassword,
                  expiration_date: app.expirationDate || null,
                  external_app_id: externalAppId,
                  fixed_app_name: fixedAppName,
                } as any;
                
                const { error } = await supabase.from('client_external_apps').insert(insertData);
                if (error) {
                  console.error('Error saving external app:', error);
                }
              }
            }
            
            // Save/update premium accounts for this client
            await supabase.from('client_premium_accounts').delete().eq('client_id', id);
            
            if (premiumAccounts.length > 0) {
              for (const account of premiumAccounts) {
                if (!account.planName && !account.email) continue;
                
                await supabase.from('client_premium_accounts').insert([{
                  client_id: id,
                  seller_id: user.id,
                  plan_name: account.planName || null,
                  email: account.email || null,
                  password: account.password || null,
                  price: account.price ? parseFloat(account.price) : 0,
                  expiration_date: account.expirationDate || null,
                  notes: account.notes || null,
                }]);
              }
            }
            
            // Save/update server partner app credentials
            await supabase.from('client_server_app_credentials' as any).delete().eq('client_id', id);
            
            if (serverAppsConfig.length > 0) {
              for (const config of serverAppsConfig) {
                for (const app of config.apps) {
                  if (!app.serverAppId) continue;
                  
                  // Encrypt sensitive data
                  let encryptedPassword = app.password || null;
                  if (encryptedPassword) {
                    try {
                      encryptedPassword = await encrypt(encryptedPassword);
                    } catch (e) {
                      console.error('Error encrypting app password:', e);
                    }
                  }
                  
                  await supabase.from('client_server_app_credentials' as any).insert([{
                    client_id: id,
                    seller_id: user.id,
                    server_id: config.serverId,
                    server_app_id: app.serverAppId,
                    auth_code: app.authCode || null,
                    username: app.username || null,
                    password: encryptedPassword,
                    provider: app.provider || null,
                  }]);
                }
              }
            }
            
            // Invalidate related queries after background work completes
            queryClient.invalidateQueries({ queryKey: ['client-external-apps'] });
            queryClient.invalidateQueries({ queryKey: ['client-premium-accounts'] });
            queryClient.invalidateQueries({ queryKey: ['client-server-app-credentials'] });
          } catch (bgError) {
            console.error('[Clients] Background save error:', bgError);
            toast.warning('Alguns dados adicionais podem não ter sido salvos');
          }
        })();
      }

      // Clear cached decrypted credentials for this client
      clearClientCredentials(id);
      
      return { id, data: updateData };
    },
    onMutate: async ({ id, data }) => {
      // Show saving indicator
      toast.loading('Salvando alterações...', { id: 'updating-client' });
      
      // Optimistically update the local state
      const previousClients = allLoadedClients;
      setAllLoadedClients(prev => prev.map(client => 
        client.id === id 
          ? { ...client, ...data, updated_at: new Date().toISOString() } as Client
          : client
      ));
      
      return { previousClients };
    },
    onSuccess: () => {
      toast.dismiss('updating-client');
      
      // PERF: Critical invalidation only
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      
      toast.success('Cliente salvo com sucesso! ✅');
      resetForm();
      setIsDialogOpen(false);
      setEditingClient(null);
      
      // PERF: Defer less critical invalidations
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['server-client-counts'] });
        queryClient.invalidateQueries({ queryKey: ['client-external-apps'] });
        queryClient.invalidateQueries({ queryKey: ['client-premium-accounts'] });
        queryClient.invalidateQueries({ queryKey: ['client-server-app-credentials'] });
      }, 100);
    },
    onError: (error: Error, _variables, context) => {
      toast.dismiss('updating-client');
      // Rollback to previous state
      if (context?.previousClients) {
        setAllLoadedClients(context.previousClients);
      }
      toast.error(`Falha ao salvar, tente novamente: ${error.message}`);
    },
  });

  // ============= Mutations de delete/archive/restore agora vêm de useClientActions =============
  // resetForm is now provided by useClientFormData hook

  const handlePlanChange = (planId: string) => {
    const plan = plans.find(p => p.id === planId);
    if (plan) {
      const newExpDate = format(addDays(new Date(), plan.duration_days), 'yyyy-MM-dd');
      setFormData({
        ...formData,
        plan_id: plan.id,
        plan_name: plan.name,
        plan_price: plan.price.toString(),
        expiration_date: newExpDate,
      });
    }
  };

  const handleServerChange = (serverId: string) => {
    if (serverId === 'manual') {
      setFormData({ ...formData, server_id: '', server_name: '' });
      return;
    }
    const server = servers.find(s => s.id === serverId);
    if (server) {
      setFormData({
        ...formData,
        server_id: server.id,
        server_name: server.name,
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const screens = formData.screens || '1';

    // ============ ATOMIC SAVE PATH (NEW) ============
    if (USE_ATOMIC_SAVE) {
      // For Contas Premium, calculate total price from premium accounts
      const isPremiumCategory = formData.category === 'Contas Premium';
      const premiumTotalPrice = isPremiumCategory 
        ? premiumAccounts.reduce((sum, acc) => sum + (parseFloat(acc.price) || 0), 0)
        : null;
      
      // Get the earliest expiration date from premium accounts if category is Premium
      const premiumExpirationDate = isPremiumCategory && premiumAccounts.length > 0
        ? premiumAccounts
            .filter(acc => acc.expirationDate)
            .sort((a, b) => new Date(a.expirationDate).getTime() - new Date(b.expirationDate).getTime())[0]?.expirationDate
        : null;

      // Encrypt second server credentials in parallel
      const hasSecondServer = formData.login_2 || formData.password_2;
      let encryptedLogin2: string | null = null;
      let encryptedPassword2: string | null = null;
      
      if (hasSecondServer) {
        const [login2, password2] = await Promise.all([
          formData.login_2 ? encrypt(formData.login_2).catch(() => formData.login_2) : Promise.resolve(null),
          formData.password_2 ? encrypt(formData.password_2).catch(() => formData.password_2) : Promise.resolve(null),
        ]);
        encryptedLogin2 = login2;
        encryptedPassword2 = password2;
      }

      // Encrypt additional servers in parallel
      const validAdditionalServers = await Promise.all(
        additionalServers
          .filter(s => s.server_id)
          .map(async (server) => {
            const [login, password] = await Promise.all([
              server.login ? encrypt(server.login).catch(() => server.login) : Promise.resolve(null),
              server.password ? encrypt(server.password).catch(() => server.password) : Promise.resolve(null),
            ]);
            return { 
              server_id: server.server_id, 
              server_name: server.server_name, 
              login, 
              password,
              expiration_date: server.expiration_date || null 
            };
          })
      );

      // Build client data
      const clientData: Record<string, unknown> = {
        name: formData.name,
        phone: formData.phone || null,
        telegram: formData.telegram || null,
        email: formData.email || null,
        device: formData.device || null,
        dns: formData.dns || null,
        expiration_date: isPremiumCategory && premiumExpirationDate ? premiumExpirationDate : formData.expiration_date,
        plan_id: formData.plan_id || null,
        plan_name: formData.plan_name || null,
        plan_price: isPremiumCategory ? premiumTotalPrice : (formData.plan_price ? parseFloat(formData.plan_price) : null),
        premium_price: formData.premium_price ? parseFloat(formData.premium_price) : null,
        server_id: formData.server_id || null,
        server_name: formData.server_name || null,
        login: formData.login || null, // Will be encrypted by atomic hook
        password: formData.password || null, // Will be encrypted by atomic hook
        server_id_2: formData.server_id_2 || null,
        server_name_2: formData.server_name_2 || null,
        login_2: encryptedLogin2,
        password_2: encryptedPassword2,
        premium_password: formData.premium_password || null,
        category: formData.category || 'IPTV',
        is_paid: formData.is_paid,
        pending_amount: formData.pending_amount ? parseFloat(formData.pending_amount) : 0,
        expected_payment_date: !formData.is_paid && formData.expected_payment_date ? formData.expected_payment_date : null,
        notes: formData.notes || null,
        has_paid_apps: formData.has_paid_apps || false,
        paid_apps_duration: formData.paid_apps_duration || null,
        paid_apps_expiration: formData.paid_apps_expiration || null,
        paid_apps_email: formData.paid_apps_email || null,
        paid_apps_password: formData.paid_apps_password || null,
        gerencia_app_mac: formData.gerencia_app_devices.length > 0 ? formData.gerencia_app_devices[0].mac : (formData.gerencia_app_mac || null),
        gerencia_app_devices: formData.gerencia_app_devices.filter(d => d.mac.trim() !== ''),
        app_name: formData.app_name || null,
        app_type: formData.app_type || 'server',
        device_model: formData.device_model || null,
        additional_servers: validAdditionalServers,
        has_adult_content: formData.has_adult_content || false,
      };

      // Determine if server is credit-based
      const server = servers.find(s => s.id === formData.server_id);
      const isServerCreditBased = server?.is_credit_based || false;

      if (editingClient) {
        // Edit mode - save directly via atomic function
        try {
          await atomicSaveClient({
            clientData,
            clientId: editingClient.id,
            sellerId: user!.id,
            externalApps: externalApps.map(app => ({
              appId: app.appId,
              email: app.email,
              password: app.password,
              expirationDate: app.expirationDate,
              devices: app.devices,
            })),
            premiumAccounts: premiumAccounts.map(acc => ({
              planName: acc.planName,
              email: acc.email,
              password: acc.password,
              price: acc.price,
              expirationDate: acc.expirationDate,
              notes: acc.notes,
            })),
            serverAppsConfig: serverAppsConfig.map(config => ({
              serverId: config.serverId,
              serverName: config.serverName,
              apps: config.apps,
            })),
            selectedSharedCredit,
          });
          // Success callbacks are handled by the hook
        } catch (error) {
          console.error('[Clients] Atomic update failed:', error);
        }
      } else {
        // Create mode - show welcome message preview if phone is provided
        if (formData.phone) {
          setPendingClientData({ 
            data: {
              ...clientData,
              _atomicParams: {
                externalApps: externalApps.map(app => ({
                  appId: app.appId,
                  email: app.email,
                  password: app.password,
                  expirationDate: app.expirationDate,
                  devices: app.devices,
                })),
                premiumAccounts: premiumAccounts.map(acc => ({
                  planName: acc.planName,
                  email: acc.email,
                  password: acc.password,
                  price: acc.price,
                  expirationDate: acc.expirationDate,
                  notes: acc.notes,
                })),
                serverAppsConfig: serverAppsConfig.map(config => ({
                  serverId: config.serverId,
                  serverName: config.serverName,
                  apps: config.apps,
                })),
                serverId: formData.server_id,
                serverName: formData.server_name,
                category: formData.category,
                isServerCreditBased,
                selectedSharedCredit,
              },
            }, 
            screens 
          });
          setShowWelcomePreview(true);
        } else {
          // No phone - save directly without welcome message
          try {
            await atomicSaveClient({
              clientData,
              sellerId: user!.id,
              externalApps: externalApps.map(app => ({
                appId: app.appId,
                email: app.email,
                password: app.password,
                expirationDate: app.expirationDate,
                devices: app.devices,
              })),
              premiumAccounts: premiumAccounts.map(acc => ({
                planName: acc.planName,
                email: acc.email,
                password: acc.password,
                price: acc.price,
                expirationDate: acc.expirationDate,
                notes: acc.notes,
              })),
              serverAppsConfig: serverAppsConfig.map(config => ({
                serverId: config.serverId,
                serverName: config.serverName,
                apps: config.apps,
              })),
              serverId: formData.server_id,
              serverName: formData.server_name,
              category: formData.category,
              screens: parseInt(screens),
              isServerCreditBased,
              selectedSharedCredit,
              sendWelcomeMessage: false,
            });
            // Success callbacks are handled by the hook
          } catch (error) {
            console.error('[Clients] Atomic create failed:', error);
          }
        }
      }
      return;
    }

    // ============ LEGACY SAVE PATH ============
    // PERF: Encrypt ALL credentials in parallel
    const encryptionPromises: Promise<any>[] = [];
    
    // Second server credentials
    const hasSecondServer = formData.login_2 || formData.password_2;
    if (hasSecondServer) {
      encryptionPromises.push(
        Promise.all([
          formData.login_2 ? encrypt(formData.login_2).catch(() => formData.login_2) : Promise.resolve(null),
          formData.password_2 ? encrypt(formData.password_2).catch(() => formData.password_2) : Promise.resolve(null),
        ]).then(([login, password]) => ({ type: 'second', login, password }))
      );
    }
    
    // Additional servers credentials - all in parallel
    for (let i = 0; i < additionalServers.length; i++) {
      const server = additionalServers[i];
      if (!server.server_id) continue;
      encryptionPromises.push(
        Promise.all([
          server.login ? encrypt(server.login).catch(() => server.login) : Promise.resolve(null),
          server.password ? encrypt(server.password).catch(() => server.password) : Promise.resolve(null),
        ]).then(([login, password]) => ({
          type: 'additional',
          index: i,
          server_id: server.server_id,
          server_name: server.server_name,
          login,
          password,
        }))
      );
    }
    
    // Execute all encryptions in parallel
    const encryptionResults = await Promise.all(encryptionPromises);
    
    // Process results
    let encryptedLogin2: string | null = null;
    let encryptedPassword2: string | null = null;
    const validAdditionalServers: { server_id: string; server_name: string; login: string | null; password: string | null }[] = [];
    
    for (const result of encryptionResults) {
      if (result.type === 'second') {
        encryptedLogin2 = result.login;
        encryptedPassword2 = result.password;
      } else if (result.type === 'additional') {
        validAdditionalServers.push({
          server_id: result.server_id,
          server_name: result.server_name,
          login: result.login,
          password: result.password,
        });
      }
    }

    // For Contas Premium, calculate total price from premium accounts
    const isPremiumCategory = formData.category === 'Contas Premium';
    const premiumTotalPrice = isPremiumCategory 
      ? premiumAccounts.reduce((sum, acc) => sum + (parseFloat(acc.price) || 0), 0)
      : null;
    
    // Get the earliest expiration date from premium accounts if category is Premium
    const premiumExpirationDate = isPremiumCategory && premiumAccounts.length > 0
      ? premiumAccounts
          .filter(acc => acc.expirationDate)
          .sort((a, b) => new Date(a.expirationDate).getTime() - new Date(b.expirationDate).getTime())[0]?.expirationDate
      : null;

    const data: Record<string, unknown> = {
      name: formData.name,
      phone: formData.phone || null,
      telegram: formData.telegram || null,
      email: formData.email || null,
      device: formData.device || null,
      dns: formData.dns || null,
      expiration_date: isPremiumCategory && premiumExpirationDate ? premiumExpirationDate : formData.expiration_date,
      plan_id: formData.plan_id || null,
      plan_name: formData.plan_name || null,
      plan_price: isPremiumCategory ? premiumTotalPrice : (formData.plan_price ? parseFloat(formData.plan_price) : null),
      premium_price: formData.premium_price ? parseFloat(formData.premium_price) : null,
      server_id: formData.server_id || null,
      server_name: formData.server_name || null,
      login: formData.login || null,
      password: formData.password || null,
      // Second server fields
      server_id_2: formData.server_id_2 || null,
      server_name_2: formData.server_name_2 || null,
      login_2: encryptedLogin2,
      password_2: encryptedPassword2,
      premium_password: formData.premium_password || null,
      category: formData.category || 'IPTV',
      is_paid: formData.is_paid,
      pending_amount: formData.pending_amount ? parseFloat(formData.pending_amount) : 0,
      expected_payment_date: !formData.is_paid && formData.expected_payment_date ? formData.expected_payment_date : null,
      notes: formData.notes || null,
      has_paid_apps: formData.has_paid_apps || false,
      paid_apps_duration: formData.paid_apps_duration || null,
      paid_apps_expiration: formData.paid_apps_expiration || null,
      paid_apps_email: formData.paid_apps_email || null,
      paid_apps_password: formData.paid_apps_password || null,
      gerencia_app_mac: formData.gerencia_app_devices.length > 0 ? formData.gerencia_app_devices[0].mac : (formData.gerencia_app_mac || null),
      gerencia_app_devices: formData.gerencia_app_devices.filter(d => d.mac.trim() !== ''),
      app_name: formData.app_name || null,
      app_type: formData.app_type || 'server',
      device_model: formData.device_model || null,
      additional_servers: validAdditionalServers,
      has_adult_content: formData.has_adult_content || false,
    };

    if (editingClient) {
      // Edit mode - save directly without welcome message preview
      setCustomWelcomeMessage(null);
      updateMutation.mutate({ id: editingClient.id, data: data as Partial<Client> });
    } else {
      // Create mode - show welcome message preview if phone is provided
      if (formData.phone) {
        setPendingClientData({ data, screens });
        setShowWelcomePreview(true);
      } else {
        // No phone - save directly without welcome message
        setCustomWelcomeMessage(null);
        createMutation.mutate({
          ...(data as Parameters<typeof createMutation.mutate>[0]),
          screens,
        });
      }
    }
  };

  // Handle confirmation from welcome message preview
  const handleWelcomeConfirm = async (message: string | null, sendWelcome: boolean) => {
    if (!pendingClientData) return;
    
    // Set the custom message (null means don't send, string means send with this content)
    setCustomWelcomeMessage(sendWelcome ? (message || '') : null);
    setShowWelcomePreview(false);
    
    // ============ ATOMIC SAVE PATH (NEW) ============
    if (USE_ATOMIC_SAVE && pendingClientData.data._atomicParams) {
      const atomicParams = pendingClientData.data._atomicParams as any;
      const { _atomicParams, ...clientData } = pendingClientData.data;
      
      try {
        await atomicSaveClient({
          clientData,
          sellerId: user!.id,
          externalApps: atomicParams.externalApps,
          premiumAccounts: atomicParams.premiumAccounts,
          serverAppsConfig: atomicParams.serverAppsConfig,
          serverId: atomicParams.serverId,
          serverName: atomicParams.serverName,
          category: atomicParams.category,
          screens: parseInt(pendingClientData.screens),
          isServerCreditBased: atomicParams.isServerCreditBased,
          selectedSharedCredit: atomicParams.selectedSharedCredit,
          sendWelcomeMessage: sendWelcome,
          customWelcomeMessage: message,
        });
        // Success callbacks are handled by the hook
      } catch (error) {
        console.error('[Clients] Atomic create with welcome failed:', error);
      }
      
      setPendingClientData(null);
      return;
    }
    
    // ============ LEGACY SAVE PATH ============
    // Create the client
    createMutation.mutate({
      ...(pendingClientData.data as Parameters<typeof createMutation.mutate>[0]),
      screens: pendingClientData.screens,
    });
    
    setPendingClientData(null);
  };

  const handleEdit = async (client: Client) => {
    setEditingClient(client);
    
    // Reset state immediately
    setExternalApps([]);
    setPremiumAccounts([]);
    setSelectedSharedCredit(null);
    setAdditionalServers([]);
    setServerAppsConfig([]);
    
    // PERF: Enable lazy queries and open dialog immediately
    setPlansEnabled(true);
    setServersEnabled(true);
    setCategoriesEnabled(true);
    setIsDialogOpen(true);

    // PERF: Load ALL data in parallel (don't block UI)
    const loadEditData = async () => {
      if (!client.id) return;

      // Start all async operations in parallel
      const [
        premiumAccountsResult,
        serverAppCredsResult,
        decryptedMainCreds,
        decryptedSecondCreds,
      ] = await Promise.all([
        // Premium accounts
        supabase
          .from('client_premium_accounts')
          .select('*')
          .eq('client_id', client.id),
        // Server app credentials
        supabase
          .from('client_server_app_credentials' as any)
          .select('*, server_app:server_apps(*)')
          .eq('client_id', client.id),
        // Decrypt main credentials
        (async () => {
          if (!client.login && !client.password) return { login: '', password: '' };
          try {
            const existing = decryptedCredentials[client.id];
            if (existing) return existing;
            const [login, password] = await Promise.all([
              client.login ? decrypt(client.login) : Promise.resolve(''),
              client.password ? decrypt(client.password) : Promise.resolve(''),
            ]);
            return { login, password };
          } catch {
            return { login: client.login || '', password: client.password || '' };
          }
        })(),
        // Decrypt second server credentials
        (async () => {
          if (!client.login_2 && !client.password_2) return { login_2: '', password_2: '' };
          try {
            const [login_2, password_2] = await Promise.all([
              client.login_2 ? decrypt(client.login_2) : Promise.resolve(''),
              client.password_2 ? decrypt(client.password_2) : Promise.resolve(''),
            ]);
            return { login_2, password_2 };
          } catch {
            return { login_2: client.login_2 || '', password_2: client.password_2 || '' };
          }
        })(),
      ]);

      // Process premium accounts
      const existingPremiumAccounts = premiumAccountsResult.data;
      if (existingPremiumAccounts && existingPremiumAccounts.length > 0) {
        setPremiumAccounts(existingPremiumAccounts.map(acc => ({
          planId: acc.plan_name || '',
          planName: acc.plan_name || '',
          email: acc.email || '',
          password: acc.password || '',
          price: acc.price?.toString() || '',
          expirationDate: acc.expiration_date || '',
          notes: acc.notes || '',
        })));
      }

      // Process server app credentials (with password decryption in parallel)
      const existingServerAppCredentials = serverAppCredsResult.data as any[] | null;
      if (existingServerAppCredentials && existingServerAppCredentials.length > 0) {
        const groupedByServer: Record<string, { serverId: string; serverName: string; apps: { serverAppId: string; authCode?: string; username?: string; password?: string; provider?: string }[] }> = {};

        // Decrypt all passwords in parallel
        const decryptedCreds = await Promise.all(
          existingServerAppCredentials.map(async (cred) => {
            let decryptedAppPassword = cred.password || '';
            if (decryptedAppPassword) {
              try { decryptedAppPassword = await decrypt(decryptedAppPassword); } catch { /* use raw */ }
            }
            return { ...cred, decryptedPassword: decryptedAppPassword };
          })
        );

        for (const cred of decryptedCreds) {
          const serverId = cred.server_id;
          if (!groupedByServer[serverId]) {
            groupedByServer[serverId] = { serverId, serverName: '', apps: [] };
          }
          groupedByServer[serverId].apps.push({
            serverAppId: cred.server_app_id,
            authCode: cred.auth_code || '',
            username: cred.username || '',
            password: cred.decryptedPassword,
            provider: cred.provider || '',
          });
        }
        setServerAppsConfig(Object.values(groupedByServer));
      }

      // Decrypt and set additional servers in parallel
      const clientAdditionalServers = (client as any).additional_servers || [];
      if (Array.isArray(clientAdditionalServers) && clientAdditionalServers.length > 0) {
        const decryptedServers = await Promise.all(
          clientAdditionalServers.map(async (server: { server_id: string; server_name: string; login: string | null; password: string | null; expiration_date?: string | null }) => {
            try {
              const [decLogin, decPassword] = await Promise.all([
                server.login ? decrypt(server.login) : Promise.resolve(''),
                server.password ? decrypt(server.password) : Promise.resolve(''),
              ]);
              return { 
                server_id: server.server_id, 
                server_name: server.server_name, 
                login: decLogin, 
                password: decPassword,
                expiration_date: server.expiration_date || null
              };
            } catch {
              return { 
                server_id: server.server_id, 
                server_name: server.server_name, 
                login: server.login || '', 
                password: server.password || '',
                expiration_date: server.expiration_date || null
              };
            }
          })
        );
        setAdditionalServers(decryptedServers);
      }

      // Update form with decrypted credentials
      setFormData(prev => ({
        ...prev,
        login: decryptedMainCreds.login,
        password: decryptedMainCreds.password,
        login_2: decryptedSecondCreds.login_2,
        password_2: decryptedSecondCreds.password_2,
      }));
    };

    // Set form data immediately with encrypted values, then update with decrypted
    setFormData({
      name: client.name,
      phone: client.phone || '',
      telegram: client.telegram || '',
      email: client.email || '',
      device: client.device || '',
      dns: client.dns || '',
      expiration_date: client.expiration_date,
      plan_id: client.plan_id || '',
      plan_name: client.plan_name || '',
      plan_price: client.plan_price?.toString() || '',
      premium_price: (client as any).premium_price?.toString() || '',
      server_id: client.server_id || '',
      server_name: client.server_name || '',
      login: '', // Will be updated by loadEditData
      password: '', // Will be updated by loadEditData
      server_id_2: client.server_id_2 || '',
      server_name_2: client.server_name_2 || '',
      login_2: '', // Will be updated by loadEditData
      password_2: '', // Will be updated by loadEditData
      premium_password: client.premium_password || '',
      category: client.category || 'IPTV',
      is_paid: client.is_paid,
      pending_amount: (client as any).pending_amount?.toString() || '',
      expected_payment_date: (client as any).expected_payment_date || '',
      notes: client.notes || '',
      has_paid_apps: client.has_paid_apps || false,
      paid_apps_duration: client.paid_apps_duration || '',
      paid_apps_expiration: client.paid_apps_expiration || '',
      paid_apps_email: (client as any).paid_apps_email || '',
      paid_apps_password: (client as any).paid_apps_password || '',
      screens: '1',
      gerencia_app_mac: client.gerencia_app_mac || '',
      gerencia_app_devices: client.gerencia_app_devices || [],
      app_name: (client as any).app_name || '',
      app_type: (client as any).app_type || 'server',
      device_model: (client as any).device_model || '',
      has_adult_content: (client as any).has_adult_content || false,
    });

    // Load remaining data in background (non-blocking)
    loadEditData();
  };

  const handleRenew = (client: Client) => {
    // PERF: Enable plans lazy load for renewal dialog
    setPlansEnabled(true);
    setRenewClientId(client.id);
    setRenewPlanId(client.plan_id || '');
    // Reset custom date state when opening dialog
    setRenewCustomDate(undefined);
    setRenewUseCustomDate(false);
    setRenewExpirationPopoverOpen(false);
  };

  const confirmRenew = async () => {
    if (!renewClient || isRenewing) return;
    
    const selectedPlan = plans.find(p => p.id === renewPlanId);
    const days = selectedPlan?.duration_days || 30;
    
    // Close dialog immediately for better UX
    const clientToRenew = renewClient;
    const useCustom = renewUseCustomDate && renewCustomDate;
    const customDateStr = useCustom ? format(renewCustomDate!, 'yyyy-MM-dd') : undefined;
    
    setRenewClientId(null);
    setRenewPlanId('');
    setRenewCustomDate(undefined);
    setRenewUseCustomDate(false);
    setRenewExpirationPopoverOpen(false);
    
    // Execute renewal with the robust hook
    await executeRenewal({
      clientId: clientToRenew.id,
      clientName: clientToRenew.name,
      clientPhone: clientToRenew.phone,
      clientCategory: clientToRenew.category,
      currentExpirationDate: clientToRenew.expiration_date,
      durationDays: useCustom ? undefined : days,
      customExpirationDate: customDateStr,
      planId: renewPlanId !== clientToRenew.plan_id ? selectedPlan?.id || null : undefined,
      planName: renewPlanId !== clientToRenew.plan_id ? selectedPlan?.name || clientToRenew.plan_name : clientToRenew.plan_name,
      planPrice: renewPlanId !== clientToRenew.plan_id ? selectedPlan?.price || clientToRenew.plan_price : clientToRenew.plan_price,
    });
  };

  // Use serversForBadges for quick access links (always loaded)
  const getClientServer = (client: Client) => {
    return serversForBadges.find(s => s.id === client.server_id);
  };
  
  const getClientServer2 = (client: Client) => {
    return serversForBadges.find(s => s.id === client.server_id_2);
  };

  const handleShowPassword = async (client: Client) => {
    if (showPassword === client.id) {
      setShowPassword(null);
      return;
    }
    
    // Decrypt if not already decrypted
    if (!decryptedCredentials[client.id] && (client.login || client.password)) {
      await decryptCredentialsForClient(client.id, client.login, client.password);
    }
    
    setShowPassword(client.id);
  };

  const today = startOfToday();
  const nextWeek = addDays(today, 7);

  const getClientStatus = (client: Client) => {
    // Usar T12:00:00 para evitar problemas de timezone
    const expDate = new Date(client.expiration_date + 'T12:00:00');
    if (isBefore(expDate, today)) return 'expired';
    if (isBefore(expDate, nextWeek)) return 'expiring';
    return 'active';
  };

  // Separate archived and active clients - memoized for performance
  // Note: When isViewingArchived is true, all loaded clients are archived (fetched from DB with is_archived=true)
  // When isViewingArchived is false, all loaded clients are active (fetched from DB with is_archived=false/null)
  const { activeClients, archivedClients } = useMemo(() => {
    if (isViewingArchived) {
      // All loaded clients are archived when viewing archived filter
      return { activeClients: [], archivedClients: clients };
    }
    // All loaded clients are active when viewing other filters
    return { activeClients: clients, archivedClients: [] };
  }, [clients, isViewingArchived]);

  // Get expired clients that have been contacted (sent message)
  const expiredCalledClients = useMemo(() => activeClients.filter(c => {
    const status = getClientStatus(c);
    return status === 'expired' && isSent(c.id);
  }), [activeClients, isSent]);

  // Count expired clients NOT contacted yet
  const expiredNotCalledCount = useMemo(() => activeClients.filter(c => {
    const status = getClientStatus(c);
    return status === 'expired' && !isSent(c.id);
  }).length, [activeClients, isSent]);

  // Count API test clients (created via integration)
  const apiTestClientsCount = useMemo(() => 
    activeClients.filter(c => c.is_test && c.is_integrated).length, 
    [activeClients]
  );

  // Normalize phone number for comparison - remove all non-numeric characters
  const normalizePhoneForSearch = useCallback((phone: string | null | undefined): string => {
    if (!phone) return '';
    // Remove all non-numeric characters (spaces, dashes, parentheses, country code symbols)
    return phone.replace(/\D/g, '');
  }, []);

  // Heavily optimized filtering with useMemo - uses debounced search
  const filteredClients = useMemo(() => {
    const baseClients = filter === 'archived' ? archivedClients : activeClients;
    
    // Early return if no filters applied
    if (!debouncedSearch.trim() && categoryFilter === 'all' && serverFilter === 'all' && dnsFilter === 'all' && filter === 'all' && !dateFilter) {
      return baseClients;
    }
    
    // If date filter is active, filter by expiration date first
    let clientsToFilter = baseClients;
    if (dateFilter) {
      clientsToFilter = baseClients.filter(client => {
        const clientExpDate = client.expiration_date.split('T')[0]; // Get just the date part
        return clientExpDate === dateFilter;
      });
    }
    
    // Normalize search text - remove accents and convert to lowercase
    const normalizeText = (text: string) => {
      return text
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, ''); // Remove diacritics
    };

    const rawSearch = debouncedSearch.trim();
    const searchLower = rawSearch.toLowerCase();
    const normalizedSearch = normalizeText(rawSearch);
    const hasSearch = rawSearch.length > 0;
    
    // Normalize the search term for phone comparison
    const normalizedSearchPhone = rawSearch.replace(/\D/g, '');
    const hasPhoneDigits = normalizedSearchPhone.length >= 4; // Only search by phone if at least 4 digits

    return clientsToFilter.filter((client) => {
      // Search filter - only apply if there's a search term
      if (hasSearch) {
        const normalizedName = normalizeText(client.name);

        // Check decrypted credentials if available (safe string fallbacks)
        // Primeiro verifica credenciais descriptografadas manualmente (quando usuário clica para ver)
        const clientCredentials = decryptedCredentials[client.id];
        // Depois verifica o cache de logins descriptografados para busca (pré-carregado)
        const searchCreds = searchDecryptedLogins[client.id];
        
        // Usar login descriptografado - prioriza o que foi descriptografado, senão usa do cache de busca
        const decryptedLogin = clientCredentials?.login || searchCreds?.login || '';
        const decryptedLogin2 = clientCredentials?.login_2 || searchCreds?.login_2 || '';
        
        // Login matching - case insensitive, partial match
        const loginMatch = decryptedLogin.toLowerCase().includes(searchLower);
        const login2Match = decryptedLogin2.toLowerCase().includes(searchLower);

        // Also check raw login for unencrypted/plain text data (legacy data)
        const rawLogin = client.login || '';
        const rawLogin2 = client.login_2 || '';
        // Só usa raw login se não parecer criptografado (evita match falso em ciphertext)
        const rawLoginIsPlain = !looksEncryptedForSearch(rawLogin);
        const rawLogin2IsPlain = !looksEncryptedForSearch(rawLogin2);
        const rawLoginMatch = rawLoginIsPlain && rawLogin.toLowerCase().includes(searchLower);
        const rawLogin2Match = rawLogin2IsPlain && rawLogin2.toLowerCase().includes(searchLower);
        
        // Exact login match (when user pastes the full login)
        const exactLoginMatch = decryptedLogin.toLowerCase() === searchLower ||
                               decryptedLogin2.toLowerCase() === searchLower ||
                               (rawLoginIsPlain && rawLogin.toLowerCase() === searchLower) ||
                               (rawLogin2IsPlain && rawLogin2.toLowerCase() === searchLower);

        // DNS match
        const dnsMatch = (client.dns || '').toLowerCase().includes(searchLower);
        
        // Email match
        const emailMatch = (client.email || '').toLowerCase().includes(searchLower);

        // Name match with normalized text (handles accents)
        const nameMatch = normalizedName.includes(normalizedSearch);
        
        // WhatsApp/Phone matching with normalization
        // Remove all non-numeric characters from both search and client phone
        const clientPhoneNormalized = normalizePhoneForSearch(client.phone);
        let phoneMatch = false;
        
        if (hasPhoneDigits && clientPhoneNormalized) {
          // Check if the normalized phone contains the search digits
          // This handles: +55 11 99999-9999, (11) 99999-9999, 11999999999, etc.
          phoneMatch = clientPhoneNormalized.includes(normalizedSearchPhone);
          
          // Also try matching without country code (remove first 2 digits if phone is long enough)
          if (!phoneMatch && clientPhoneNormalized.length >= 12) {
            const phoneWithoutCountry = clientPhoneNormalized.slice(2);
            phoneMatch = phoneWithoutCountry.includes(normalizedSearchPhone);
          }
          
          // Also check if search includes client's phone (for exact number match)
          if (!phoneMatch) {
            phoneMatch = normalizedSearchPhone.includes(clientPhoneNormalized);
          }
        }
        
        // Also try plain text phone match for partial searches
        if (!phoneMatch && client.phone) {
          phoneMatch = client.phone.includes(rawSearch);
        }

        // Plan name and category match (to find by plan type like "SSH", "IPTV", "P2P")
        const planNameMatch = (client.plan_name || '').toLowerCase().includes(searchLower);
        const categoryMatch = (client.category || '').toLowerCase().includes(searchLower);
        // Notes match
        const notesMatch = (client.notes || '').toLowerCase().includes(searchLower);

        const matchesSearch =
          nameMatch ||
          phoneMatch ||
          emailMatch ||
          dnsMatch ||
          loginMatch ||
          login2Match ||
          rawLoginMatch ||
          rawLogin2Match ||
          exactLoginMatch ||
          planNameMatch ||
          categoryMatch ||
          notesMatch;

        if (!matchesSearch) return false;
      }

      // Filter by category
      if (categoryFilter !== 'all') {
        if (categoryFilter === '__uncategorized__') {
          // Filtra clientes sem categoria ou com categoria não reconhecida
          if (client.category && allCategories.includes(client.category)) {
            return false;
          }
        } else if (client.category !== categoryFilter) {
          return false;
        }
      }

      // Filter by server
      if (serverFilter !== 'all' && client.server_id !== serverFilter) {
        return false;
      }

      // Filter by DNS
      if (dnsFilter !== 'all' && client.dns !== dnsFilter) {
        return false;
      }

      // For archived filter, just return all archived clients that match search/category
      if (filter === 'archived') return true;

      const status = getClientStatus(client);
      switch (filter) {
        case 'active':
          return status === 'active';
        case 'expiring':
          return status === 'expiring';
        case 'expired':
          return status === 'expired';
        case 'expired_not_called':
          return status === 'expired' && !isSent(client.id);
        case 'unpaid':
          return !client.is_paid;
        case 'with_paid_apps':
          return clientsWithPaidAppsSet.has(client.id);
        case 'api_tests':
          return client.is_test && client.is_integrated;
        default:
          return true;
      }
    });
  }, [activeClients, archivedClients, filter, debouncedSearch, categoryFilter, serverFilter, dnsFilter, dateFilter, decryptedCredentials, searchDecryptedLogins, looksEncryptedForSearch, isSent, clientsWithPaidAppsSet, normalizePhoneForSearch]);

  // Sort clients: recently added (last 2 hours) appear at top, then by expiration
  const sortedClients = useMemo(() => {
    return [...filteredClients].sort((a, b) => {
      const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
      const aCreatedAt = a.created_at ? new Date(a.created_at) : null;
      const bCreatedAt = b.created_at ? new Date(b.created_at) : null;
      
      const aIsRecent = aCreatedAt && aCreatedAt > twoHoursAgo;
      const bIsRecent = bCreatedAt && bCreatedAt > twoHoursAgo;
      
      // Recent clients first
      if (aIsRecent && !bIsRecent) return -1;
      if (!aIsRecent && bIsRecent) return 1;
      
      // Among recent clients, newest first
      if (aIsRecent && bIsRecent) {
        return bCreatedAt!.getTime() - aCreatedAt!.getTime();
      }
      
      // For older clients, sort by expiration date
      return new Date(a.expiration_date).getTime() - new Date(b.expiration_date).getTime();
    });
  }, [filteredClients]);

  // Performance optimization - Pagination
  const ITEMS_PER_PAGE = 50;
  const {
    paginatedItems: paginatedClients,
    currentPage,
    totalPages,
    goToPage,
    startIndex,
    endIndex,
    totalItems,
  } = usePerformanceOptimization(sortedClients, { pageSize: ITEMS_PER_PAGE });

  // Sempre volte para a página 1 quando mudar busca/filtros (evita parecer que “sumiu” cliente)
  useEffect(() => {
    goToPage(1, false);
  }, [debouncedSearch, filter, categoryFilter, serverFilter, dnsFilter, dateFilter, goToPage]);

  const addCategoryMutation = useMutation({
    mutationFn: async (name: string) => {
      const { error } = await supabase
        .from('client_categories')
        .insert({ seller_id: user!.id, name });
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

  const statusColors = {
    active: 'border-l-success',
    expiring: 'border-l-warning',
    expired: 'border-l-destructive',
  };

  const statusBadges = {
    active: 'bg-success/10 text-success',
    expiring: 'bg-warning/10 text-warning',
    expired: 'bg-destructive/10 text-destructive',
  };

  const statusLabels = {
    active: 'Ativo',
    expiring: 'Vencendo',
    expired: 'Vencido',
  };

  // Fetch GerenciaApp settings for banner
  const { data: gerenciaAppSettings } = useQuery({
    queryKey: ['gerencia-app-settings-clients'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('app_settings')
        .select('key, value')
        .in('key', ['gerencia_app_panel_url', 'gerencia_app_register_url']);
      
      if (error) throw error;
      
      const settings: { panelUrl: string; registerUrl: string } = {
        panelUrl: '',
        registerUrl: ''
      };
      
      data?.forEach(item => {
        if (item.key === 'gerencia_app_panel_url') settings.panelUrl = item.value;
        if (item.key === 'gerencia_app_register_url') settings.registerUrl = item.value;
      });
      
      return settings;
    },
  });

  const hasGerenciaApp = gerenciaAppSettings?.registerUrl && gerenciaAppSettings.registerUrl.trim() !== '';

  return (
    <div className="space-y-4 animate-fade-in">
      {/* GerenciaApp Banner */}
      {hasGerenciaApp && (
        <Card className="border-2 border-primary bg-gradient-to-r from-primary/10 via-primary/5 to-primary/10 overflow-hidden relative">
          <div className="absolute top-0 right-0 w-32 h-32 bg-primary/20 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
          <CardContent className="p-4 relative">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center shadow-lg flex-shrink-0">
                  <Smartphone className="w-6 h-6 text-primary-foreground" />
                </div>
                <div className="text-center sm:text-left">
                  <div className="flex items-center gap-2 justify-center sm:justify-start">
                    <h3 className="font-bold text-lg">GerenciaApp</h3>
                    <Badge className="bg-gradient-to-r from-green-500 to-emerald-500 text-white border-0 text-xs font-bold animate-pulse">
                      ♾️ ILIMITADO
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Ative apps Premium na Play Store por apenas <span className="text-primary font-bold text-base">R$ 40/mês</span>
                  </p>
                </div>
              </div>
              <div className="flex gap-2 flex-shrink-0">
                <Button 
                  className="bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 font-bold shadow-lg transition-all hover:scale-[1.02]"
                  onClick={() => {
                    if (gerenciaAppSettings?.panelUrl) {
                      window.open(gerenciaAppSettings.panelUrl, '_blank');
                    } else {
                      toast.info('URL do painel não configurada. Contate o administrador.');
                    }
                  }}
                >
                  <ExternalLink className="w-4 h-4 mr-2" />
                  ENTRAR NO PAINEL
                </Button>
                <Button 
                  variant="outline"
                  className="border-green-500/50 bg-green-500/10 hover:bg-green-500/20 text-green-600 dark:text-green-400 font-bold transition-all hover:scale-[1.02]"
                  onClick={() => window.open(gerenciaAppSettings?.registerUrl, '_blank')}
                >
                  <UserPlus className="w-4 h-4 mr-2" />
                  CADASTRAR
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Clientes</h1>
            <p className="text-sm text-muted-foreground">Gerencie seus clientes</p>
          </div>
        </div>

        <Dialog open={isDialogOpen} onOpenChange={(open) => {
          // When closing (open = false)
          if (!open) {
            // Only show confirmation for NEW clients (not editing) with unsaved changes
            if (!editingClient && hasFormChanges()) {
              confirm({
                title: 'Descartar alterações?',
                description: 'Você tem dados não salvos. Deseja sair sem salvar?',
                confirmText: 'Sair sem salvar',
                cancelText: 'Continuar editando',
                variant: 'warning',
                onConfirm: () => {
                  setIsDialogOpen(false);
                  setEditingClient(null);
                  resetForm();
                  setAddCategoryOpen(false);
                  setExpirationPopoverOpen(false);
                  setPaidAppsExpirationPopoverOpen(false);
                },
              });
              return; // Don't close yet, wait for confirmation
            }
            
            // Close directly (for editing or no changes)
            setIsDialogOpen(false);
            setEditingClient(null);
            resetForm();
            setAddCategoryOpen(false);
            setExpirationPopoverOpen(false);
            setPaidAppsExpirationPopoverOpen(false);
            return;
          }
          
          // When opening (open = true)
          // PERF: Enable lazy queries when dialog opens
          setPlansEnabled(true);
          setServersEnabled(true);
          setCategoriesEnabled(true);
          setIsDialogOpen(true);
        }}>
          <div className="flex gap-2 flex-wrap">
            {clients.length > 0 && (
              <Button 
                variant="destructive" 
                size="sm"
                className="gap-1"
                onClick={() => setShowDeleteAllConfirm(true)}
              >
                <Trash2 className="h-4 w-4" />
                <span className="hidden sm:inline">Remover Todos</span>
              </Button>
            )}
            <BulkImportClients plans={plans} />
            <DialogTrigger asChild>
              <Button className="gap-2" onClick={() => {
                // PERF: Enable lazy queries when dialog opens
                setPlansEnabled(true);
                setServersEnabled(true);
                setCategoriesEnabled(true);
              }}>
                <Plus className="h-4 w-4" />
                <span className="hidden sm:inline">Novo Cliente</span>
                <span className="sm:hidden">Novo</span>
              </Button>
            </DialogTrigger>
          </div>
          {/*
            IMPORTANT (Scroll stability):
            DialogContent already has overflow-y-auto by default. This dialog uses its own
            internal scroll container, so we must disable the outer scroll to avoid
            nested scroll containers fighting ("tremor"/jitter on touch + mouse wheel).
          */}
          <DialogContent className="max-w-lg sm:max-w-2xl w-[95vw] max-h-[85vh] sm:max-h-[85vh] p-0 flex flex-col overflow-hidden">
            <DialogHeader className="px-4 pt-4 pb-2 sm:px-6 sm:pt-6 sm:pb-3 flex-shrink-0 border-b">
              <DialogTitle className="text-base sm:text-lg">{editingClient ? 'Editar Cliente' : 'Novo Cliente'}</DialogTitle>
              <DialogDescription className="text-xs sm:text-sm">
                {editingClient ? 'Atualize os dados do cliente' : 'Preencha os dados do novo cliente'}
              </DialogDescription>
            </DialogHeader>
            {/* Single scroll container for the whole form (prevents scroll jitter) */}
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
                      <SelectContent position="popper" sideOffset={4}>
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
                  {/* Adult content indicator text */}
                  {(formData.category === 'IPTV' || formData.category === 'P2P') && (
                    <p className="text-xs text-muted-foreground">
                      {formData.has_adult_content 
                        ? '✅ Conteúdo adulto habilitado (+18)' 
                        : '❌ Conteúdo adulto desabilitado (-18)'
                      }
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="name">Nome *</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">Telefone (WhatsApp)</Label>
                  <Input
                    id="phone"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    placeholder="+55 11 99999-9999"
                  />
                </div>
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
                {formData.category === 'Contas Premium' && user && (
                  <div className="md:col-span-2 p-4 rounded-lg bg-gradient-to-r from-amber-500/10 to-orange-500/10 border border-amber-500/30">
                    <ClientPremiumAccounts
                      sellerId={user.id}
                      onChange={setPremiumAccounts}
                      initialAccounts={premiumAccounts}
                    />
                  </div>
                )}
                
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
                        {DEVICE_OPTIONS.map((device) => {
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
                              <device.icon className="h-4 w-4 text-muted-foreground" />
                              <span className="text-sm">{device.label}</span>
                            </label>
                          );
                        })}
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>

                {/* Device Model - Show when device is selected */}
                {formData.device && (
                  <div className="space-y-2">
                    <Label htmlFor="device_model">Marca/Modelo da TV</Label>
                    <Input
                      id="device_model"
                      value={formData.device_model}
                      onChange={(e) => setFormData({ ...formData, device_model: e.target.value })}
                      placeholder="Ex: Samsung, LG, TCL..."
                    />
                  </div>
                )}

                {/* DNS Fields - Dynamic with add/remove */}
                <DnsFieldsSection
                  dns={formData.dns}
                  onChange={(dns) => setFormData({ ...formData, dns })}
                />

                {/* Plan Select and Dynamic Value Field */}
                <div className="space-y-2">
                  <Label>Plano</Label>
                  <PlanSelector
                    plans={plans}
                    value={formData.plan_id || ''}
                    onValueChange={handlePlanChange}
                    placeholder="Selecionar plano"
                    showFilters={true}
                    defaultCategory={formData.category}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="plan_price">
                    {(() => {
                      // Dynamic label based on selected plan or category
                      const selectedPlan = plans?.find(p => p.id === formData.plan_id);
                      if (selectedPlan?.category) {
                        return `Valor ${selectedPlan.category} (R$)`;
                      }
                      if (formData.category && formData.category !== 'Contas Premium') {
                        return `Valor ${formData.category} (R$)`;
                      }
                      return 'Valor (R$)';
                    })()}
                  </Label>
                  <Input
                    id="plan_price"
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.plan_price}
                    onChange={(e) => setFormData({ ...formData, plan_price: e.target.value })}
                    placeholder="Ex: 25.00"
                  />
                  <p className="text-xs text-muted-foreground">
                    {formData.plan_id ? 'Preenchido pelo plano. Edite para promoções.' : 'Defina o valor manualmente ou selecione um plano.'}
                  </p>
                </div>
                {formData.plan_price && (
                  <div className="md:col-span-2 p-3 rounded-lg bg-primary/10 border border-primary/30">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Valor:</span>
                      <span className="text-lg font-bold text-primary">
                        R$ {(parseFloat(formData.plan_price) || 0).toFixed(2)}
                      </span>
                    </div>
                  </div>
                )}

                {/* Server Select - Only for IPTV/SSH/P2P, not for Contas Premium */}
                {formData.category !== 'Contas Premium' && (
                  <div className="space-y-2">
                    <Label>Servidor</Label>
                    <Select
                      value={formData.server_id || 'manual'}
                      onValueChange={handleServerChange}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione um servidor" />
                      </SelectTrigger>
                      <SelectContent className="max-h-[50vh] md:max-h-[80vh] overflow-y-auto">
                        <SelectItem value="manual">Nenhum</SelectItem>
                        {activeServers.map((server) => (
                          <SelectItem key={server.id} value={server.id}>
                            {server.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* App Type selection moved to AppsSection component below */}

                {/* Screen Selection for Credit-Based Servers */}
                {formData.category !== 'Contas Premium' && formData.server_id && selectedServer?.is_credit_based && (
                  <div className="space-y-3 p-4 rounded-lg bg-gradient-to-br from-blue-500/5 to-blue-500/10 border border-blue-500/30">
                    <div className="flex items-center gap-2">
                      <Monitor className="h-5 w-5 text-blue-500" />
                      <h4 className="font-semibold text-blue-600 dark:text-blue-400">Gestão de Telas do Crédito</h4>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label className="text-xs text-muted-foreground">
                          Telas por crédito no servidor
                        </Label>
                        <div className="p-2 rounded-md bg-muted text-center font-bold">
                          {selectedServer?.total_screens_per_credit || 1}
                          <span className="text-xs font-normal text-muted-foreground ml-1">
                            ({selectedServer?.iptv_per_credit || 0} IPTV + {selectedServer?.p2p_per_credit || 0} P2P)
                          </span>
                        </div>
                      </div>
                      
                      <div className="space-y-2">
                        <Label className="text-xs">
                          Telas que o cliente comprou
                        </Label>
                        <Select
                          value={formData.screens}
                          onValueChange={(value) => setFormData({ ...formData, screens: value })}
                        >
                          <SelectTrigger className="bg-background">
                            <SelectValue placeholder="Selecione" />
                          </SelectTrigger>
                          <SelectContent position="popper" sideOffset={4}>
                            {isWplayServer ? (
                              <>
                                <SelectItem value="1">1 Tela (IPTV)</SelectItem>
                                <SelectItem value="2">2 Telas (IPTV)</SelectItem>
                                <SelectItem value="3">3 Telas (2 IPTV + 1 P2P)</SelectItem>
                              </>
                            ) : (
                              Array.from({ length: maxScreens }, (_, i) => i + 1).map((num) => (
                                <SelectItem key={num} value={num.toString()}>
                                  {num} {num === 1 ? 'Tela' : 'Telas'}
                                </SelectItem>
                              ))
                            )}
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
                              // Normalize to noon to prevent timezone issues
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
                  <p className="text-xs text-muted-foreground">
                    Calculada pelo plano. Clique na data ou use os botões para ajustar.
                  </p>
                </div>

                {/* IPTV/SSH Login and Password - Only show for IPTV, P2P, SSH, or Revendedor categories */}
                {(formData.category === 'IPTV' || formData.category === 'P2P' || formData.category === 'SSH' || formData.category === 'Revendedor') && (
                  <>
                    {/* Login + Senha agrupados no mesmo row no desktop */}
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
                      servers={activeServers}
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
                    
                    {/* MAC GerenciaApp - Múltiplos Dispositivos */}
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
                                      // Auto-format MAC address with colons
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
                
                {/* Valor Pendente e Data de Pagamento - Mostrar quando não pago OU com valor pendente */}
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
                              // Se preencheu valor, sugere data de hoje + 1 dia automaticamente
                              expected_payment_date: newValue && parseFloat(newValue) > 0 && !formData.expected_payment_date 
                                ? format(addDays(new Date(), 1), 'yyyy-MM-dd')
                                : formData.expected_payment_date
                            });
                          }}
                          placeholder="Ex: 20.00"
                          className="border-emerald-500/30 focus:border-emerald-500"
                        />
                        <p className="text-xs text-muted-foreground">
                          💰 Valor que o cliente ainda deve pagar
                        </p>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="expected_payment_date" className="flex items-center gap-1">
                          <CalendarIcon className="h-3 w-3" />
                          Data para Cobrar
                        </Label>
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button
                              variant="outline"
                              type="button"
                              className={cn(
                                "w-full justify-start text-left font-normal border-emerald-500/30",
                                !formData.expected_payment_date && "text-muted-foreground"
                              )}
                            >
                              <CalendarIcon className="mr-2 h-4 w-4" />
                              {formData.expected_payment_date
                                ? format(new Date(formData.expected_payment_date + 'T12:00:00'), 'dd/MM/yyyy', { locale: ptBR })
                                : 'Selecione a data'}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <CalendarPicker
                              mode="single"
                              selected={formData.expected_payment_date ? new Date(formData.expected_payment_date + 'T12:00:00') : undefined}
                              onSelect={(date) => {
                                if (date) {
                                  setFormData({ ...formData, expected_payment_date: format(date, 'yyyy-MM-dd') });
                                }
                              }}
                              locale={ptBR}
                              initialFocus
                            />
                          </PopoverContent>
                        </Popover>
                        <p className="text-xs text-muted-foreground">
                          🔔 Você receberá notificação para cobrar
                        </p>
                      </div>
                    </div>
                    
                    {formData.expected_payment_date && parseFloat(formData.pending_amount || '0') > 0 && (
                      <p className="text-xs text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 p-2 rounded">
                        ✅ Notificação de cobrança será enviada em {format(new Date(formData.expected_payment_date + 'T12:00:00'), "dd 'de' MMMM", { locale: ptBR })}
                      </p>
                    )}
                  </div>
                )}
              </div>

              {/* Shared Credits Section - Toggle with collapsible */}
              {formData.server_id && user && (
                <SharedCreditsSection
                  sellerId={user.id}
                  category={formData.category}
                  serverId={formData.server_id}
                  planDurationDays={formData.plan_id ? plans.find(p => p.id === formData.plan_id)?.duration_days : undefined}
                  selectedCredit={selectedSharedCredit}
                  onSelect={handleSharedCreditSelect}
                />
              )}

              {/* Apps Section - Reorganized with server vs reseller */}
              {user && (
                <AppsSection
                  category={formData.category}
                  serverId={formData.server_id || undefined}
                  serverName={formData.server_name || undefined}
                  serverApps={serverApps}
                  resellerApps={resellerApps}
                  appType={formData.app_type}
                  appName={formData.app_name}
                  onAppChange={(appType, appName) => setFormData({ ...formData, app_type: appType as 'server' | 'own', app_name: appName })}
                  clientId={editingClient?.id}
                  sellerId={user.id}
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
              )}

              {/* Server Partner Apps Section - Only for IPTV/P2P with server selected */}
              {user && formData.server_id && (formData.category === 'IPTV' || formData.category === 'P2P') && (
                <ServerPartnerAppsSection
                  sellerId={user.id}
                  servers={[
                    { id: formData.server_id, name: formData.server_name || '' },
                    ...additionalServers.filter(s => s.server_id).map(s => ({ id: s.server_id, name: s.server_name }))
                  ]}
                  selectedDevices={formData.device}
                  serverAppsConfig={serverAppsConfig}
                  onChange={setServerAppsConfig}
                />
              )}

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
              <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 p-3 rounded-lg">
                <Lock className="w-4 h-4 flex-shrink-0" />
                <span>Login e senha são criptografados antes de serem salvos.</span>
              </div>
              </form>
            </div>
            <div className="flex-shrink-0 border-t px-4 py-3 sm:px-6 sm:py-4 flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
              <Button type="button" variant="outline" size="sm" className="sm:size-default" onClick={() => setIsDialogOpen(false)}>
                Cancelar
              </Button>
              <Button 
                type="submit" 
                size="sm"
                className="sm:size-default"
                disabled={createMutation.isPending || updateMutation.isPending}
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
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 max-w-full overflow-hidden">
        {/* Search */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome, login, DNS..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 h-9"
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            className="h-9 gap-1.5 shrink-0 bg-gradient-to-r from-primary/10 to-purple-500/10 border-primary/30 hover:border-primary/50"
            onClick={() => setShowLookupDialog(true)}
          >
            <UserSearch className="h-4 w-4 text-primary" />
            <span className="hidden sm:inline">Consulta 360°</span>
          </Button>
        </div>
        
        {/* Category Filter Tabs */}
        <div className="space-y-2">
          <Label className="text-sm text-muted-foreground">Filtrar por Categoria</Label>
          <div className="overflow-x-auto scrollbar-hide -mx-1 px-1">
            <div className="flex gap-2 w-max">
              {(() => {
                // Calcula clientes sem categoria para garantir que o total seja coerente
                const uncategorizedCount = clients.filter(c => !c.category || !allCategories.includes(c.category)).length;
                const categorizedTotal = allCategories.reduce((sum, cat) => sum + clients.filter(c => c.category === cat).length, 0);
                // Total real = soma das categorias + sem categoria
                const realTotal = categorizedTotal + uncategorizedCount;
                
                return (
                  <>
                    <Button
                      variant={categoryFilter === 'all' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setCategoryFilter('all')}
                      className="shrink-0"
                    >
                      Todos ({realTotal})
                    </Button>
                    {allCategories.map((cat) => {
                      const count = clients.filter(c => c.category === cat).length;
                      return (
                        <Button
                          key={cat}
                          variant={categoryFilter === cat ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => setCategoryFilter(cat)}
                          className="shrink-0"
                        >
                          {cat} ({count})
                        </Button>
                      );
                    })}
                    {uncategorizedCount > 0 && (
                      <Button
                        variant={categoryFilter === '__uncategorized__' ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setCategoryFilter('__uncategorized__')}
                        className="shrink-0 text-muted-foreground"
                      >
                        Sem categoria ({uncategorizedCount})
                      </Button>
                    )}
                  </>
                );
              })()}
            </div>
          </div>
        </div>

        {/* Server Filter - Discrete dropdown */}
        {serversForBadges.length > 0 && (
          <div className="flex items-center gap-2">
            <Server className="h-4 w-4 text-muted-foreground" />
            <Select value={serverFilter} onValueChange={setServerFilter}>
              <SelectTrigger className="w-[180px] h-8 text-sm">
                <SelectValue placeholder="Filtrar servidor" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os servidores</SelectItem>
                {serversForBadges.map((server) => {
                  const count = clients.filter(c => c.server_id === server.id).length;
                  return (
                    <SelectItem key={server.id} value={server.id}>
                      {server.name} ({count})
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
            {serverFilter !== 'all' && (
              <>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => setServerFilter('all')}
                  className="h-8 px-2 text-xs"
                >
                  Limpar
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowMigrationDialog(true)}
                  className="h-8 px-2 text-xs gap-1"
                >
                  <ArrowRightLeft className="h-3 w-3" />
                  Migrar ({clients.filter(c => c.server_id === serverFilter).length})
                </Button>
              </>
            )}
          </div>
        )}

        {/* DNS Filter - Shows unique DNS values */}
        {(() => {
          const uniqueDns = [...new Set(clients.filter(c => c.dns).map(c => c.dns!))].sort();
          if (uniqueDns.length === 0) return null;
          return (
            <div className="flex items-center gap-2">
              <Globe className="h-4 w-4 text-blue-500" />
              <Select value={dnsFilter} onValueChange={setDnsFilter}>
                <SelectTrigger className="w-[200px] h-8 text-sm">
                  <SelectValue placeholder="Filtrar por DNS" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os DNS</SelectItem>
                  {uniqueDns.map((dns) => {
                    const count = clients.filter(c => c.dns === dns).length;
                    return (
                      <SelectItem key={dns} value={dns}>
                        {dns} ({count})
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
              {dnsFilter !== 'all' && (
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => setDnsFilter('all')}
                  className="h-8 px-2 text-xs"
                >
                  Limpar
                </Button>
              )}
            </div>
          );
        })()}

        {/* Status Filter Tabs */}
        <div className="flex flex-col gap-2 w-full max-w-full overflow-hidden">
          {/* Status Tabs Row - Scrollable */}
          <Tabs value={filter} onValueChange={(v) => setFilter(v as FilterType)} className="w-full">
            <div className="overflow-x-auto scrollbar-hide -mx-1 px-1">
              <TabsList className="inline-flex w-max h-auto gap-1 p-1">
                <TabsTrigger value="all" className="shrink-0 text-xs sm:text-sm">Todos ({activeClients.length})</TabsTrigger>
                <TabsTrigger value="active" className="shrink-0 text-xs sm:text-sm">Ativos</TabsTrigger>
                <TabsTrigger value="expiring" className="shrink-0 text-xs sm:text-sm">Vencendo</TabsTrigger>
                <TabsTrigger value="expired" className="shrink-0 text-xs sm:text-sm">Vencidos</TabsTrigger>
                <TabsTrigger value="expired_not_called" className="gap-1 text-destructive shrink-0 text-xs sm:text-sm">
                  <Phone className="h-3 w-3" />
                  <span className="hidden xs:inline">Não Chamados</span>
                  <span className="xs:hidden">NC</span>
                  ({expiredNotCalledCount})
                </TabsTrigger>
                <TabsTrigger value="unpaid" className="shrink-0 text-xs sm:text-sm">
                  <span className="hidden xs:inline">Não Pagos</span>
                  <span className="xs:hidden">NP</span>
                </TabsTrigger>
                <TabsTrigger value="with_paid_apps" className="gap-1 shrink-0 text-xs sm:text-sm">
                  <AppWindow className="h-3 w-3" />
                  <span className="hidden sm:inline">Apps</span>
                  ({clientsWithExternalApps.length > 0 ? activeClients.filter(c => clientsWithPaidAppsSet.has(c.id)).length : 0})
                </TabsTrigger>
                <TabsTrigger value="api_tests" className="gap-1 text-purple-600 dark:text-purple-400 shrink-0 text-xs sm:text-sm">
                  <Beaker className="h-3 w-3" />
                  <span className="hidden sm:inline">Testes</span>
                  ({apiTestClientsCount})
                </TabsTrigger>
                <TabsTrigger value="archived" className="gap-1 shrink-0 text-xs sm:text-sm">
                  <Archive className="h-3 w-3" />
                  <span className="hidden xs:inline">Lixeira</span>
                  ({archivedClientsCount})
                </TabsTrigger>
              </TabsList>
            </div>
          </Tabs>
          
          {/* Action Buttons Row - Wraps on small screens */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Sent Messages Counter */}
            {sentCount > 0 && (
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="gap-1 text-success">
                  <CheckCircle className="h-3 w-3" />
                  {sentCount} enviado{sentCount > 1 ? 's' : ''}
                </Badge>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs text-muted-foreground hover:text-destructive"
                  onClick={() => {
                    confirm({
                      title: 'Limpar marcações',
                      description: 'Limpar todas as marcações de mensagens enviadas?',
                      confirmText: 'Limpar',
                      variant: 'warning',
                      onConfirm: () => {
                        clearAllSentMarks();
                        toast.success('Marcações limpas');
                      },
                    });
                  }}
                >
                  Limpar
                </Button>
              </div>
            )}
            
            {/* Archive expired called clients */}
            {expiredCalledClients.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 text-xs h-8 border-warning/50 text-warning hover:bg-warning/10"
                onClick={() => {
                  confirm({
                    title: 'Arquivar clientes vencidos',
                    description: `Arquivar ${expiredCalledClients.length} cliente${expiredCalledClients.length > 1 ? 's' : ''} vencido${expiredCalledClients.length > 1 ? 's' : ''} já chamado${expiredCalledClients.length > 1 ? 's' : ''}?`,
                    confirmText: 'Arquivar',
                    variant: 'warning',
                    onConfirm: () => archiveCalledExpiredMutation.mutate(expiredCalledClients.map(c => c.id)),
                  });
                }}
                disabled={archiveCalledExpiredMutation.isPending}
              >
                {archiveCalledExpiredMutation.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Archive className="h-3.5 w-3.5" />
                )}
                <span className="hidden xs:inline">Arquivar</span> ({expiredCalledClients.length})
              </Button>
            )}
            
            {/* Bulk message for expired not called */}
            {expiredNotCalledCount > 0 && !isBulkMessaging && (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 text-xs h-8 border-primary/50 text-primary hover:bg-primary/10"
                onClick={() => {
                  const expiredNotCalled = activeClients.filter(c => {
                    const status = getClientStatus(c);
                    return status === 'expired' && !isSent(c.id) && (c.phone || c.telegram);
                  });
                  if (expiredNotCalled.length === 0) {
                    toast.error('Nenhum cliente vencido não chamado com contato disponível');
                    return;
                  }
                  setBulkMessageQueue(expiredNotCalled);
                  setBulkMessageIndex(0);
                  setMessageClient(expiredNotCalled[0]);
                  toast.info(`Iniciando envio para ${expiredNotCalled.length} cliente${expiredNotCalled.length > 1 ? 's' : ''}...`);
                }}
              >
                <MessageCircle className="h-3.5 w-3.5" />
                <span className="hidden xs:inline">Enviar NC</span> ({expiredNotCalledCount})
              </Button>
            )}
            
            {/* Bulk Loyalty/Referral Campaign */}
            <BulkLoyaltyMessage
              clients={activeClients}
              templates={templates}
              onSendMessage={(client) => {
                // Find the full client object to pass to SendMessageDialog
                const fullClient = activeClients.find(c => c.id === client.id);
                if (fullClient) {
                  setMessageClient(fullClient);
                }
              }}
              isDialogOpen={!!messageClient}
              onOpen={() => setTemplatesEnabled(true)} // PERF: Trigger lazy load
            />
            
            {/* Bulk messaging progress indicator */}
            {isBulkMessaging && (
              <Badge variant="secondary" className="gap-1.5 text-primary animate-pulse">
                <MessageCircle className="h-3.5 w-3.5" />
                Enviando {bulkMessageIndex + 1}/{bulkMessageQueue.length}
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-5 px-1 ml-1 text-destructive hover:text-destructive"
                  onClick={() => {
                    setBulkMessageQueue([]);
                    setBulkMessageIndex(0);
                    setMessageClient(null);
                    toast.info('Envio em massa cancelado');
                  }}
                >
                  <X className="h-3 w-3" />
                </Button>
              </Badge>
            )}
          </div>
        </div>
      </div>

      {/* Expiration Day Summary - Shows clients expiring in the next 5 days */}
      <ExpirationDaySummary 
        clients={clients} 
        isPrivacyMode={isPrivacyMode}
        selectedDate={dateFilter}
        onDateClick={(date) => {
          setDateFilter(date);
          // Reset to first page when filtering by date
          if (date) {
            goToPage(1);
          }
        }}
      />

      {/* Clients Grid */}
      {isLoading ? (
        <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {[...Array(6)].map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="p-6">
                <div className="h-6 bg-muted rounded w-3/4 mb-4" />
                <div className="space-y-2">
                  <div className="h-4 bg-muted rounded w-1/2" />
                  <div className="h-4 bg-muted rounded w-2/3" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : sortedClients.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <User className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">Nenhum cliente encontrado</h3>
            <p className="text-muted-foreground text-center">
              {search ? 'Tente ajustar sua busca' : 'Adicione seu primeiro cliente clicando no botão acima'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
        {/* Pagination Controls - Top */}
        <PaginationControls
          currentPage={currentPage}
          totalPages={totalPages}
          totalItems={totalItems}
          startIndex={startIndex}
          endIndex={endIndex}
          onPageChange={goToPage}
          isLoading={isLoading}
        />
        <div className="clients-grid">
          {paginatedClients.map((client) => {
            const status = getClientStatus(client);
            const daysLeft = differenceInDays(new Date(client.expiration_date + 'T12:00:00'), today);
            const hasCredentials = client.login || client.password;
            const isDecrypted = decryptedCredentials[client.id];
            const isDecrypting = decrypting === client.id;
            const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
            const isRecentlyAdded = client.created_at && new Date(client.created_at) > twoHoursAgo;
            const categoryName = typeof client.category === 'object' ? (client.category as any)?.name : client.category;
            const isReseller = categoryName === 'Revendedor';
            
            return (
              <Card
                key={client.id}
                className={cn(
                  'border-l-4 transition-all duration-200 hover:shadow-lg animate-slide-up',
                  // Different border color for resellers (only for sellers, not admin)
                  isReseller && !isAdmin ? 'border-l-purple-500' : statusColors[status],
                  !client.is_paid && 'ring-1 ring-destructive/50',
                  isRecentlyAdded && 'ring-2 ring-primary/50 bg-primary/5',
                  // Subtle background for resellers (only for sellers)
                  isReseller && !isAdmin && 'bg-purple-500/5'
                )}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-lg">{maskData(client.name, 'name')}</h3>
                        {isRecentlyAdded && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-primary text-primary-foreground animate-pulse">
                            NOVO
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {/* For API test clients with expiration_datetime, show countdown */}
                        {client.is_test && client.is_integrated && client.expiration_datetime ? (
                          <>
                            <Badge variant="outline" className="gap-1 bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/30">
                              <Beaker className="h-3 w-3" />
                              TESTE
                            </Badge>
                            <TestCountdown expirationDatetime={client.expiration_datetime} />
                          </>
                        ) : (
                          <span className={cn('text-xs px-2 py-0.5 rounded-full', statusBadges[status])}>
                            {statusLabels[status]} {daysLeft > 0 && status !== 'expired' && `(${daysLeft}d)`}
                          </span>
                        )}
                        {client.category && (
                          <span className={cn(
                            'text-xs px-2 py-0.5 rounded-full',
                            isReseller && !isAdmin 
                              ? 'bg-purple-500/20 text-purple-600 dark:text-purple-400' 
                              : 'bg-primary/10 text-primary'
                          )}>
                            {categoryName}
                          </span>
                        )}
                      </div>
                    </div>
                    {!client.is_paid && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-xs bg-destructive/10 text-destructive hover:bg-green-500/20 hover:text-green-600 transition-colors"
                        onClick={async (e) => {
                          e.stopPropagation();
                          try {
                            const { error } = await supabase
                              .from('clients')
                              .update({ 
                                is_paid: true, 
                                pending_amount: 0,
                                renewed_at: new Date().toISOString()
                              })
                              .eq('id', client.id);
                            
                            if (error) throw error;
                            
                            toast.success(`${client.name} marcado como pago. Receita atualizada!`);
                            queryClient.invalidateQueries({ queryKey: ['clients'] });
                          } catch (error) {
                            console.error('Error updating payment status:', error);
                            toast.error("Não foi possível atualizar o status de pagamento.");
                          }
                        }}
                        title="Clique para marcar como pago"
                      >
                        <DollarSign className="h-3 w-3 mr-1" />
                        Não Pago
                      </Button>
                    )}
                  </div>

                  <div className="space-y-2 text-sm">
                    {client.phone && (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Phone className="h-3.5 w-3.5" />
                        <span>{maskData(client.phone, 'phone')}</span>
                      </div>
                    )}
                    {client.email && (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Mail className="h-3.5 w-3.5" />
                        <span className="truncate">{maskData(client.email, 'email')}</span>
                      </div>
                    )}
                    {client.dns && (
                      <div className="flex items-center gap-2 text-muted-foreground group">
                        <Globe className="h-3.5 w-3.5 text-blue-500" />
                        <span className="truncate text-blue-600 dark:text-blue-400 font-medium">{client.dns}</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-5 w-5 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigator.clipboard.writeText(client.dns!);
                            toast.success('DNS copiado!');
                          }}
                          title="Copiar DNS"
                        >
                          <Copy className="h-3 w-3" />
                        </Button>
                      </div>
                    )}
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <CalendarIcon className="h-3.5 w-3.5" />
                      <span>{format(new Date(client.expiration_date + 'T12:00:00'), "dd/MM/yyyy")}</span>
                    </div>
                    
                    {/* Plan + Server Badges */}
                    {(client.plan_name || client.server_name || client.server_name_2) && (
                      <div className="flex flex-wrap items-center gap-1.5 pt-1">
                        {client.plan_name && (
                          <span className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full bg-secondary text-secondary-foreground border border-border">
                            <CreditCard className="h-3 w-3" />
                            {client.plan_name}
                            {client.plan_price && !isPrivacyMode && (
                              <span className="text-muted-foreground ml-1">
                                R$ {client.plan_price.toFixed(2)}
                              </span>
                            )}
                          </span>
                        )}
                        {client.server_name && (() => {
                          const server1 = getClientServer(client);
                          const hasPanel = !!server1?.panel_url;
                          const handleServerClick = (e: React.MouseEvent | React.KeyboardEvent) => {
                            e.stopPropagation();
                            if (hasPanel && server1?.panel_url) {
                              window.open(server1.panel_url, '_blank', 'noopener,noreferrer');
                              toast.success(`Abrindo painel: ${client.server_name}`);
                            } else {
                              toast.info(`Servidor "${client.server_name}" não possui link de painel cadastrado`);
                            }
                          };
                          return (
                            <span 
                              role="button"
                              tabIndex={0}
                              className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-primary/10 text-primary border border-primary/20 ${hasPanel ? 'cursor-pointer hover:bg-primary/20 hover:scale-105 active:scale-95' : 'cursor-default opacity-70'} transition-all select-none`}
                              onClick={handleServerClick}
                              onKeyDown={(e) => e.key === 'Enter' && handleServerClick(e)}
                              title={hasPanel ? `Clique para abrir o painel` : 'Sem link de painel cadastrado'}
                            >
                              {server1?.icon_url ? (
                                <img src={server1.icon_url} alt={client.server_name} className="h-4 w-4 rounded-sm object-cover pointer-events-none" />
                              ) : (
                                <Server className="h-3 w-3 pointer-events-none" />
                              )}
                              <span className="pointer-events-none">{client.server_name}</span>
                              {hasPanel && <ExternalLink className="h-3 w-3 opacity-60 pointer-events-none" />}
                            </span>
                          );
                        })()}
                        {client.server_name_2 && (() => {
                          const server2 = getClientServer2(client);
                          const hasPanel = !!server2?.panel_url;
                          const handleServer2Click = (e: React.MouseEvent | React.KeyboardEvent) => {
                            e.stopPropagation();
                            if (hasPanel && server2?.panel_url) {
                              window.open(server2.panel_url, '_blank', 'noopener,noreferrer');
                              toast.success(`Abrindo painel: ${client.server_name_2}`);
                            } else {
                              toast.info(`Servidor "${client.server_name_2}" não possui link de painel cadastrado`);
                            }
                          };
                          return (
                            <span 
                              role="button"
                              tabIndex={0}
                              className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 ${hasPanel ? 'cursor-pointer hover:bg-amber-500/20 hover:scale-105 active:scale-95' : 'cursor-default opacity-70'} transition-all select-none`}
                              onClick={handleServer2Click}
                              onKeyDown={(e) => e.key === 'Enter' && handleServer2Click(e)}
                              title={hasPanel ? `Clique para abrir o painel` : 'Sem link de painel cadastrado'}
                            >
                              {server2?.icon_url ? (
                                <img src={server2.icon_url} alt={client.server_name_2} className="h-4 w-4 rounded-sm object-cover pointer-events-none" />
                              ) : (
                                <Server className="h-3 w-3 pointer-events-none" />
                              )}
                              <span className="pointer-events-none">{client.server_name_2}</span>
                              {hasPanel && <ExternalLink className="h-3 w-3 opacity-60 pointer-events-none" />}
                            </span>
                          );
                        })()}
                        
                        {/* Additional Servers Badges */}
                        {client.additional_servers && Array.isArray(client.additional_servers) && client.additional_servers.length > 0 && (
                          client.additional_servers.map((addServer, index) => {
                            const colorSchemes = [
                              {
                                bg: 'bg-emerald-500/10',
                                text: 'text-emerald-600 dark:text-emerald-400',
                                border: 'border-emerald-500/20',
                                hover: 'hover:bg-emerald-500/20',
                              },
                              {
                                bg: 'bg-violet-500/10',
                                text: 'text-violet-600 dark:text-violet-400',
                                border: 'border-violet-500/20',
                                hover: 'hover:bg-violet-500/20',
                              },
                              {
                                bg: 'bg-pink-500/10',
                                text: 'text-pink-600 dark:text-pink-400',
                                border: 'border-pink-500/20',
                                hover: 'hover:bg-pink-500/20',
                              },
                              {
                                bg: 'bg-blue-500/10',
                                text: 'text-blue-600 dark:text-blue-400',
                                border: 'border-blue-500/20',
                                hover: 'hover:bg-blue-500/20',
                              },
                            ] as const;
                            const scheme = colorSchemes[index % colorSchemes.length];

                            const serverData = serversForBadges.find(s => s.id === addServer.server_id);
                            const hasPanel = !!serverData?.panel_url;
                            const handleAdditionalServerClick = (e: React.MouseEvent | React.KeyboardEvent) => {
                              e.stopPropagation();
                              if (hasPanel && serverData?.panel_url) {
                                window.open(serverData.panel_url, '_blank', 'noopener,noreferrer');
                                toast.success(`Abrindo painel: ${addServer.server_name}`);
                              } else {
                                toast.info(`Servidor "${addServer.server_name}" não possui link de painel cadastrado`);
                              }
                            };
                            return (
                              <span 
                                key={addServer.server_id || index}
                                role="button"
                                tabIndex={0}
                                className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${scheme.bg} ${scheme.text} border ${scheme.border} ${hasPanel ? `cursor-pointer ${scheme.hover} hover:scale-105 active:scale-95` : 'cursor-default opacity-70'} transition-all select-none`}
                                onClick={handleAdditionalServerClick}
                                onKeyDown={(e) => e.key === 'Enter' && handleAdditionalServerClick(e)}
                                title={hasPanel ? `Clique para abrir o painel` : 'Sem link de painel cadastrado'}
                              >
                                {serverData?.icon_url ? (
                                  <img src={serverData.icon_url} alt={addServer.server_name} className="h-4 w-4 rounded-sm object-cover pointer-events-none" />
                                ) : (
                                  <Server className="h-3 w-3 pointer-events-none" />
                                )}
                                <span className="pointer-events-none">{addServer.server_name}</span>
                                {hasPanel && <ExternalLink className="h-3 w-3 opacity-60 pointer-events-none" />}
                              </span>
                            );
                          })
                        )}
                        
                        {/* App do Revendedor Badge */}
                        {client.app_type === 'own' && client.app_name && (
                          <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-violet-500/10 text-violet-600 dark:text-violet-400 border border-violet-500/20">
                            <Smartphone className="h-3 w-3" />
                            {client.app_name}
                          </span>
                        )}
                        
                        {/* Adult Content Badge */}
                        {(client.category === 'IPTV' || client.category === 'P2P') && (
                          <span 
                            className={cn(
                              "inline-flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-full",
                              (client as any).has_adult_content 
                                ? "bg-pink-500/20 text-pink-600 dark:text-pink-400 border border-pink-500/30" 
                                : "bg-slate-500/10 text-slate-500 dark:text-slate-400 border border-slate-500/20"
                            )}
                            title={(client as any).has_adult_content ? "Com conteúdo adulto (+18)" : "Sem conteúdo adulto (-18)"}
                          >
                            {(client as any).has_adult_content ? '+🔞' : '-🔞'}
                          </span>
                        )}
                      </div>
                    )}

                    {/* Login Copy Buttons */}
                    {(client.login || client.login_2 || (Array.isArray(client.additional_servers) && client.additional_servers.some(s => !!s?.login))) && (
                      <div className="flex gap-1.5 mt-2">
                        {client.login && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 px-2.5 text-xs gap-1 border-border hover:bg-muted"
                            onClick={async () => {
                              let loginToCopy = decryptedCredentials[client.id]?.login;
                              if (!loginToCopy && client.login) {
                                try {
                                  const decrypted = await decrypt(client.login);
                                  loginToCopy = decrypted;
                                } catch {
                                  loginToCopy = client.login;
                                }
                              }
                              if (loginToCopy) {
                                navigator.clipboard.writeText(loginToCopy);
                                toast.success(`Login 1 copiado: ${loginToCopy}`);
                              }
                            }}
                            title="Copiar login do servidor 1"
                          >
                            <Copy className="h-3.5 w-3.5" />
                            Login 1
                          </Button>
                        )}
                        {client.login_2 && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 px-2.5 text-xs gap-1 border-amber-500/30 text-amber-600 dark:text-amber-400 hover:bg-amber-500/10"
                            onClick={async () => {
                              let loginToCopy = client.login_2;
                              if (loginToCopy) {
                                try {
                                  const decrypted = await decrypt(loginToCopy);
                                  loginToCopy = decrypted;
                                } catch {
                                  // Use as is if decryption fails
                                }
                                navigator.clipboard.writeText(loginToCopy);
                                toast.success(`Login 2 copiado: ${loginToCopy}`);
                              }
                            }}
                            title="Copiar login do servidor 2"
                          >
                            <Copy className="h-3.5 w-3.5" />
                            Login 2
                          </Button>
                        )}

                        {/* Logins de Servidores Adicionais */}
                        {Array.isArray(client.additional_servers) &&
                          client.additional_servers.map((addServer, index) => {
                            if (!addServer?.login) return null;

                            const colorSchemes = [
                              {
                                border: 'border-emerald-500/30',
                                text: 'text-emerald-600 dark:text-emerald-400',
                                hover: 'hover:bg-emerald-500/10',
                              },
                              {
                                border: 'border-violet-500/30',
                                text: 'text-violet-600 dark:text-violet-400',
                                hover: 'hover:bg-violet-500/10',
                              },
                              {
                                border: 'border-pink-500/30',
                                text: 'text-pink-600 dark:text-pink-400',
                                hover: 'hover:bg-pink-500/10',
                              },
                              {
                                border: 'border-blue-500/30',
                                text: 'text-blue-600 dark:text-blue-400',
                                hover: 'hover:bg-blue-500/10',
                              },
                            ] as const;
                            const scheme = colorSchemes[index % colorSchemes.length];

                            return (
                              <Button
                                key={addServer.server_id || index}
                                variant="outline"
                                size="sm"
                                className={cn('h-8 px-2.5 text-xs gap-1 border-border hover:bg-muted', scheme.border, scheme.text, scheme.hover)}
                                onClick={async () => {
                                  let loginToCopy = addServer.login;
                                  if (loginToCopy) {
                                    try {
                                      const decrypted = await decrypt(loginToCopy);
                                      loginToCopy = decrypted;
                                    } catch {
                                      // use raw
                                    }
                                    navigator.clipboard.writeText(loginToCopy);
                                    toast.success(`Login ${index + 3} copiado: ${loginToCopy}`);
                                  }
                                }}
                                title={`Copiar login do servidor ${index + 3}`}
                              >
                                <Copy className="h-3.5 w-3.5" />
                                Login {index + 3}
                              </Button>
                            );
                          })}
                      </div>
                    )}

                    {/* GerenciaApp Panel Quick Access - Multiple Devices */}
                    {((client.gerencia_app_devices && client.gerencia_app_devices.length > 0) || client.gerencia_app_mac) && gerenciaAppSettings?.panelUrl && (
                      <div className="space-y-2 mt-2">
                        <div className="flex gap-1.5">
                          <Button
                            variant="outline"
                            size="sm"
                            className="flex-1 h-8 text-xs gap-1.5 bg-gradient-to-r from-green-500/10 to-emerald-500/10 border-green-500/30 text-green-600 dark:text-green-400 hover:bg-green-500/20"
                            onClick={() => window.open(gerenciaAppSettings.panelUrl, '_blank')}
                          >
                            <Monitor className="h-3.5 w-3.5" />
                            GerenciaApp
                          </Button>
                        </div>
                        {/* Display multiple MAC devices */}
                        <div className="space-y-1">
                          {client.gerencia_app_devices && client.gerencia_app_devices.length > 0 ? (
                            client.gerencia_app_devices.map((device, idx) => (
                              <div key={idx} className="flex items-center justify-between gap-2 p-1.5 rounded bg-muted/50 text-xs">
                                <div className="flex items-center gap-2 min-w-0">
                                  <Monitor className="h-3 w-3 text-green-500 flex-shrink-0" />
                                  <span className="font-medium truncate">{device.name || `Dispositivo ${idx + 1}`}</span>
                                  <span className="font-mono text-muted-foreground truncate">{device.mac}</span>
                                </div>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 px-2 flex-shrink-0"
                                  onClick={() => {
                                    navigator.clipboard.writeText(device.mac);
                                    toast.success(`MAC copiado: ${device.mac}`);
                                  }}
                                >
                                  <Copy className="h-3 w-3" />
                                </Button>
                              </div>
                            ))
                          ) : client.gerencia_app_mac && (
                            <div className="flex items-center justify-between gap-2 p-1.5 rounded bg-muted/50 text-xs">
                              <div className="flex items-center gap-2">
                                <Monitor className="h-3 w-3 text-green-500" />
                                <span className="font-mono text-muted-foreground">{client.gerencia_app_mac}</span>
                              </div>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 px-2"
                                onClick={() => {
                                  navigator.clipboard.writeText(client.gerencia_app_mac || '');
                                  toast.success(`MAC copiado: ${client.gerencia_app_mac}`);
                                }}
                              >
                                <Copy className="h-3 w-3" />
                              </Button>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Show MAC info if exists but no panel URL configured */}
                    {((client.gerencia_app_devices && client.gerencia_app_devices.length > 0) || client.gerencia_app_mac) && !gerenciaAppSettings?.panelUrl && (
                      <div className="space-y-1 mt-2">
                        {client.gerencia_app_devices && client.gerencia_app_devices.length > 0 ? (
                          client.gerencia_app_devices.map((device, idx) => (
                            <div key={idx} className="flex items-center gap-2 text-muted-foreground">
                              <Monitor className="h-3.5 w-3.5 text-green-500" />
                              <span className="text-xs font-medium">{device.name || `Dispositivo ${idx + 1}`}:</span>
                              <span className="text-xs font-mono">{device.mac}</span>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 px-2 text-xs"
                                onClick={() => {
                                  navigator.clipboard.writeText(device.mac);
                                  toast.success(`MAC copiado: ${device.mac}`);
                                }}
                              >
                                <Copy className="h-3 w-3" />
                              </Button>
                            </div>
                          ))
                        ) : client.gerencia_app_mac && (
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <Monitor className="h-3.5 w-3.5 text-green-500" />
                            <span className="text-xs font-mono">{client.gerencia_app_mac}</span>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 px-2 text-xs"
                              onClick={() => {
                                navigator.clipboard.writeText(client.gerencia_app_mac || '');
                                toast.success(`MAC copiado: ${client.gerencia_app_mac}`);
                              }}
                            >
                              <Copy className="h-3 w-3" />
                            </Button>
                          </div>
                        )}
                      </div>
                    )}

                    {/* External Apps Display */}
                    {user && (
                      <ClientExternalAppsDisplay clientId={client.id} />
                    )}

                    {/* Premium Accounts - Lazy loaded, only shown on click */}
                    {user && (
                      <LazyPremiumAccounts 
                        clientId={client.id} 
                        sellerId={user.id}
                        isPrivacyMode={isPrivacyMode}
                        maskData={maskData}
                      />
                    )}

                    {hasCredentials && !isPrivacyMode && (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Lock className="h-3.5 w-3.5" />
                        <span className="flex-1">
                          {showPassword === client.id && isDecrypted
                            ? isDecrypted.login || '(sem login)'
                            : '••••••'}
                        </span>
                        <button
                          onClick={() => handleShowPassword(client)}
                          className="ml-auto"
                          disabled={isDecrypting}
                        >
                          {isDecrypting ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : showPassword === client.id ? (
                            <EyeOff className="h-3.5 w-3.5" />
                          ) : (
                            <Eye className="h-3.5 w-3.5" />
                          )}
                        </button>
                      </div>
                    )}
                    {hasCredentials && isPrivacyMode && (
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Lock className="h-3.5 w-3.5" />
                        <span>●●●●●● (oculto)</span>
                      </div>
                    )}
                    {showPassword === client.id && isDecrypted && !isPrivacyMode && (
                      <div className="text-xs bg-muted p-2 rounded font-mono space-y-1">
                        {isDecrypted.login && <p>Login: {isDecrypted.login}</p>}
                        {isDecrypted.password && <p>Senha: {isDecrypted.password}</p>}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-1 mt-4 pt-3 border-t border-border">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs"
                      disabled={isRenewing}
                      onClick={() => executeRenewal({
                        clientId: client.id,
                        clientName: client.name,
                        clientPhone: client.phone,
                        clientCategory: client.category,
                        currentExpirationDate: client.expiration_date,
                        durationDays: 2,
                        planName: client.plan_name,
                        planPrice: client.plan_price,
                      })}
                    >
                      +2 dias
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs"
                      disabled={isRenewing}
                      onClick={() => executeRenewal({
                        clientId: client.id,
                        clientName: client.name,
                        clientPhone: client.phone,
                        clientCategory: client.category,
                        currentExpirationDate: client.expiration_date,
                        durationDays: 3,
                        planName: client.plan_name,
                        planPrice: client.plan_price,
                      })}
                    >
                      +3 dias
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => handleRenew(client)}
                    >
                      Renovar
                    </Button>
                    {(client.phone || client.telegram) && (
                      <div className="flex items-center gap-1">
                        <Button
                          variant="outline"
                          size="sm"
                          className={cn(
                            "h-7 text-xs gap-1",
                            isSent(client.id) && "border-success/50 bg-success/10"
                          )}
                          onClick={() => setMessageClient(client)}
                        >
                          {isSent(client.id) ? (
                            <>
                              <CheckCircle className="h-3.5 w-3.5 text-success" />
                              <span className="text-success">Enviado</span>
                            </>
                          ) : (
                            <>
                              <MessageCircle className="h-3.5 w-3.5 text-green-500" />
                              <Send className="h-3.5 w-3.5 text-blue-500" />
                              Mensagem
                            </>
                          )}
                        </Button>
                        {isSent(client.id) && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                            onClick={() => clearSentMark(client.id)}
                            title="Limpar marcação de enviado"
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    )}
                    {/* Show different buttons based on archived status */}
                    {client.is_archived ? (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs gap-1 text-success hover:text-success"
                          onClick={() => restoreMutation.mutate(client.id)}
                        >
                          <RotateCcw className="h-3 w-3" />
                          Restaurar
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs text-destructive hover:text-destructive"
                          onClick={() => {
                            confirm({
                              title: 'Excluir cliente permanentemente',
                              description: `Tem certeza que deseja EXCLUIR PERMANENTEMENTE o cliente "${client.name}"? Esta ação não pode ser desfeita.`,
                              confirmText: 'Excluir',
                              variant: 'destructive',
                              onConfirm: () => deleteMutation.mutate(client.id),
                            });
                          }}
                        >
                          <Trash2 className="h-3 w-3" />
                          Excluir
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => handleEdit(client)}
                        >
                          Editar
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs gap-1 text-warning hover:text-warning"
                          onClick={() => {
                            confirm({
                              title: 'Arquivar cliente',
                              description: `Mover "${client.name}" para a lixeira? Você poderá restaurá-lo depois.`,
                              confirmText: 'Arquivar',
                              variant: 'warning',
                              onConfirm: () => archiveMutation.mutate(client.id),
                            });
                          }}
                          title="Mover para lixeira"
                        >
                          <Archive className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs gap-1 text-destructive hover:text-destructive"
                          onClick={() => {
                            confirm({
                              title: 'Excluir cliente permanentemente',
                              description: `Tem certeza que deseja excluir "${client.name}" permanentemente? Esta ação não pode ser desfeita.`,
                              confirmText: 'Excluir',
                              variant: 'destructive',
                              onConfirm: () => deleteMutation.mutate(client.id),
                            });
                          }}
                          title="Excluir permanentemente"
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
        {/* Pagination Controls - Bottom */}
        <PaginationControls
          currentPage={currentPage}
          totalPages={totalPages}
          totalItems={totalItems}
          startIndex={startIndex}
          endIndex={endIndex}
          onPageChange={goToPage}
          isLoading={isLoading || isFetching}
        />
        
        {/* Load More Button - Database Level Pagination */}
        {hasMoreClients && clients.length < totalClientCount && (
          <div className="flex flex-col items-center gap-2 py-4">
            <p className="text-sm text-muted-foreground">
              Mostrando {clients.length} de {totalClientCount} clientes
            </p>
            <Button
              variant="outline"
              onClick={loadMoreClients}
              disabled={isFetching}
              className="gap-2"
            >
              {isFetching ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Carregando...
                </>
              ) : (
                <>
                  <ChevronDown className="h-4 w-4" />
                  Carregar mais {Math.min(CLIENTS_PER_PAGE, totalClientCount - clients.length)} clientes
                </>
              )}
            </Button>
          </div>
        )}
        
        {/* All clients loaded indicator */}
        {!hasMoreClients && clients.length > CLIENTS_PER_PAGE && (
          <div className="text-center py-3 text-sm text-muted-foreground">
            ✓ Todos os {clients.length} clientes carregados
          </div>
        )}
        </>
      )}

      {/* Send Message Dialog */}
      {messageClient && (
        <SendMessageDialog
          client={messageClient}
          open={!!messageClient}
          onOpenChange={(open) => {
            if (!open) {
              // If bulk messaging, move to next client
              if (isBulkMessaging) {
                const nextIndex = bulkMessageIndex + 1;
                if (nextIndex < bulkMessageQueue.length) {
                  setBulkMessageIndex(nextIndex);
                  setMessageClient(bulkMessageQueue[nextIndex]);
                } else {
                  // Bulk messaging complete
                  setBulkMessageQueue([]);
                  setBulkMessageIndex(0);
                  setMessageClient(null);
                  toast.success('Envio em massa concluído!');
                }
              } else {
                setMessageClient(null);
              }
            }
          }}
          onMessageSent={() => {
            // If bulk messaging, automatically open next after small delay
            if (isBulkMessaging) {
              const nextIndex = bulkMessageIndex + 1;
              if (nextIndex < bulkMessageQueue.length) {
                setTimeout(() => {
                  setBulkMessageIndex(nextIndex);
                  setMessageClient(bulkMessageQueue[nextIndex]);
                }, 500);
              } else {
                // Bulk messaging complete
                setTimeout(() => {
                  setBulkMessageQueue([]);
                  setBulkMessageIndex(0);
                  setMessageClient(null);
                  toast.success('Envio em massa concluído!');
                }, 500);
              }
            }
          }}
        />
      )}

      {/* Renew Dialog */}
      <Dialog open={!!renewClientId} onOpenChange={(open) => {
        if (!open) {
          setRenewClientId(null);
          setRenewCustomDate(undefined);
          setRenewUseCustomDate(false);
          setRenewExpirationPopoverOpen(false);
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Renovar Cliente</DialogTitle>
            <DialogDescription>
              Renovar {renewClient?.name}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Plano</Label>
              <PlanSelector
                plans={plans}
                value={renewPlanId}
                onValueChange={(val) => {
                  setRenewPlanId(val);
                  // Reset custom date when plan changes
                  if (!renewUseCustomDate) {
                    setRenewCustomDate(undefined);
                  }
                }}
                placeholder="Selecione o plano"
                showFilters={true}
                defaultCategory={renewClient?.category}
              />
              {!renewUseCustomDate && (
                <p className="text-xs text-muted-foreground">
                  {renewPlanId ? 
                    `Será adicionado ${plans.find(p => p.id === renewPlanId)?.duration_days || 30} dias ao vencimento` :
                    'Selecione um plano para renovar'
                  }
                </p>
              )}
            </div>
            
            {/* Custom Date Option */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="use-custom-date"
                  checked={renewUseCustomDate}
                  onCheckedChange={(checked) => {
                    setRenewUseCustomDate(checked === true);
                    if (!checked) {
                      setRenewCustomDate(undefined);
                    }
                  }}
                />
                <Label htmlFor="use-custom-date" className="text-sm font-normal cursor-pointer">
                  Escolher data personalizada
                </Label>
              </div>
              
              {renewUseCustomDate && (
                <Popover open={renewExpirationPopoverOpen} onOpenChange={setRenewExpirationPopoverOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !renewCustomDate && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {renewCustomDate ? format(renewCustomDate, "dd/MM/yyyy", { locale: ptBR }) : "Selecione a data de vencimento"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0 pointer-events-auto" align="start">
                    <CalendarPicker
                      mode="single"
                      selected={renewCustomDate}
                      onSelect={(date) => {
                        setRenewCustomDate(date);
                        setRenewExpirationPopoverOpen(false);
                      }}
                      disabled={(date) => isBefore(date, startOfToday())}
                      initialFocus
                      className="pointer-events-auto"
                    />
                  </PopoverContent>
                </Popover>
              )}
            </div>
            
            <div className="p-3 bg-muted rounded-lg text-sm">
              <p><strong>Vencimento atual:</strong> {renewClient?.expiration_date ? format(new Date(renewClient.expiration_date + 'T12:00:00'), "dd/MM/yyyy", { locale: ptBR }) : '-'}</p>
              {renewUseCustomDate && renewCustomDate ? (
                <p className="text-success mt-1">
                  <strong>Novo vencimento:</strong> {format(renewCustomDate, "dd/MM/yyyy", { locale: ptBR })}
                </p>
              ) : renewPlanId && renewClient && (
                <p className="text-success mt-1">
                  <strong>Novo vencimento:</strong> {
                    format(
                      addDays(
                        isAfter(new Date(renewClient.expiration_date + 'T12:00:00'), new Date()) 
                          ? new Date(renewClient.expiration_date + 'T12:00:00') 
                          : new Date(), 
                        plans.find(p => p.id === renewPlanId)?.duration_days || 30
                      ), 
                      "dd/MM/yyyy", 
                      { locale: ptBR }
                    )
                  }
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setRenewClientId(null);
              setRenewCustomDate(undefined);
              setRenewUseCustomDate(false);
              setRenewExpirationPopoverOpen(false);
            }} disabled={isRenewing}>
              Cancelar
            </Button>
            <Button 
              onClick={confirmRenew} 
              disabled={(!renewPlanId && !renewUseCustomDate) || (renewUseCustomDate && !renewCustomDate) || isRenewing || isRenewalPending}
            >
              {isRenewing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Renovando...
                </>
              ) : (
                'Renovar'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete All Confirmation Dialog */}
      <Dialog open={showDeleteAllConfirm} onOpenChange={(open) => {
        setShowDeleteAllConfirm(open);
        if (!open) setDeleteConfirmText('');
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-destructive">Remover Todos os Clientes</DialogTitle>
            <DialogDescription>
              Esta ação é <strong>irreversível</strong>. Todos os {clients.length} cliente(s) serão excluídos permanentemente.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-sm">
              <p className="text-destructive font-medium">⚠️ Atenção!</p>
              <p className="text-muted-foreground mt-1">
                Você está prestes a excluir <strong>{clients.length}</strong> cliente(s). 
                Esta ação não pode ser desfeita.
              </p>
            </div>
            <div className="space-y-2">
              <Label>
                Digite <strong className="text-destructive">CONFIRMAR</strong> para prosseguir:
              </Label>
              <Input
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                placeholder="CONFIRMAR"
                className="font-mono"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setShowDeleteAllConfirm(false);
              setDeleteConfirmText('');
            }}>
              Cancelar
            </Button>
            <Button 
              variant="destructive" 
              onClick={() => deleteAllMutation.mutate()}
              disabled={deleteConfirmText !== 'CONFIRMAR' || deleteAllMutation.isPending}
            >
              {deleteAllMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Trash2 className="h-4 w-4 mr-2" />
              )}
              Excluir Todos
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Welcome Message Preview Dialog */}
      <WelcomeMessagePreview
        open={showWelcomePreview}
        onOpenChange={(open) => {
          setShowWelcomePreview(open);
          if (!open) {
            setPendingClientData(null);
          }
        }}
        formData={{
          name: formData.name,
          phone: formData.phone,
          login: formData.login,
          password: formData.password,
          expiration_date: formData.expiration_date,
          plan_name: formData.plan_name,
          plan_price: formData.plan_price,
          server_name: formData.server_name,
          category: formData.category,
          device: formData.device,
          gerencia_app_mac: formData.gerencia_app_mac,
          gerencia_app_devices: formData.gerencia_app_devices,
        }}
        onConfirm={handleWelcomeConfirm}
        isLoading={createMutation.isPending}
      />

      {/* Consulta 360° Dialog */}
      <Dialog open={showLookupDialog} onOpenChange={(open) => {
        if (!open) {
          closeLookupDialog();
        } else {
          setShowLookupDialog(true);
        }
      }}>
        <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserSearch className="h-5 w-5 text-primary" />
              Consulta 360° - Visão Completa do Cliente
            </DialogTitle>
            <DialogDescription>
              Pesquise e veja todas as informações do cliente em um único lugar
            </DialogDescription>
          </DialogHeader>
          
          <div className="flex-1 overflow-y-auto space-y-4">
            {/* Search Input */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome, telefone, email ou login..."
                value={lookupSearchQuery}
                onChange={(e) => {
                  setLookupSearchQuery(e.target.value);
                  goBackToLookupSearch();
                }}
                className="pl-10"
              />
            </div>
            
            {/* Search Results - Grouped by Phone */}
            {lookupSearchQuery.length >= 2 && !selectedLookupPhone && !selectedLookupClientId && (
              <div className="border rounded-lg divide-y max-h-[250px] overflow-y-auto">
                {isLookupSearching ? (
                  <div className="p-4 flex items-center justify-center">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : lookupGroupedResults.length === 0 ? (
                  <div className="p-4 text-center text-muted-foreground">
                    Nenhum cliente encontrado
                  </div>
                ) : (
                  lookupGroupedResults.map((group) => {
                    const mainClient = group.clients[0]; // Most recent client in the group
                    const hasMultiple = group.clients.length > 1;
                    const badge = getLookupStatusBadge(mainClient.expiration_date);
                    
                    return (
                      <button
                        key={group.normalizedPhone || mainClient.id}
                        className="w-full p-3 text-left hover:bg-muted/50 transition-colors"
                        onClick={() => {
                          if (group.normalizedPhone) {
                            selectLookupPhone(group.normalizedPhone);
                          } else {
                            // Client without phone - use legacy single selection
                            selectLookupClient(mainClient.id);
                          }
                        }}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="font-medium truncate">{mainClient.name}</p>
                              {hasMultiple && (
                                <Badge variant="secondary" className="text-xs">
                                  {group.clients.length} registros
                                </Badge>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {group.phone || mainClient.email || mainClient.login || 'Sem contato'}
                            </p>
                            {hasMultiple && (
                              <p className="text-xs text-muted-foreground/70 mt-1">
                                Planos: {group.clients.map(c => c.plan_name || 'N/A').join(', ')}
                              </p>
                            )}
                          </div>
                          <Badge className={badge.class}>{badge.text}</Badge>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            )}
            
            {/* Consolidated View - All clients for selected phone */}
            {selectedLookupPhone && (
              <div className="space-y-4">
                {/* Back button */}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => goBackToLookupSearch()}
                  className="mb-2"
                >
                  ← Voltar aos resultados
                </Button>

                {isLoadingLookupPhoneClients ? (
                  <div className="p-8 flex items-center justify-center">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : lookupPhoneClients.length > 0 ? (
                  <>
                    {/* Client Header - Using first (most recent) client info */}
                    <div className="flex items-center justify-between bg-muted/30 rounded-lg p-4">
                      <div>
                        <h3 className="text-lg font-semibold flex items-center gap-2">
                          <User className="h-5 w-5 text-primary" />
                          {lookupPhoneClients[0].name}
                        </h3>
                        <div className="flex gap-2 mt-1 flex-wrap">
                          <Badge variant="outline" className="text-xs">
                            <Phone className="h-3 w-3 mr-1" />
                            {lookupPhoneClients[0].phone}
                          </Badge>
                          <Badge variant="secondary" className="text-xs">
                            {lookupPhoneClients.length} {lookupPhoneClients.length === 1 ? 'registro' : 'registros'}
                          </Badge>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowLookupPasswords(!showLookupPasswords)}
                      >
                        {showLookupPasswords ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        <span className="ml-1">{showLookupPasswords ? 'Ocultar' : 'Mostrar'} senhas</span>
                      </Button>
                    </div>

                    {/* Contact Info (shared) */}
                    <Card>
                      <CardContent className="p-4 space-y-2">
                        <h4 className="font-medium flex items-center gap-2 text-sm text-muted-foreground">
                          <Phone className="h-4 w-4" /> Contato
                        </h4>
                        {lookupPhoneClients[0].phone && (
                          <div className="flex items-center justify-between">
                            <span className="text-sm">{lookupPhoneClients[0].phone}</span>
                            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => copyToClipboard(lookupPhoneClients[0].phone!, 'Telefone')}>
                              <Copy className="h-3 w-3" />
                            </Button>
                          </div>
                        )}
                        {lookupPhoneClients[0].email && (
                          <div className="flex items-center justify-between">
                            <span className="text-sm">{lookupPhoneClients[0].email}</span>
                            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => copyToClipboard(lookupPhoneClients[0].email!, 'Email')}>
                              <Copy className="h-3 w-3" />
                            </Button>
                          </div>
                        )}
                        {lookupPhoneClients[0].telegram && (
                          <div className="flex items-center justify-between">
                            <span className="text-sm">@{lookupPhoneClients[0].telegram}</span>
                          </div>
                        )}
                      </CardContent>
                    </Card>

                    {/* Historical Plans/Records */}
                    <Card>
                      <CardContent className="p-4">
                        <h4 className="font-medium flex items-center gap-2 text-sm text-muted-foreground mb-3">
                          <History className="h-4 w-4" /> Histórico de Planos ({lookupPhoneClients.length})
                        </h4>
                        <div className="space-y-3 max-h-[300px] overflow-y-auto">
                          {lookupPhoneClients.map((client: any, idx: number) => {
                            const statusBadge = getLookupStatusBadge(client.expiration_date);
                            return (
                              <div key={client.id} className={cn(
                                "p-3 rounded-lg border",
                                idx === 0 ? "bg-primary/5 border-primary/20" : "bg-muted/30"
                              )}>
                                <div className="flex items-start justify-between mb-2">
                                  <div className="flex items-center gap-2">
                                    {idx === 0 && (
                                      <Badge variant="default" className="text-xs">Atual</Badge>
                                    )}
                                    <Badge className={statusBadge.class}>{statusBadge.text}</Badge>
                                    {client.is_archived && (
                                      <Badge variant="outline" className="text-xs border-warning text-warning">Arquivado</Badge>
                                    )}
                                  </div>
                                  <span className="text-xs text-muted-foreground">
                                    Vence: {format(new Date(client.expiration_date + 'T12:00:00'), "dd/MM/yyyy", { locale: ptBR })}
                                  </span>
                                </div>
                                
                                <div className="grid grid-cols-2 gap-2 text-sm">
                                  <div>
                                    <span className="text-muted-foreground text-xs">Plano:</span>
                                    <p className="font-medium">{client.plan_name || 'N/A'}</p>
                                  </div>
                                  <div>
                                    <span className="text-muted-foreground text-xs">Valor:</span>
                                    <p>R$ {(client.plan_price || 0).toFixed(2)}</p>
                                  </div>
                                  <div>
                                    <span className="text-muted-foreground text-xs">Servidor:</span>
                                    <p>{client.server_name || 'N/A'}</p>
                                  </div>
                                  <div>
                                    <span className="text-muted-foreground text-xs">Categoria:</span>
                                    <p>{client.category || 'N/A'}</p>
                                  </div>
                                </div>

                                {/* Credentials for this record - using decrypted values */}
                                {(client.login || client.password) && (() => {
                                  const decrypted = lookupPhoneDecryptedCreds[client.id] as { login?: string; password?: string } | undefined;
                                  const displayLogin = decrypted?.login || client.login || '-';
                                  const displayPassword = decrypted?.password || client.password || '-';
                                  return (
                                    <div className="mt-2 pt-2 border-t border-border/50">
                                      <div className="flex items-center gap-2 text-xs flex-wrap">
                                        <Lock className="h-3 w-3 text-muted-foreground" />
                                        <span className="text-muted-foreground">Login:</span>
                                        <span>{showLookupPasswords ? displayLogin : '••••••'}</span>
                                        {displayLogin !== '-' && showLookupPasswords && (
                                          <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => copyToClipboard(displayLogin, 'Login')}>
                                            <Copy className="h-3 w-3" />
                                          </Button>
                                        )}
                                        <span className="text-muted-foreground ml-2">Senha:</span>
                                        <span>{showLookupPasswords ? displayPassword : '••••••'}</span>
                                        {displayPassword !== '-' && showLookupPasswords && (
                                          <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => copyToClipboard(displayPassword, 'Senha')}>
                                            <Copy className="h-3 w-3" />
                                          </Button>
                                        )}
                                      </div>
                                    </div>
                                  );
                                })()}

                                {/* GerenciaApp MACs */}
                                {client.gerencia_app_mac && (
                                  <div className="mt-2 pt-2 border-t border-border/50">
                                    <div className="flex items-center gap-2 text-xs">
                                      <Tv className="h-3 w-3 text-muted-foreground" />
                                      <span className="text-muted-foreground">MAC GerenciaApp:</span>
                                      <span className="font-mono">{showLookupPasswords ? client.gerencia_app_mac : '••••••••••••'}</span>
                                      {showLookupPasswords && (
                                        <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => copyToClipboard(client.gerencia_app_mac, 'MAC')}>
                                          <Copy className="h-3 w-3" />
                                        </Button>
                                      )}
                                    </div>
                                  </div>
                                )}

                                {/* Device Apps (GerenciaApp devices) */}
                                {client.gerencia_app_devices && Array.isArray(client.gerencia_app_devices) && client.gerencia_app_devices.length > 0 && (
                                  <div className="mt-2 pt-2 border-t border-border/50">
                                    <p className="text-xs text-muted-foreground flex items-center gap-1 mb-1">
                                      <Monitor className="h-3 w-3" />
                                      Dispositivos ({client.gerencia_app_devices.length}):
                                    </p>
                                    <div className="flex flex-wrap gap-1">
                                      {client.gerencia_app_devices.map((dev: any, i: number) => (
                                        <Badge key={i} variant="outline" className="text-xs font-mono">
                                          {dev.name}: {showLookupPasswords ? dev.mac : '••••••'}
                                        </Badge>
                                      ))}
                                    </div>
                                  </div>
                                )}

                                {/* External Apps for this record */}
                                {client.external_apps && client.external_apps.length > 0 && (
                                  <div className="mt-2 pt-2 border-t border-border/50">
                                    <p className="text-xs text-muted-foreground flex items-center gap-1 mb-1">
                                      <AppWindow className="h-3 w-3" />
                                      Apps Externos ({client.external_apps.length}):
                                    </p>
                                    <div className="space-y-1">
                                      {client.external_apps.map((app: any, i: number) => (
                                        <div key={i} className="text-xs flex items-center gap-2 flex-wrap">
                                          <Badge variant="secondary" className="text-xs">{app.fixed_app_name || app.external_app?.name || 'App'}</Badge>
                                          {app.email && showLookupPasswords && (
                                            <span className="text-muted-foreground">{app.email}</span>
                                          )}
                                          {app.expiration_date && (
                                            <span className="text-muted-foreground">Vence: {format(new Date(app.expiration_date), 'dd/MM/yy')}</span>
                                          )}
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}

                                {/* Reseller Device Apps */}
                                {client.device_apps && client.device_apps.length > 0 && (
                                  <div className="mt-2 pt-2 border-t border-border/50">
                                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                                      <Smartphone className="h-3 w-3" />
                                      Apps Instalados: {client.device_apps.map((da: any) => da.app?.name || 'App').join(', ')}
                                    </p>
                                  </div>
                                )}

                                {/* Server Partner Apps Credentials */}
                                {client.server_app_credentials && client.server_app_credentials.length > 0 && (
                                  <div className="mt-2 pt-2 border-t border-border/50">
                                    <p className="text-xs text-muted-foreground flex items-center gap-1 mb-1">
                                      <Package className="h-3 w-3" />
                                      Apps Parceiros ({client.server_app_credentials.length}):
                                    </p>
                                    <div className="space-y-1">
                                      {client.server_app_credentials.map((cred: any, i: number) => (
                                        <div key={i} className="text-xs flex items-center gap-2 flex-wrap">
                                          <Badge variant="outline" className="text-xs">{cred.server_app?.name || 'App Parceiro'}</Badge>
                                          {cred.auth_code && showLookupPasswords && (
                                            <>
                                              <span className="text-muted-foreground">Código:</span>
                                              <span className="font-mono">{cred.auth_code}</span>
                                              <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => copyToClipboard(cred.auth_code, 'Código')}>
                                                <Copy className="h-3 w-3" />
                                              </Button>
                                            </>
                                          )}
                                          {cred.username && showLookupPasswords && (
                                            <>
                                              <span className="text-muted-foreground">Usuário:</span>
                                              <span>{cred.username}</span>
                                            </>
                                          )}
                                          {cred.provider && (
                                            <span className="text-muted-foreground italic">{cred.provider}</span>
                                          )}
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}

                                {/* Premium Accounts */}
                                {client.premium_accounts && client.premium_accounts.length > 0 && (
                                  <div className="mt-2 pt-2 border-t border-border/50">
                                    <p className="text-xs text-muted-foreground flex items-center gap-1 mb-1">
                                      <Sparkles className="h-3 w-3 text-amber-500" />
                                      Contas Premium ({client.premium_accounts.length}):
                                    </p>
                                    <div className="space-y-1">
                                      {client.premium_accounts.map((acc: any, i: number) => (
                                        <div key={i} className="text-xs flex items-center gap-2 flex-wrap">
                                          <Badge variant="secondary" className="text-xs bg-amber-500/10 text-amber-600">{acc.plan_name}</Badge>
                                          {acc.email && showLookupPasswords && (
                                            <span className="text-muted-foreground">{acc.email}</span>
                                          )}
                                          {acc.price && (
                                            <span className="font-medium">R$ {parseFloat(acc.price).toFixed(2)}</span>
                                          )}
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </CardContent>
                    </Card>
                  </>
                ) : (
                  <div className="p-8 text-center text-muted-foreground">
                    Nenhum registro encontrado para este número
                  </div>
                )}
              </div>
            )}
            
            {/* Client Full Data - Legacy single client view (for clients without phone) */}
            {selectedLookupClientId && !selectedLookupPhone && (
              <div className="space-y-4">
                {/* Back button */}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => goBackToLookupSearch()}
                  className="mb-2"
                >
                  ← Voltar aos resultados
                </Button>

                {isLoadingLookupClient ? (
                  <div className="p-8 flex items-center justify-center">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : lookupClientData ? (
                  <>
                    {/* Client Header */}
                    <div className="flex items-center justify-between bg-muted/30 rounded-lg p-4">
                      <div>
                        <h3 className="text-lg font-semibold flex items-center gap-2">
                          <User className="h-5 w-5 text-primary" />
                          {lookupClientData.name}
                        </h3>
                        <div className="flex gap-2 mt-1">
                          <Badge className={getLookupStatusBadge(lookupClientData.expiration_date).class}>
                            {getLookupStatusBadge(lookupClientData.expiration_date).text}
                          </Badge>
                          {lookupClientData.category && (
                            <Badge variant="secondary">{lookupClientData.category}</Badge>
                          )}
                          {lookupClientData.is_archived && (
                            <Badge variant="outline" className="border-warning text-warning">Arquivado</Badge>
                          )}
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowLookupPasswords(!showLookupPasswords)}
                      >
                        {showLookupPasswords ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        <span className="ml-1">{showLookupPasswords ? 'Ocultar' : 'Mostrar'} senhas</span>
                      </Button>
                    </div>
                    
                    {/* Info Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Contact Info */}
                      <Card>
                        <CardContent className="p-4 space-y-2">
                          <h4 className="font-medium flex items-center gap-2 text-sm text-muted-foreground">
                            <Phone className="h-4 w-4" /> Contato
                          </h4>
                          {lookupClientData.phone && (
                            <div className="flex items-center justify-between">
                              <span className="text-sm">{lookupClientData.phone}</span>
                              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => copyToClipboard(lookupClientData.phone!, 'Telefone')}>
                                <Copy className="h-3 w-3" />
                              </Button>
                            </div>
                          )}
                          {lookupClientData.email && (
                            <div className="flex items-center justify-between">
                              <span className="text-sm">{lookupClientData.email}</span>
                              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => copyToClipboard(lookupClientData.email!, 'Email')}>
                                <Copy className="h-3 w-3" />
                              </Button>
                            </div>
                          )}
                          {lookupClientData.telegram && (
                            <div className="flex items-center justify-between">
                              <span className="text-sm">@{lookupClientData.telegram}</span>
                            </div>
                          )}
                          {!lookupClientData.phone && !lookupClientData.email && !lookupClientData.telegram && (
                            <p className="text-sm text-muted-foreground">Nenhum contato cadastrado</p>
                          )}
                        </CardContent>
                      </Card>
                      
                      {/* Credentials */}
                      <Card>
                        <CardContent className="p-4 space-y-2">
                          <h4 className="font-medium flex items-center gap-2 text-sm text-muted-foreground">
                            <Lock className="h-4 w-4" /> Credenciais
                          </h4>
                          {lookupClientData.login && (
                            <div className="flex items-center justify-between">
                              <span className="text-sm">
                                Login:{' '}
                                {isPrivacyMode
                                  ? '●●●●●●●●'
                                  : (lookupDecryptedCredentials?.login ?? 'Descriptografando...')}
                              </span>
                              {!isPrivacyMode && lookupDecryptedCredentials?.login && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6"
                                  onClick={() => copyToClipboard(lookupDecryptedCredentials.login, 'Login')}
                                >
                                  <Copy className="h-3 w-3" />
                                </Button>
                              )}
                            </div>
                          )}

                          {lookupClientData.password && (
                            <div className="flex items-center justify-between">
                              <span className="text-sm">
                                Senha:{' '}
                                {isPrivacyMode
                                  ? '●●●●●●●●'
                                  : (showLookupPasswords
                                      ? (lookupDecryptedCredentials?.password ?? 'Descriptografando...')
                                      : '••••••')}
                              </span>
                              {!isPrivacyMode && showLookupPasswords && lookupDecryptedCredentials?.password && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6"
                                  onClick={() => copyToClipboard(lookupDecryptedCredentials.password, 'Senha')}
                                >
                                  <Copy className="h-3 w-3" />
                                </Button>
                              )}
                            </div>
                          )}

                          {lookupClientData.login_2 && (
                            <div className="flex items-center justify-between">
                              <span className="text-sm">
                                Login 2:{' '}
                                {isPrivacyMode
                                  ? '●●●●●●●●'
                                  : (lookupDecryptedCredentials?.login_2 ?? 'Descriptografando...')}
                              </span>
                              {!isPrivacyMode && lookupDecryptedCredentials?.login_2 && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6"
                                  onClick={() => copyToClipboard(lookupDecryptedCredentials.login_2!, 'Login 2')}
                                >
                                  <Copy className="h-3 w-3" />
                                </Button>
                              )}
                            </div>
                          )}

                          {lookupClientData.password_2 && (
                            <div className="flex items-center justify-between">
                              <span className="text-sm">
                                Senha 2:{' '}
                                {isPrivacyMode
                                  ? '●●●●●●●●'
                                  : (showLookupPasswords
                                      ? (lookupDecryptedCredentials?.password_2 ?? 'Descriptografando...')
                                      : '••••••')}
                              </span>
                              {!isPrivacyMode && showLookupPasswords && lookupDecryptedCredentials?.password_2 && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6"
                                  onClick={() => copyToClipboard(lookupDecryptedCredentials.password_2!, 'Senha 2')}
                                >
                                  <Copy className="h-3 w-3" />
                                </Button>
                              )}
                            </div>
                          )}

                          {lookupClientData.dns && (
                            <div className="flex items-center justify-between">
                              <span className="text-sm">DNS: {lookupClientData.dns}</span>
                              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => copyToClipboard(lookupClientData.dns!, 'DNS')}>
                                <Copy className="h-3 w-3" />
                              </Button>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                      
                      {/* Plan & Service */}
                      <Card>
                        <CardContent className="p-4 space-y-2">
                          <h4 className="font-medium flex items-center gap-2 text-sm text-muted-foreground">
                            <Package className="h-4 w-4" /> Plano & Serviço
                          </h4>
                          <p className="text-sm"><strong>Plano:</strong> {lookupClientData.plan_name || 'Não definido'}</p>
                          <p className="text-sm"><strong>Valor:</strong> R$ {(lookupClientData.plan_price || 0).toFixed(2)}</p>
                          <p className="text-sm"><strong>Vencimento:</strong> {format(new Date(lookupClientData.expiration_date), "dd/MM/yyyy", { locale: ptBR })}</p>
                          <p className="text-sm"><strong>Servidor:</strong> {lookupClientData.server_name || 'Não definido'}</p>
                        </CardContent>
                      </Card>
                      
                      {/* Device */}
                      <Card>
                        <CardContent className="p-4 space-y-2">
                          <h4 className="font-medium flex items-center gap-2 text-sm text-muted-foreground">
                            <Smartphone className="h-4 w-4" /> Dispositivo
                          </h4>
                          <p className="text-sm"><strong>Tipo:</strong> {lookupClientData.device || 'Não definido'}</p>
                          {lookupClientData.device_model && (
                            <p className="text-sm"><strong>Modelo:</strong> {lookupClientData.device_model}</p>
                          )}
                          {lookupClientData.app_name && (
                            <p className="text-sm"><strong>App:</strong> {lookupClientData.app_name}</p>
                          )}
                        </CardContent>
                      </Card>
                    </div>
                    
                    {/* External Apps */}
                    {lookupClientData.external_apps && lookupClientData.external_apps.length > 0 && (
                      <Card>
                        <CardContent className="p-4">
                          <h4 className="font-medium flex items-center gap-2 text-sm text-muted-foreground mb-3">
                            <AppWindow className="h-4 w-4" /> Apps Pagos ({lookupClientData.external_apps.length})
                          </h4>
                          <div className="space-y-2">
                            {lookupClientData.external_apps.map((app: any) => (
                              <div key={app.id} className="flex items-center justify-between p-2 bg-muted/30 rounded">
                                <div>
                                  <p className="text-sm font-medium">{app.fixed_app_name || app.external_app?.name || 'App'}</p>
                                  {app.expiration_date && (
                                    <p className="text-xs text-muted-foreground">
                                      Vence: {format(new Date(app.expiration_date), "dd/MM/yyyy", { locale: ptBR })}
                                    </p>
                                  )}
                                </div>
                                {app.email && showLookupPasswords && (
                                  <span className="text-xs">{app.email}</span>
                                )}
                              </div>
                            ))}
                          </div>
                        </CardContent>
                      </Card>
                    )}
                    
                    {/* Message History */}
                    {lookupClientData.message_history && lookupClientData.message_history.length > 0 && (
                      <Card>
                        <CardContent className="p-4">
                          <h4 className="font-medium flex items-center gap-2 text-sm text-muted-foreground mb-3">
                            <History className="h-4 w-4" /> Histórico de Mensagens ({lookupClientData.message_history.length})
                          </h4>
                          <div className="space-y-2 max-h-[200px] overflow-y-auto">
                            {lookupClientData.message_history.map((msg: any) => (
                              <div key={msg.id} className="p-2 bg-muted/30 rounded text-sm">
                                <div className="flex justify-between text-xs text-muted-foreground mb-1">
                                  <span>{msg.message_type}</span>
                                  {msg.sent_at && <span>{format(new Date(msg.sent_at), "dd/MM HH:mm", { locale: ptBR })}</span>}
                                </div>
                                <p className="line-clamp-2">{msg.message_content}</p>
                              </div>
                            ))}
                          </div>
                        </CardContent>
                      </Card>
                    )}
                    
                    {/* Notes */}
                    {lookupClientData.notes && (
                      <Card>
                        <CardContent className="p-4">
                          <h4 className="font-medium flex items-center gap-2 text-sm text-muted-foreground mb-2">
                            <Shield className="h-4 w-4" /> Observações
                          </h4>
                          <p className="text-sm whitespace-pre-wrap">{lookupClientData.notes}</p>
                        </CardContent>
                      </Card>
                    )}
                  </>
                ) : null}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Global Confirm Dialog */}
      <ConfirmDialog {...dialogProps} />

      {/* Bulk Server Migration Dialog */}
      {serverFilter !== 'all' && user?.id && (
        <BulkServerMigration
          open={showMigrationDialog}
          onOpenChange={setShowMigrationDialog}
          sourceServerId={serverFilter}
          sourceServerName={serversForBadges.find(s => s.id === serverFilter)?.name || ''}
          servers={serversForBadges}
          clientsToMigrate={clients.filter(c => c.server_id === serverFilter).map(c => ({ id: c.id, name: c.name }))}
          userId={user.id}
        />
      )}
    </div>
  );
}
