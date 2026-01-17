import { useCallback, useRef } from 'react';
import { format, isValid, parseISO, isBefore, addDays } from 'date-fns';

// Types
interface ClientData {
  name?: string;
  phone?: string | null;
  email?: string | null;
  expiration_date?: string;
  plan_id?: string | null;
  plan_name?: string | null;
  plan_price?: number | string | null;
  login?: string | null;
  password?: string | null;
  server_id?: string | null;
  category?: string | null;
  is_paid?: boolean;
  pending_amount?: number | string | null;
  [key: string]: unknown;
}

interface ValidationResult {
  isValid: boolean;
  data: ClientData;
  corrections: string[];
  errors: string[];
  blocked: boolean;
  blockReason?: string;
}

interface ValidationLog {
  timestamp: string;
  operation: string;
  clientId?: string;
  corrections: string[];
  errors: string[];
  blocked: boolean;
  blockReason?: string;
}

// Silent internal log storage (in-memory, non-blocking)
const validationLogs: ValidationLog[] = [];
const MAX_LOGS = 100;

function addLog(log: Omit<ValidationLog, 'timestamp'>) {
  validationLogs.unshift({
    ...log,
    timestamp: new Date().toISOString(),
  });
  // Keep only last MAX_LOGS entries
  if (validationLogs.length > MAX_LOGS) {
    validationLogs.pop();
  }
}

// Utility functions for data normalization
const normalizers = {
  // Normalize phone number (remove non-digits, format Brazilian phone)
  phone: (value: string | null | undefined): string | null => {
    if (!value) return null;
    const digits = value.replace(/\D/g, '');
    if (digits.length === 0) return null;
    if (digits.length < 10) return digits; // Too short, return as-is
    // Brazilian format: add country code if missing
    if (digits.length === 11 && digits.startsWith('9')) {
      return `55${digits}`;
    }
    if (digits.length === 10 || digits.length === 11) {
      return digits;
    }
    return digits;
  },

  // Normalize name (trim, capitalize first letters)
  name: (value: string | null | undefined): string => {
    if (!value) return '';
    return value
      .trim()
      .replace(/\s+/g, ' ')
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  },

  // Normalize email (trim, lowercase)
  email: (value: string | null | undefined): string | null => {
    if (!value) return null;
    const trimmed = value.trim().toLowerCase();
    return trimmed.length > 0 ? trimmed : null;
  },

  // Normalize date to YYYY-MM-DD format
  date: (value: string | null | undefined): string | null => {
    if (!value) return null;
    
    // Try to parse the date
    let date: Date | null = null;
    
    // Try ISO format first
    if (value.includes('-')) {
      date = parseISO(value);
    }
    // Try DD/MM/YYYY format
    else if (value.includes('/')) {
      const parts = value.split('/');
      if (parts.length === 3) {
        date = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
      }
    }
    
    if (date && isValid(date)) {
      return format(date, 'yyyy-MM-dd');
    }
    
    return null;
  },

  // Normalize price to number
  price: (value: number | string | null | undefined): number | null => {
    if (value === null || value === undefined || value === '') return null;
    const num = typeof value === 'string' 
      ? parseFloat(value.replace(',', '.').replace(/[^\\d.-]/g, ''))
      : value;
    return isNaN(num) ? null : Math.max(0, num);
  },

  // Normalize login (trim whitespace)
  login: (value: string | null | undefined): string | null => {
    if (!value) return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  },

  // Normalize category
  category: (value: string | null | undefined): string => {
    if (!value) return 'IPTV';
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : 'IPTV';
  },
};

