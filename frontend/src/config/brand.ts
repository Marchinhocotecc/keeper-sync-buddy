/**
 * Ayvro Brand Configuration
 * "Decision Engine for Your Money"
 * 
 * This file contains all brand-related constants for the Ayvro app.
 * Use these values for consistent branding across the application.
 */

export const APP_NAME = "Ayvro";
export const APP_TAGLINE = "Il tuo motore decisionale finanziario";
export const APP_TAGLINE_EN = "Decision Engine for Your Money";
export const SUPPORT_EMAIL = "support@ayvro.app";

/**
 * Ayvro Brand Colors
 * These are provided for reference - in components, always use
 * Tailwind CSS classes with semantic tokens (bg-primary, text-foreground, etc.)
 */
export const BRAND_COLORS = {
  // Primary - Teal petroleum
  primary: "#0F3D3E",
  primaryHsl: "181 62% 15%",
  
  primaryHover: "#145A5B",
  primaryHoverHsl: "181 62% 22%",
  
  primaryLight: "#1E6F70",
  primaryLightHsl: "181 57% 28%",

  // Backgrounds
  background: "#F8FAF9",
  backgroundHsl: "150 20% 97%",
  
  surface: "#FFFFFF",
  surfaceHsl: "0 0% 100%",

  // Text Colors
  textPrimary: "#1C1C1C",
  textPrimaryHsl: "0 0% 11%",
  
  textSecondary: "#6B7280",
  textSecondaryHsl: "220 9% 46%",

  // Semantic colors
  success: "#2E7D32",
  successHsl: "123 46% 34%",
  
  warning: "#E6A23C",
  warningHsl: "36 77% 57%",
  
  error: "#D64545",
  errorHsl: "0 62% 55%",
} as const;

/**
 * Ayvro Design Tokens
 */
export const DESIGN_TOKENS = {
  radiusSm: "0.375rem",
  radiusMd: "0.5rem",
  radiusLg: "0.75rem",
  radiusXl: "1rem",
  radius2xl: "1.25rem",
  
  shadowSm: "0 1px 2px rgba(0, 0, 0, 0.04)",
  shadowMd: "0 4px 16px rgba(0, 0, 0, 0.08)",
  shadowLg: "0 8px 24px rgba(0, 0, 0, 0.12)",
  shadowXl: "0 16px 48px rgba(0, 0, 0, 0.16)",
  
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
  themeColor: BRAND_COLORS.primary,
  backgroundColor: BRAND_COLORS.primary,
} as const;
