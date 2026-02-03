/**
 * Tipos e constantes compartilhados para o módulo de Clientes.
 * Extraídos do Clients.tsx como parte da refatoração Etapa 2.5.
 */

import { Monitor, Smartphone, Tv, Gamepad2, Laptop, Flame, LucideIcon } from 'lucide-react';

// ============= Tipos de Dispositivo MAC (para Gerencia App) =============
export interface MacDevice {
  name: string;
  mac: string;
  device_key?: string;
}

// ============= Interface para servidores adicionais =============
export interface AdditionalServer {
  server_id: string;
  server_name: string;
  login?: string | null;
  password?: string | null;
  expiration_date?: string | null; // Data de expiração individual do servidor adicional
}

// ============= Interface principal de Cliente =============
export interface Client {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  device: string | null;
  dns: string | null;
  expiration_date: string;
  expiration_datetime: string | null;
  plan_id: string | null;
  plan_name: string | null;
  plan_price: number | null;
  premium_price: number | null;
  server_id: string | null;
  server_name: string | null;
  login: string | null;
  password: string | null;
  login_search: string | null; // Login em texto plano para busca/exibição rápida
  server_id_2: string | null;
  server_name_2: string | null;
  login_2: string | null;
  password_2: string | null;
  login2_search: string | null; // Login 2 em texto plano para busca/exibição rápida
  premium_password: string | null;
  category: string | null;
  is_paid: boolean;
  pending_amount: number | null;
  notes: string | null;
  has_paid_apps: boolean | null;
  paid_apps_duration: string | null;
  paid_apps_expiration: string | null;
  telegram: string | null;
  is_archived: boolean | null;
  archived_at: string | null;
  created_at: string | null;
  renewed_at: string | null;
  updated_at?: string | null;
  gerencia_app_mac: string | null;
  gerencia_app_devices: MacDevice[] | null;
  app_name: string | null;
  app_type: string | null;
  device_model: string | null;
  additional_servers?: AdditionalServer[] | null;
  is_test: boolean | null;
  is_integrated: boolean | null;
}

// ============= Interface de Categoria de Cliente =============
export interface ClientCategory {
  id: string;
  name: string;
  seller_id: string;
}

// ============= Interface de Credenciais Descriptografadas =============
export interface DecryptedCredentials {
  [clientId: string]: { 
    login: string; 
    password: string; 
    login_2?: string; 
    password_2?: string;
  };
}

// ============= Interface de Plano =============
export interface Plan {
  id: string;
  name: string;
  price: number;
  duration_days: number;
  is_active: boolean;
  category: string;
}

// ============= Interface de Servidor =============
export interface ServerData {
  id: string;
  name: string;
  is_active: boolean;
  is_credit_based: boolean;
  panel_url: string | null;
  icon_url: string | null;
  iptv_per_credit: number;
  p2p_per_credit: number;
  total_screens_per_credit: number;
}

// ============= Constantes =============
export const DEFAULT_CATEGORIES = ['IPTV', 'P2P', 'Contas Premium', 'SSH', 'Revendedor'] as const;
export type DefaultCategory = typeof DEFAULT_CATEGORIES[number];

export interface DeviceOption {
  value: string;
  label: string;
  icon: LucideIcon;
}

export const DEVICE_OPTIONS: readonly DeviceOption[] = [
  { value: 'Smart TV', label: 'Smart TV', icon: Tv },
  { value: 'TV Android', label: 'TV Android', icon: Tv },
  { value: 'Celular', label: 'Celular', icon: Smartphone },
  { value: 'TV Box', label: 'TV Box', icon: Monitor },
  { value: 'Video Game', label: 'Video Game', icon: Gamepad2 },
  { value: 'PC', label: 'PC', icon: Monitor },
  { value: 'Notebook', label: 'Notebook', icon: Laptop },
  { value: 'Fire Stick', label: 'Fire Stick', icon: Flame },
  { value: 'Projetor Android', label: 'Projetor Android', icon: Monitor },
] as const;

// ============= Constantes de Paginação =============
export const CLIENTS_PER_PAGE = 50;
export const SEARCH_PAGE_SIZE = 200;
export const AUTOLOAD_ALL_UP_TO = 250;
export const MAX_CLIENTS_PER_CREDENTIAL = 3;