// Validators
const validators = {
  name: (value: string): { valid: boolean; error?: string } => {
    if (!value || value.trim().length === 0) {
      return { valid: false, error: 'Nome é obrigatório' };
    }
    if (value.length > 100) {
      return { valid: false, error: 'Nome muito longo' };
    }
    return { valid: true };
  },

  email: (value: string | null): { valid: boolean; error?: string } => {
    if (!value) return { valid: true }; // Optional
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(value)) {
      return { valid: false, error: 'Email inválido' };
    }
    return { valid: true };
  },

  phone: (value: string | null): { valid: boolean; error?: string } => {
    if (!value) return { valid: true }; // Optional
    const digits = value.replace(/\D/g, '');
    if (digits.length < 8) {
      return { valid: false, error: 'Telefone muito curto' };
    }
    return { valid: true };
  },

  expirationDate: (value: string | null): { valid: boolean; error?: string; corrected?: string } => {
    if (!value) {
      // Auto-correct: set to 30 days from now
      return { 
        valid: true, 
        corrected: format(addDays(new Date(), 30), 'yyyy-MM-dd') 
      };
    }
    
    const normalized = normalizers.date(value);
    if (!normalized) {
      return { valid: false, error: 'Data de vencimento inválida' };
    }
    
    return { valid: true };
  },

  price: (value: number | null): { valid: boolean; error?: string } => {
    if (value === null) return { valid: true }; // Optional
    if (value < 0) {
      return { valid: false, error: 'Preço não pode ser negativo' };
    }
    if (value > 99999) {
      return { valid: false, error: 'Preço muito alto' };
    }
    return { valid: true };
  },
};

