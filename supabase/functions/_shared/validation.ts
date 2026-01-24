/**
 * Shared validation utilities for Edge Functions
 * Uses Zod for strict schema validation
 */

import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

// Common validation schemas

// UUID validation
export const uuidSchema = z.string().uuid("Invalid UUID format");

// Phone validation (Brazilian format)
export const phoneSchema = z.string()
  .min(8, "Phone must have at least 8 digits")
  .max(20, "Phone too long")
  .transform(val => val.replace(/\D/g, ''));

// Email validation
export const emailSchema = z.string()
  .email("Invalid email format")
  .max(255, "Email too long");

// Safe string (prevents XSS and SQL injection patterns)
export const safeStringSchema = z.string()
  .max(1000, "String too long")
  .refine(
    (val) => !/<script|javascript:|data:/i.test(val),
    "Potentially unsafe content detected"
  );

// Short text fields
export const shortTextSchema = z.string()
  .min(1, "Field cannot be empty")
  .max(100, "Field too long");

// Long text fields
export const longTextSchema = z.string()
  .max(5000, "Content too long");

// Positive number
export const positiveNumberSchema = z.number()
  .positive("Must be a positive number")
  .max(999999999, "Number too large");

// Date string (ISO format or yyyy-MM-dd)
export const dateStringSchema = z.string()
  .refine(
    (val) => {
      const isoMatch = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}.*)?$/.test(val);
      const brMatch = /^\d{2}\/\d{2}\/\d{4}$/.test(val);
      return isoMatch || brMatch;
    },
    "Invalid date format"
  );

// Action enum for bulk operations
export const bulkActionSchema = z.enum([
  'start', 'status', 'get_active', 'pause', 'resume', 'cancel', 'list'
]);

// Crypto action enum
export const cryptoActionSchema = z.enum(['encrypt', 'decrypt']);

/**
 * Validate and parse request body with a Zod schema
 * Returns parsed data or throws validation error
 */
export function validatePayload<T extends z.ZodSchema>(
  data: unknown, 
  schema: T
): z.infer<T> {
  const result = schema.safeParse(data);
  
  if (!result.success) {
    const errors = result.error.errors.map(e => `${e.path.join('.')}: ${e.message}`);
    throw new ValidationError(errors.join('; '));
  }
  
  return result.data;
}

/**
 * Custom validation error class
 */
export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

/**
 * Create error response for validation failures
 */
export function validationErrorResponse(error: ValidationError, corsHeaders: Record<string, string>) {
  return new Response(
    JSON.stringify({ 
      error: 'Validation failed', 
      details: error.message 
    }),
    { 
      status: 400, 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
    }
  );
}
