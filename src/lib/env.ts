/**
 * Environment Configuration & Validation
 * 
 * This module provides type-safe access to environment variables
 * with runtime validation to prevent deployment failures.
 * 
 * IMPORTANT: All environment variables must be prefixed with VITE_
 * to be accessible in the browser (Vite requirement).
 * 
 * @module env
 * @version 2.0.0
 * @updated 2026-01-24
 */

// =============================================================================
// ⚠️ TEMPORARY FALLBACKS - REMOVE AFTER VERCEL CONFIG ⚠️
// Created: 2026-01-24
// Remove by: 2026-01-24 (2 hours from creation)
// =============================================================================
const TEMP_FALLBACKS = {
  SUPABASE_URL: 'https://kgtqnjhmwsvswhrczqaf.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtndHFuamhtd3N2c3docmN6cWFmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg2MDA0OTAsImV4cCI6MjA4NDE3NjQ5MH0.douqXINkw8kUqyWksIIgxEUKBb4YuTw933mLwzSiwvk',
  SUPABASE_PROJECT_ID: 'kgtqnjhmwsvswhrczqaf',
};
// =============================================================================

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================

/**
 * Environment configuration interface
 * All properties are validated at runtime
 */
interface EnvConfig {
  // Required Supabase configuration
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  SUPABASE_PROJECT_ID: string;
  
  // Optional configuration
  DEBUG_MODE: boolean;
  
  // Runtime environment detection
  IS_PRODUCTION: boolean;
  IS_DEVELOPMENT: boolean;
  IS_STAGING: boolean;
}

/**
 * Validation result interface
 */
interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * List of all critical environment variables
 * These MUST be present for the application to function
 */
const CRITICAL_VARIABLES = [
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_PROJECT_ID',
] as const;

/**
 * Variables that have fallback alternatives
 */
const VARIABLES_WITH_FALLBACKS = {
  'VITE_SUPABASE_PUBLISHABLE_KEY': 'VITE_SUPABASE_ANON_KEY',
} as const;

// =============================================================================
// VALIDATION HELPERS
// =============================================================================

/**
 * Get a required environment variable
 * Uses TEMP_FALLBACKS if env var is missing (TEMPORARY - REMOVE AFTER VERCEL CONFIG)
 */
function getRequiredEnvVar(key: string): string {
  const value = import.meta.env[key];
  
  if (!value || value === 'undefined' || value.trim() === '') {
    // ⚠️ TEMPORARY: Use fallback values for Vercel deploy
    const fallbackKey = key.replace('VITE_', '').replace('_PUBLISHABLE_KEY', '_ANON_KEY');
    const fallback = TEMP_FALLBACKS[fallbackKey as keyof typeof TEMP_FALLBACKS];
    
    if (fallback) {
      console.warn(`[ENV] Using temporary fallback for ${key}`);
      return fallback;
    }
    
    const errorMessage = `
[ENV ERROR] Missing required environment variable: ${key}

This application requires the following environment variables to be set:
- VITE_SUPABASE_URL
- VITE_SUPABASE_PUBLISHABLE_KEY (or VITE_SUPABASE_ANON_KEY)
- VITE_SUPABASE_PROJECT_ID

If deploying to Vercel:
1. Go to your Vercel Dashboard → Project → Settings → Environment Variables
2. Add the missing variable(s)
3. Redeploy your application

If running locally:
1. Copy .env.example to .env
2. Fill in the required values
3. Restart the development server
    `.trim();
    
    console.error(errorMessage);
    
    // In development, throw to make the error obvious
    if (import.meta.env.DEV) {
      throw new Error(errorMessage);
    }
    
    // In production, return empty string to allow graceful degradation
    return '';
  }
  
  return value.trim();
}

/**
 * Get an optional environment variable with a default value
 */
function getOptionalEnvVar(key: string, defaultValue: string = ''): string {
  const value = import.meta.env[key];
  if (!value || value === 'undefined' || value.trim() === '') {
    return defaultValue;
  }
  return value.trim();
}

/**
 * Parse a boolean environment variable
 * Accepts: "true", "1", "yes" as truthy values
 */
function getBooleanEnvVar(key: string, defaultValue: boolean = false): boolean {
  const value = import.meta.env[key];
  if (!value || value === 'undefined') return defaultValue;
  const normalizedValue = value.toLowerCase().trim();
  return normalizedValue === 'true' || normalizedValue === '1' || normalizedValue === 'yes';
}

/**
 * Get a variable with fallback to an alternative key
 */
function getEnvVarWithFallback(primaryKey: string, fallbackKey: string): string {
  const primaryValue = getOptionalEnvVar(primaryKey);
  if (primaryValue) return primaryValue;
  return getRequiredEnvVar(fallbackKey);
}

// =============================================================================
// ENVIRONMENT CONFIGURATION
// =============================================================================

/**
 * Validated environment configuration
 * 
 * Uses defensive loading with fallbacks for Supabase keys:
 * - VITE_SUPABASE_PUBLISHABLE_KEY (primary, Lovable Cloud style)
 * - VITE_SUPABASE_ANON_KEY (fallback, standard Supabase style)
 */