export function useClientValidation() {
  // Lock to prevent simultaneous operations on the same client
  const operationLocks = useRef<Map<string, number>>(new Map());
  const LOCK_TIMEOUT_MS = 5000;

  // Check if an operation is currently locked
  const isLocked = useCallback((clientId: string): boolean => {
    const lockTime = operationLocks.current.get(clientId);
    if (!lockTime) return false;
    
    // Check if lock has expired
    if (Date.now() - lockTime > LOCK_TIMEOUT_MS) {
      operationLocks.current.delete(clientId);
      return false;
    }
    
    return true;
  }, []);

  // Acquire lock for an operation
  const acquireLock = useCallback((clientId: string): boolean => {
    if (isLocked(clientId)) {
      return false;
    }
    operationLocks.current.set(clientId, Date.now());
    return true;
  }, [isLocked]);

  // Release lock
  const releaseLock = useCallback((clientId: string) => {
    operationLocks.current.delete(clientId);
  }, []);

  // Main validation function
  const validateClient = useCallback((
    data: ClientData,
    operation: 'create' | 'update' | 'renew' | 'delete',
    clientId?: string
  ): ValidationResult => {
    const corrections: string[] = [];
    const errors: string[] = [];
    let blocked = false;
    let blockReason: string | undefined;
    const correctedData = { ...data };

    // Check for concurrent operations lock
    if (clientId && operation !== 'create') {
      if (isLocked(clientId)) {
        blocked = true;
        blockReason = 'Operação em andamento';
        addLog({ operation, clientId, corrections, errors, blocked, blockReason });
        return { isValid: false, data: correctedData, corrections, errors, blocked, blockReason };
      }
    }

    // === NAME VALIDATION ===
    if (data.name !== undefined) {
      const normalizedName = normalizers.name(data.name);
      if (normalizedName !== data.name) {
        corrections.push(`Nome normalizado: \"${data.name}\" → \"${normalizedName}\"`);
        correctedData.name = normalizedName;
      }
      
      const nameValidation = validators.name(normalizedName);
      if (!nameValidation.valid && nameValidation.error) {
        if (operation === 'create' || operation === 'update') {
          errors.push(nameValidation.error);
        }
      }
    }

    // === PHONE VALIDATION ===
    if (data.phone !== undefined) {
      const normalizedPhone = normalizers.phone(data.phone);
      if (normalizedPhone !== data.phone && normalizedPhone !== null) {
        corrections.push(`Telefone normalizado`);
        correctedData.phone = normalizedPhone;
      }
      
      const phoneValidation = validators.phone(normalizedPhone);
      if (!phoneValidation.valid && phoneValidation.error) {
        // Auto-correct by clearing invalid phone
        corrections.push(`Telefone inválido removido`);
        correctedData.phone = null;
      }
    }

    // === EMAIL VALIDATION ===
    if (data.email !== undefined) {
      const normalizedEmail = normalizers.email(data.email);
      if (normalizedEmail !== data.email) {
        corrections.push(`Email normalizado`);
        correctedData.email = normalizedEmail;
      }
      
      const emailValidation = validators.email(normalizedEmail);
      if (!emailValidation.valid && emailValidation.error) {
        // Auto-correct by clearing invalid email
        corrections.push(`Email inválido removido`);
        correctedData.email = null;
      }
    }

    // === EXPIRATION DATE VALIDATION ===
    if (data.expiration_date !== undefined || operation === 'create') {
      const normalizedDate = normalizers.date(data.expiration_date);
      const dateValidation = validators.expirationDate(data.expiration_date);
      
      if (dateValidation.corrected) {
        corrections.push(`Data de vencimento definida automaticamente`);
        correctedData.expiration_date = dateValidation.corrected;
      } else if (normalizedDate && normalizedDate !== data.expiration_date) {
        corrections.push(`Data normalizada`);
        correctedData.expiration_date = normalizedDate;
      } else if (!dateValidation.valid && dateValidation.error) {
        // Auto-correct with default date
        corrections.push(`Data inválida corrigida para 30 dias`);
        correctedData.expiration_date = format(addDays(new Date(), 30), 'yyyy-MM-dd');
      }
    }

    // === PRICE VALIDATION ===
    if (data.plan_price !== undefined) {
      const normalizedPrice = normalizers.price(data.plan_price);
      if (normalizedPrice !== data.plan_price) {
        corrections.push(`Preço normalizado`);
        correctedData.plan_price = normalizedPrice;
      }
      
      const priceValidation = validators.price(normalizedPrice);
      if (!priceValidation.valid && priceValidation.error) {
        corrections.push(`Preço inválido corrigido para 0`);
        correctedData.plan_price = 0;
      }
    }

    // === PENDING AMOUNT VALIDATION ===
    if (data.pending_amount !== undefined) {
      const normalizedAmount = normalizers.price(data.pending_amount);
      if (normalizedAmount !== data.pending_amount) {
        correctedData.pending_amount = normalizedAmount;
      }
      if (normalizedAmount !== null && normalizedAmount < 0) {
        corrections.push(`Valor pendente corrigido para 0`);
        correctedData.pending_amount = 0;
      }
    }

    // === CATEGORY DEFAULT ===
    if (data.category !== undefined || operation === 'create') {
      const normalizedCategory = normalizers.category(data.category);
      if (normalizedCategory !== data.category) {
        corrections.push(`Categoria definida automaticamente: ${normalizedCategory}`);
        correctedData.category = normalizedCategory;
      }
    }

    // === LOGIN/PASSWORD NORMALIZATION ===
    if (data.login !== undefined) {
      const normalizedLogin = normalizers.login(data.login);
      if (normalizedLogin !== data.login) {
        corrections.push(`Login normalizado`);
        correctedData.login = normalizedLogin;
      }
    }

    // === IS_PAID DEFAULT ===
    if (data.is_paid === undefined && operation === 'create') {
      corrections.push(`Status de pagamento definido como pago`);
      correctedData.is_paid = true;
    }

    // Determine if validation passed
    const isValid = errors.length === 0 && !blocked;

    // Log the validation result (silent, non-blocking)
    addLog({
      operation,
      clientId,
      corrections,
      errors,
      blocked,
      blockReason,
    });

    return {
      isValid,
      data: correctedData,
      corrections,
      errors,
      blocked,
      blockReason,
    };
  }, [isLocked]);

  // Validate before create
  const validateForCreate = useCallback((data: ClientData): ValidationResult => {
    return validateClient(data, 'create');
  }, [validateClient]);

  // Validate before update
  const validateForUpdate = useCallback((data: ClientData, clientId: string): ValidationResult => {
    return validateClient(data, 'update', clientId);
  }, [validateClient]);

  // Validate before renewal
  const validateForRenewal = useCallback((clientId: string, expirationDate: string): ValidationResult => {
    return validateClient({ expiration_date: expirationDate }, 'renew', clientId);
  }, [validateClient]);

  // Validate before delete
  const validateForDelete = useCallback((clientId: string): ValidationResult => {
    return validateClient({}, 'delete', clientId);
  }, [validateClient]);

  // Get validation logs (for debugging)
  const getLogs = useCallback((): ValidationLog[] => {
    return [...validationLogs];
  }, []);

  // Clear logs
  const clearLogs = useCallback(() => {
    validationLogs.length = 0;
  }, []);

  return {
    validateClient,
    validateForCreate,
    validateForUpdate,
    validateForRenewal,
    validateForDelete,
    acquireLock,
    releaseLock,
    isLocked,
    getLogs,
    clearLogs,
  };
}

// Export normalizers for use in other components
export { normalizers, validators };
