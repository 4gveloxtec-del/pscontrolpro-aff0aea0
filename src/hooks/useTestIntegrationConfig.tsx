import { useState, useEffect, useMemo, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

export interface TestApi {
  id: string;
  name: string;
  api_url: string;
  is_active: boolean;
}

export interface ServerData {
  id: string;
  name: string;
  dns?: string;
  is_active: boolean;
}

export interface TestIntegrationConfigData {
  id: string;
  seller_id: string;
  api_id: string | null;
  server_id: string | null;
  server_name: string | null;
  map_login_path: string;
  map_password_path: string;
  map_dns_path: string;
  map_expiration_path: string;
  category: string;
  client_name_prefix: string;
  test_counter: number;
  auto_create_client: boolean;
  send_welcome_message: boolean;
  detect_renewal_enabled: boolean;
  detect_renewal_keywords: string[] | null;
  logs_enabled: boolean;
  is_active: boolean;
  default_duration_hours: number;
  post_endpoint: string | null;
  get_endpoint: string | null;
  api_key: string | null;
}

export interface TestConfigFormData {
  server_id: string;
  category: string;
  client_name_prefix: string;
  map_login_path: string;
  map_password_path: string;
  map_dns_path: string;
  map_expiration_path: string;
  auto_create_client: boolean;
  send_welcome_message: boolean;
  detect_renewal_enabled: boolean;
  detect_renewal_keywords: string;
  logs_enabled: boolean;
  default_duration_hours: number;
  post_endpoint: string;
  get_endpoint: string;
  api_key: string;
}

const DEFAULT_FORM_DATA: TestConfigFormData = {
  server_id: '',
  category: 'IPTV',
  client_name_prefix: 'Teste',
  map_login_path: 'username',
  map_password_path: 'password',
  map_dns_path: 'dns',
  map_expiration_path: 'expiresAtFormatted',
  auto_create_client: true,
  send_welcome_message: false,
  detect_renewal_enabled: true,
  detect_renewal_keywords: 'renovado,renovação,renovacao,renewed,prorrogado,estendido',
  logs_enabled: true,
  default_duration_hours: 2,
  post_endpoint: '',
  get_endpoint: '',
  api_key: '',
};

export function useTestIntegrationConfig() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [selectedApiId, setSelectedApiId] = useState<string>('');
  const [formData, setFormData] = useState<TestConfigFormData>(DEFAULT_FORM_DATA);

  // Fetch APIs
  const { data: apis = [], isLoading: apisLoading } = useQuery({
    queryKey: ['test-apis', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('test_apis')
        .select('id, name, api_url, is_active')
        .eq('owner_id', user!.id)
        .eq('is_active', true)
        .order('name');
      if (error) throw error;
      return data as TestApi[];
    },
    enabled: !!user?.id,
  });

  // Fetch Servers
  const { data: servers = [], isLoading: serversLoading } = useQuery({
    queryKey: ['servers', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('servers')
        .select('id, name, is_active')
        .eq('seller_id', user!.id)
        .eq('is_active', true)
        .order('name');
      if (error) throw error;
      return (data || []).map(s => ({ ...s, dns: undefined })) as ServerData[];
    },
    enabled: !!user?.id,
  });

  // Fetch config for selected API
  const { 
    data: config, 
    isLoading: configLoading, 
    refetch: refetchConfig 
  } = useQuery({
    queryKey: ['test-integration-config', user?.id, selectedApiId],
    queryFn: async () => {
      if (!selectedApiId) return null;
      
      const { data, error } = await supabase
        .from('test_integration_config')
        .select('*')
        .eq('seller_id', user!.id)
        .eq('api_id', selectedApiId)
        .maybeSingle();
      
      if (error) throw error;
      return data as TestIntegrationConfigData | null;
    },
    enabled: !!user?.id && !!selectedApiId,
  });

  // Sync form data with config
  useEffect(() => {
    if (!selectedApiId) {
      setFormData(DEFAULT_FORM_DATA);
      return;
    }
    
    if (configLoading) return;
    
    if (config) {
      setFormData({
        server_id: config.server_id || '',
        category: config.category || 'IPTV',
        client_name_prefix: config.client_name_prefix || 'Teste',
        map_login_path: config.map_login_path || 'username',
        map_password_path: config.map_password_path || 'password',
        map_dns_path: config.map_dns_path || 'dns',
        map_expiration_path: config.map_expiration_path || 'expiresAtFormatted',
        auto_create_client: config.auto_create_client ?? true,
        send_welcome_message: config.send_welcome_message ?? false,
        detect_renewal_enabled: config.detect_renewal_enabled ?? true,
        detect_renewal_keywords: config.detect_renewal_keywords?.join(',') || DEFAULT_FORM_DATA.detect_renewal_keywords,
        logs_enabled: config.logs_enabled ?? true,
        default_duration_hours: config.default_duration_hours ?? 2,
        post_endpoint: config.post_endpoint || '',
        get_endpoint: config.get_endpoint || '',
        api_key: config.api_key || '',
      });
    } else {
      setFormData(DEFAULT_FORM_DATA);
    }
  }, [selectedApiId, config, configLoading]);

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!selectedApiId) throw new Error('Selecione uma API');

      const selectedServer = servers.find(s => s.id === formData.server_id);
      const keywordsArray = formData.detect_renewal_keywords
        .split(',')
        .map(k => k.trim())
        .filter(k => k.length > 0);
      
      const payload = {
        seller_id: user!.id,
        api_id: selectedApiId,
        server_id: formData.server_id || null,
        server_name: selectedServer?.name || null,
        category: formData.category,
        client_name_prefix: formData.client_name_prefix,
        map_login_path: formData.map_login_path,
        map_password_path: formData.map_password_path,
        map_dns_path: formData.map_dns_path,
        map_expiration_path: formData.map_expiration_path,
        auto_create_client: formData.auto_create_client,
        send_welcome_message: formData.send_welcome_message,
        detect_renewal_enabled: formData.detect_renewal_enabled,
        detect_renewal_keywords: keywordsArray,
        logs_enabled: formData.logs_enabled,
        default_duration_hours: formData.default_duration_hours,
        post_endpoint: formData.post_endpoint || null,
        get_endpoint: formData.get_endpoint || null,
        api_key: formData.api_key || null,
        is_active: true,
      };

      if (config?.id) {
        const { error } = await supabase
          .from('test_integration_config')
          .update(payload)
          .eq('id', config.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('test_integration_config')
          .insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success('Configuração salva!');
      queryClient.invalidateQueries({ queryKey: ['test-integration-config'] });
      refetchConfig();
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  // Reset counter mutation
  const resetCounterMutation = useMutation({
    mutationFn: async () => {
      if (!config?.id) throw new Error('Configuração não encontrada');
      
      const { error } = await supabase
        .from('test_integration_config')
        .update({ test_counter: 0 })
        .eq('id', config.id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Contador zerado!');
      refetchConfig();
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  // Update form field
  const updateField = useCallback(<K extends keyof TestConfigFormData>(
    field: K, 
    value: TestConfigFormData[K]
  ) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  }, []);

  // Computed states
  const isLoading = apisLoading || serversLoading;
  const hasApis = apis.length > 0;
  const hasServers = servers.length > 0;

  return {
    // Data
    apis,
    servers,
    config,
    formData,
    selectedApiId,
    
    // Loading states
    isLoading,
    configLoading,
    isSaving: saveMutation.isPending,
    isResettingCounter: resetCounterMutation.isPending,
    
    // Computed
    hasApis,
    hasServers,
    
    // Actions
    setSelectedApiId,
    updateField,
    save: saveMutation.mutate,
    resetCounter: resetCounterMutation.mutate,
    refetchConfig,
  };
}
