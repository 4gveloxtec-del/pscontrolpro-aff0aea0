import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Normalize WhatsApp phone number to international format
 * - Preserves any country code if provided (e.g., +1, +351, +44, +54)
 * - Adds +55 (Brazil) as default only when no country code is detected
 * - Handles various input formats with spaces, dashes, parentheses
 * 
 * @param phone - Raw phone number input
 * @returns Normalized phone number with country code prefix, or null if invalid
 */
export function normalizeWhatsAppNumber(phone: string | null | undefined): string | null {
  if (!phone || typeof phone !== 'string') return null;
  
  // Trim whitespace
  const cleaned = phone.trim();
  if (!cleaned) return null;
  
  // Check if already has a country code (starts with +)
  if (cleaned.startsWith('+')) {
    // Remove all non-digits except the leading +
    const normalized = '+' + cleaned.slice(1).replace(/\D/g, '');
    // Validate minimum length (country code + some digits)
    if (normalized.length < 8) return null;
    return normalized;
  }
  
  // Check if starts with 00 (international prefix)
  if (cleaned.startsWith('00')) {
    const digits = cleaned.replace(/\D/g, '');
    // Remove the leading 00 and add +
    const withoutPrefix = digits.substring(2);
    if (withoutPrefix.length < 6) return null;
    return `+${withoutPrefix}`;
  }
  
  // Extract only digits for analysis
  const digits = cleaned.replace(/\D/g, '');
  
  // If no digits, return null
  if (!digits || digits.length < 8) {
    return null; // Invalid phone number (too short)
  }
  
  // Check if the number starts with a known country code pattern
  // Common country codes that might be typed without +
  const countryCodePatterns = [
    { code: '55', minLength: 12, maxLength: 13 }, // Brazil
    { code: '1', minLength: 11, maxLength: 11 },  // USA/Canada
    { code: '44', minLength: 12, maxLength: 13 }, // UK
    { code: '351', minLength: 12, maxLength: 12 }, // Portugal
    { code: '54', minLength: 12, maxLength: 13 }, // Argentina
    { code: '34', minLength: 11, maxLength: 11 }, // Spain
    { code: '33', minLength: 11, maxLength: 11 }, // France
    { code: '49', minLength: 12, maxLength: 14 }, // Germany
    { code: '39', minLength: 12, maxLength: 13 }, // Italy
    { code: '52', minLength: 12, maxLength: 13 }, // Mexico
    { code: '57', minLength: 12, maxLength: 12 }, // Colombia
    { code: '56', minLength: 11, maxLength: 11 }, // Chile
    { code: '598', minLength: 11, maxLength: 12 }, // Uruguay
    { code: '595', minLength: 12, maxLength: 12 }, // Paraguay
    { code: '58', minLength: 12, maxLength: 12 }, // Venezuela
    { code: '51', minLength: 11, maxLength: 11 }, // Peru
    { code: '591', minLength: 11, maxLength: 12 }, // Bolivia
    { code: '593', minLength: 11, maxLength: 12 }, // Ecuador
  ];
  
  // Check if digits match a known country code pattern
  for (const pattern of countryCodePatterns) {
    if (digits.startsWith(pattern.code) && 
        digits.length >= pattern.minLength && 
        digits.length <= pattern.maxLength) {
      return `+${digits}`;
    }
  }
  
  // Check if it starts with 0 (some countries use 0 for domestic calls)
  let normalizedDigits = digits;
  if (digits.startsWith('0') && digits.length >= 10) {
    normalizedDigits = digits.substring(1); // Remove leading 0
  }
  
  // Default: Assume Brazilian number if 10-11 digits (DDD + number)
  // Brazilian numbers: 10 digits (landline) or 11 digits (mobile with 9)
  if (normalizedDigits.length >= 10 && normalizedDigits.length <= 11) {
    return `+55${normalizedDigits}`;
  }
  
  // For other lengths, still try to add +55 as fallback if reasonable
  if (normalizedDigits.length >= 8 && normalizedDigits.length <= 12) {
    return `+55${normalizedDigits}`;
  }
  
  // If nothing matches but we have enough digits, return with + prefix
  if (digits.length >= 10) {
    return `+${digits}`;
  }
  
  return null;
}

/**
 * Format phone number for display (more readable format)
 * Handles international numbers gracefully
 * @param phone - Normalized phone number with country code
 * @returns Formatted phone for display
 */
export function formatPhoneForDisplay(phone: string | null | undefined): string {
  if (!phone) return '';
  
  const digits = phone.replace(/\D/g, '');
  
  // Brazilian format: +55 (XX) XXXXX-XXXX or +55 (XX) XXXX-XXXX
  if (digits.startsWith('55') && (digits.length === 12 || digits.length === 13)) {
    const ddd = digits.substring(2, 4);
    if (digits.length === 13) {
      // Mobile: +55 (XX) XXXXX-XXXX
      const part1 = digits.substring(4, 9);
      const part2 = digits.substring(9, 13);
      return `+55 (${ddd}) ${part1}-${part2}`;
    } else {
      // Landline: +55 (XX) XXXX-XXXX
      const part1 = digits.substring(4, 8);
      const part2 = digits.substring(8, 12);
      return `+55 (${ddd}) ${part1}-${part2}`;
    }
  }
  
  // USA/Canada format: +1 (XXX) XXX-XXXX
  if (digits.startsWith('1') && digits.length === 11) {
    const area = digits.substring(1, 4);
    const part1 = digits.substring(4, 7);
    const part2 = digits.substring(7, 11);
    return `+1 (${area}) ${part1}-${part2}`;
  }
  
  // Default: return as-is with + prefix if not already present
  return phone.startsWith('+') ? phone : `+${phone}`;
}