export const env: EnvConfig = {
  // Required Supabase config
  SUPABASE_URL: getRequiredEnvVar('VITE_SUPABASE_URL'),
  
  // Support both key naming conventions
  SUPABASE_ANON_KEY: getEnvVarWithFallback(
    'VITE_SUPABASE_PUBLISHABLE_KEY',
    'VITE_SUPABASE_ANON_KEY'
  ),
  
  SUPABASE_PROJECT_ID: getRequiredEnvVar('VITE_SUPABASE_PROJECT_ID'),
  
  // Optional config
  DEBUG_MODE: getBooleanEnvVar('VITE_DEBUG_MODE', false),
  
  // Runtime environment detection
  IS_PRODUCTION: import.meta.env.PROD === true,
  IS_DEVELOPMENT: import.meta.env.DEV === true,
  IS_STAGING: typeof window !== 'undefined' && 
    (window.location.hostname.includes('preview') || 
     window.location.hostname.includes('staging')),
};

// =============================================================================
// VALIDATION FUNCTIONS
// =============================================================================

/**
 * Validate that all required environment variables are present
 * Call this early in your app initialization
 * 
 * @returns {ValidationResult} Object with validation status, errors, and warnings
 */
export function validateEnv(): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  // Check critical variables
  if (!env.SUPABASE_URL) {
    errors.push('VITE_SUPABASE_URL is not configured');
  }
  
  if (!env.SUPABASE_ANON_KEY) {
    errors.push('VITE_SUPABASE_PUBLISHABLE_KEY (or VITE_SUPABASE_ANON_KEY) is not configured');
  }
  
  if (!env.SUPABASE_PROJECT_ID) {
    errors.push('VITE_SUPABASE_PROJECT_ID is not configured');
  }
  
  // Validate URL format
  if (env.SUPABASE_URL) {
    if (!env.SUPABASE_URL.startsWith('https://')) {
      errors.push('VITE_SUPABASE_URL must be a valid HTTPS URL');
    }
    
    if (!env.SUPABASE_URL.includes('.supabase.co')) {
      warnings.push('VITE_SUPABASE_URL does not appear to be a standard Supabase URL');
    }
  }
  
  // Validate project ID matches URL
  if (env.SUPABASE_URL && env.SUPABASE_PROJECT_ID) {
    if (!env.SUPABASE_URL.includes(env.SUPABASE_PROJECT_ID)) {
      warnings.push('VITE_SUPABASE_PROJECT_ID does not match the project ID in VITE_SUPABASE_URL');
    }
  }
  
  // Validate anon key format (should be a JWT)
  if (env.SUPABASE_ANON_KEY && !env.SUPABASE_ANON_KEY.startsWith('eyJ')) {
    errors.push('VITE_SUPABASE_PUBLISHABLE_KEY does not appear to be a valid JWT token');
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Get a summary of the current environment configuration
 * Safe to log (no secrets exposed)
 */
export function getEnvSummary(): Record<string, string> {
  return {
    SUPABASE_URL: env.SUPABASE_URL ? '✓ Configured' : '✗ Missing',
    SUPABASE_ANON_KEY: env.SUPABASE_ANON_KEY ? '✓ Configured' : '✗ Missing',
    SUPABASE_PROJECT_ID: env.SUPABASE_PROJECT_ID ? '✓ Configured' : '✗ Missing',
    DEBUG_MODE: env.DEBUG_MODE ? 'Enabled' : 'Disabled',
    ENVIRONMENT: env.IS_PRODUCTION ? 'Production' : env.IS_STAGING ? 'Staging' : 'Development',
  };
}

// =============================================================================
// ENVIRONMENT DETECTION
// =============================================================================

/**
 * Check if the app is running in Lovable preview environment
 */
export function isLovableEnvironment(): boolean {
  return typeof window !== 'undefined' && 
         window.location.hostname.includes('lovable.app');
}

/**
 * Check if the app is running in Vercel environment
 */
export function isVercelEnvironment(): boolean {
  return typeof window !== 'undefined' && (
    window.location.hostname.includes('.vercel.app') ||
    import.meta.env.VERCEL === '1'
  );
}

/**
 * Check if the app is running locally
 */
export function isLocalEnvironment(): boolean {
  return typeof window !== 'undefined' && (
    window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1'
  );
}

/**
 * Get the current environment name
 */
export function getEnvironmentName(): string {
  if (isLocalEnvironment()) return 'local';
  if (isLovableEnvironment()) return 'lovable';
  if (isVercelEnvironment()) return 'vercel';
  return 'unknown';
}

// =============================================================================
// DEBUG LOGGING
// =============================================================================

// Only log in development or when explicitly enabled
if (env.IS_DEVELOPMENT || env.DEBUG_MODE) {
  const summary = getEnvSummary();
  console.log('[ENV] Configuration loaded:', summary);
  
  const { warnings } = validateEnv();
  if (warnings.length > 0) {
    console.warn('[ENV] Warnings:', warnings);
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

export type { EnvConfig, ValidationResult };
export { CRITICAL_VARIABLES, VARIABLES_WITH_FALLBACKS };
