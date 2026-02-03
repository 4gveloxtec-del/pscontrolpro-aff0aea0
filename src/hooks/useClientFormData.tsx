/**
 * Client Form Data Hook
 * 
 * Manages the form state for client creation and editing.
 * Extracts formData, resetForm, and related logic from Clients.tsx for better maintainability.
 */

import { useState, useCallback } from 'react';
import { format, addDays } from 'date-fns';

// Interface for MAC devices
interface MacDevice {
  name: string;
  mac: string;
}

// Client form data interface
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
  // Second server fields
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
  screens: string;
  gerencia_app_mac: string;
  gerencia_app_devices: MacDevice[];
  app_name: string;
  app_type: 'server' | 'own';
  device_model: string;
  has_adult_content: boolean;
}

// Client data type for populating form on edit
interface ClientData {
  name: string;
  phone?: string | null;
  telegram?: string | null;
  email?: string | null;
  device?: string | null;
  dns?: string | null;
  expiration_date: string;
  plan_id?: string | null;
  plan_name?: string | null;
  plan_price?: number | null;
  premium_price?: number | null;
  server_id?: string | null;
  server_name?: string | null;
  server_id_2?: string | null;
  server_name_2?: string | null;
  premium_password?: string | null;
  category?: string | null;
  is_paid: boolean;
  pending_amount?: number | null;
  expected_payment_date?: string | null;
  notes?: string | null;
  has_paid_apps?: boolean | null;
  paid_apps_duration?: string | null;
  paid_apps_expiration?: string | null;
  paid_apps_email?: string | null;
  paid_apps_password?: string | null;
  gerencia_app_mac?: string | null;
  gerencia_app_devices?: MacDevice[] | null;
  app_name?: string | null;
  app_type?: string | null;
  device_model?: string | null;
  has_adult_content?: boolean | null;
}

// Default form values
const getDefaultFormData = (): ClientFormData => ({
  name: '',
  phone: '',
  telegram: '',
  email: '',
  device: '',
  dns: '',
  expiration_date: format(addDays(new Date(), 30), 'yyyy-MM-dd'),
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
  screens: '1',
  gerencia_app_mac: '',
  gerencia_app_devices: [],
  app_name: '',
  app_type: 'server',
  device_model: '',
  has_adult_content: false,
});

interface UseClientFormDataOptions {
  onReset?: () => void;
}

export function useClientFormData(options?: UseClientFormDataOptions) {
  const [formData, setFormData] = useState<ClientFormData>(getDefaultFormData);

  // Reset form to initial state
  const resetForm = useCallback(() => {
    setFormData(getDefaultFormData());
    options?.onReset?.();
  }, [options]);

  // Update specific field(s)
  const updateFormData = useCallback((updates: Partial<ClientFormData>) => {
    setFormData(prev => ({ ...prev, ...updates }));
  }, []);

  // Populate form with client data for editing
  // Note: credentials (login, password, login_2, password_2) should be decrypted separately
  // and updated via updateFormData after this call
  const setFormDataFromClient = useCallback((client: ClientData) => {
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
      premium_price: client.premium_price?.toString() || '',
      server_id: client.server_id || '',
      server_name: client.server_name || '',
      login: '', // Will be updated after decryption
      password: '', // Will be updated after decryption
      server_id_2: client.server_id_2 || '',
      server_name_2: client.server_name_2 || '',
      login_2: '', // Will be updated after decryption
      password_2: '', // Will be updated after decryption
      premium_password: client.premium_password || '',
      category: client.category || 'IPTV',
      is_paid: client.is_paid,
      pending_amount: client.pending_amount?.toString() || '',
      expected_payment_date: client.expected_payment_date || '',
      notes: client.notes || '',
      has_paid_apps: client.has_paid_apps || false,
      paid_apps_duration: client.paid_apps_duration || '',
      paid_apps_expiration: client.paid_apps_expiration || '',
      paid_apps_email: client.paid_apps_email || '',
      paid_apps_password: client.paid_apps_password || '',
      screens: '1',
      gerencia_app_mac: client.gerencia_app_mac || '',
      gerencia_app_devices: client.gerencia_app_devices || [],
      app_name: client.app_name || '',
      app_type: (client.app_type as 'server' | 'own') || 'server',
      device_model: client.device_model || '',
      has_adult_content: client.has_adult_content || false,
    });
  }, []);

  // Check if form has unsaved changes (basic fields only)
  const hasBasicFormChanges = useCallback(() => {
    return (
      formData.name.trim() !== '' ||
      formData.phone.trim() !== '' ||
      formData.login.trim() !== '' ||
      formData.password.trim() !== ''
    );
  }, [formData.name, formData.phone, formData.login, formData.password]);

  return {
    formData,
    setFormData,
    resetForm,
    updateFormData,
    setFormDataFromClient,
    hasBasicFormChanges,
  };
}

export type { MacDevice, ClientData };
