import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface ResellerDeviceApp {
  id: string;
  seller_id: string;
  name: string;
  icon: string;
  company_name: string | null;
  device_types: string[];
  app_source: 'play_store' | 'app_store' | 'direct';
  download_url: string | null;
  server_id: string | null;
  is_gerencia_app: boolean;
  is_active: boolean;
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
    queryKey: ['reseller-device-apps', sellerId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('reseller_device_apps' as any)
        .select('*')
        .eq('seller_id', sellerId!)
        .eq('is_active', true)
        .order('name');
      if (error) throw error;
      return (data || []).map((app: any) => ({
        ...app,
        device_types: app.device_types || [],
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
