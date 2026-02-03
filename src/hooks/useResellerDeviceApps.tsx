import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

// =====================================================
// UNIFIED QUERY KEY - Use this constant everywhere
// =====================================================
export const RESELLER_DEVICE_APPS_QUERY_KEY = 'reseller-device-apps';

// =====================================================
// CANONICAL INTERFACE - Single source of truth
// =====================================================
export interface ResellerDeviceApp {
  id: string;
  seller_id: string;
  name: string;
  icon: string;
  company_name: string | null;
  device_types: string[];
  app_source: 'play_store' | 'app_store' | 'direct';
  download_url: string | null;
  downloader_code: string | null;
  mac_address: string | null;
  server_id: string | null;
  panel_id: string | null;
  is_gerencia_app: boolean;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
  // Optional join fields
  servers?: { name: string } | null;
  panel?: { id: string; name: string; panel_url: string | null } | null;
}

// Map UI device names to database device types
const DEVICE_MAPPING: Record<string, string[]> = {
  'Smart TV': ['smart_tv'],
  'TV Android': ['android_tv', 'smart_tv'],
  'Celular': ['celular_android', 'iphone'],
  'TV Box': ['android_tv'],
  'Video Game': ['android_tv', 'smart_tv'],
  'PC': ['android_tv'], // PC can use Android emulator
  'Notebook': ['android_tv'], // Notebook can use Android emulator
  'Fire Stick': ['fire_stick', 'android_tv'],
  'Projetor Android': ['android_tv'], // Projetor uses Android TV apps
};

/**
 * Hook to fetch all active device apps for a seller
 */
export function useResellerDeviceApps(sellerId: string | undefined) {
  return useQuery({
    queryKey: [RESELLER_DEVICE_APPS_QUERY_KEY, sellerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('reseller_device_apps' as any)
        .select('*')
        .eq('seller_id', sellerId!)
        // IMPORTANT: treat NULL as false for backward-compatibility (older rows)
        .or('is_gerencia_app.eq.false,is_gerencia_app.is.null')
        .eq('is_active', true)
        .order('name');
      if (error) throw error;
      
      // Collect panel IDs for a second query if needed
      const panelIds = [...new Set((data || []).map((app: any) => app.panel_id).filter(Boolean))];
      let panelMap: Record<string, { id: string; name: string; panel_url: string | null }> = {};
      
      if (panelIds.length > 0) {
        const { data: panels } = await supabase
          .from('servers')
          .select('id, name, panel_url')
          .in('id', panelIds);
        if (panels) {
          panelMap = Object.fromEntries(panels.map(p => [p.id, { id: p.id, name: p.name, panel_url: p.panel_url }]));
        }
      }
      
      return (data || []).map((app: any) => ({
        ...app,
        device_types: app.device_types || [],
        panel: panelMap[app.panel_id] || null,
      })) as ResellerDeviceApp[];
    },
    enabled: !!sellerId,
  });
}

/**
 * Hook to fetch device apps filtered by device type and optionally server
 */
export function useFilteredDeviceApps(
  sellerId: string | undefined,
  clientDevices: string | null,
  serverId: string | null | undefined
) {
  const { data: allApps = [], ...rest } = useResellerDeviceApps(sellerId);

  // Parse client devices (comma-separated string)
  const deviceList = clientDevices 
    ? clientDevices.split(',').map(d => d.trim()).filter(Boolean)
    : [];

  // Get database device types from UI device names
  const targetDeviceTypes = new Set<string>();
  deviceList.forEach(device => {
    const mappedTypes = DEVICE_MAPPING[device] || [];
    mappedTypes.forEach(type => targetDeviceTypes.add(type));
  });

  // Filter apps by device compatibility
  const filteredApps = allApps.filter(app => {
    // If app is for specific server, check if it matches
    if (app.server_id && serverId && app.server_id !== serverId) {
      return false;
    }

    // Check if any of the app's device types match the target devices
    const hasMatchingDevice = app.device_types.some(
      deviceType => targetDeviceTypes.has(deviceType)
    );

    return hasMatchingDevice;
  });

  // Group by source for convenience
  const playStoreApps = filteredApps.filter(a => a.app_source === 'play_store');
  const appStoreApps = filteredApps.filter(a => a.app_source === 'app_store');
  const directApps = filteredApps.filter(a => a.app_source === 'direct');

  // Check if client has iOS device
  const hasIOS = deviceList.some(d => d.toLowerCase().includes('iphone'));
  const hasAndroid = deviceList.some(d => 
    d.toLowerCase().includes('android') || 
    d.toLowerCase().includes('tv') ||
    d.toLowerCase().includes('box') ||
    d.toLowerCase().includes('fire') ||
    d.toLowerCase().includes('celular')
  );

  return {
    ...rest,
    data: filteredApps,
    playStoreApps,
    appStoreApps,
    directApps,
    hasIOS,
    hasAndroid,
    allApps,
  };
}

/**
 * Format apps for message template replacement
 */
export function formatAppsForMessage(apps: ResellerDeviceApp[]): {
  apps: string;
  links: string;
} {
  if (apps.length === 0) {
    return { apps: '', links: '' };
  }

  const appNames = apps.map(app => `${app.icon} ${app.name}`).join('\n');
  const appLinks = apps
    .filter(app => app.download_url)
    .map(app => `${app.icon} ${app.name}: ${app.download_url}`)
    .join('\n');

  return {
    apps: appNames,
    links: appLinks,
  };
}

/**
 * Get compatible apps for a specific device list
 */
export function getCompatibleApps(
  apps: ResellerDeviceApp[],
  clientDevices: string | null
): ResellerDeviceApp[] {
  if (!clientDevices) return [];

  const deviceList = clientDevices.split(',').map(d => d.trim()).filter(Boolean);
  
  const targetDeviceTypes = new Set<string>();
  deviceList.forEach(device => {
    const mappedTypes = DEVICE_MAPPING[device] || [];
    mappedTypes.forEach(type => targetDeviceTypes.add(type));
  });

  return apps.filter(app => 
    app.device_types.some(deviceType => targetDeviceTypes.has(deviceType))
  );
}
