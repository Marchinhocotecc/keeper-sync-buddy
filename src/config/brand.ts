/**
 * Ayro Brand Configuration
 * "Intelligent productivity for ambitious minds"
 * 
 * This file contains all brand-related constants for the Ayro app.
 * Use these values for consistent branding across the application.
 */

export const APP_NAME = "Ayro";
export const APP_TAGLINE = "Il tuo assistente produttivo e intelligente";
export const APP_TAGLINE_EN = "Intelligent productivity for ambitious minds";
export const SUPPORT_EMAIL = "support@ayro.app";

/**
 * Ayro Brand Colors
 * These are provided for reference - in components, always use
 * Tailwind CSS classes with semantic tokens (bg-primary, text-foreground, etc.)
 */
export const BRAND_COLORS = {
  // Backgrounds
  slate: "#1F242C",
  slateHsl: "216 17% 15%",
  
  graphite: "#2A303A",
  graphiteHsl: "216 15% 20%",
  
  tintGray: "#3A414D",
  tintGrayHsl: "216 13% 26%",
  
  // Accent Colors
  neon: "#5B8CFF",
  neonHsl: "220 100% 68%",
  
  electricBlue: "#76A4FF",
  electricBlueHsl: "220 100% 73%",
  
  iceBlue: "#CFE1FF",
  iceBlueHsl: "218 100% 91%",
  
  // Text Colors
  textPrimary: "#F4F7FA",
  textPrimaryHsl: "214 25% 97%",
  
  textSecondary: "#AEB4C2",
  textSecondaryHsl: "218 12% 72%",
  
  textMuted: "#6D7480",
  textMutedHsl: "218 8% 46%",
  
  // Semantic colors
  success: "#4BE3C6",
  successHsl: "168 72% 59%",
  
  warning: "#FFB457",
  warningHsl: "32 100% 67%",
  
  error: "#FF6B6B",
  errorHsl: "0 100% 71%",
} as const;

/**
 * Ayro Design Tokens
 */
export const DESIGN_TOKENS = {
  // Border radius - clean, modern
  radiusSm: "0.375rem",  // 6px
  radiusMd: "0.5rem",    // 8px
  radiusLg: "0.75rem",   // 12px
  radiusXl: "1rem",      // 16px
  radius2xl: "1.25rem",  // 20px
  
  // Shadows - subtle, professional
  shadowSm: "0 1px 2px rgba(0, 0, 0, 0.04)",
  shadowMd: "0 4px 16px rgba(0, 0, 0, 0.08)",
  shadowLg: "0 8px 24px rgba(0, 0, 0, 0.12)",
  shadowXl: "0 16px 48px rgba(0, 0, 0, 0.16)",
  
  // Transitions - snappy
  transitionBase: "all 0.15s ease",
  transitionSmooth: "all 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
} as const;

/**
 * PWA Configuration
 */
export const PWA_CONFIG = {
  name: APP_NAME,
  shortName: APP_NAME,
  description: APP_TAGLINE,
  themeColor: BRAND_COLORS.neon,
  backgroundColor: BRAND_COLORS.slate,
} as const;
