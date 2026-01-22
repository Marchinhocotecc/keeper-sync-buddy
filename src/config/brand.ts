/**
 * LUMI Brand Configuration
 * "Il tuo assistente di vita semplice e luminoso"
 * 
 * This file contains all brand-related constants for the LUMI app.
 * Use these values for consistent branding across the application.
 */

export const APP_NAME = "LUMI";
export const APP_TAGLINE = "Il tuo assistente di vita semplice e luminoso";
export const APP_TAGLINE_EN = "Your simple and bright life assistant";
export const SUPPORT_EMAIL = "support@lumi-app.com";

/**
 * LUMI Brand Colors
 * These are provided for reference - in components, always use
 * Tailwind CSS classes with semantic tokens (bg-primary, text-foreground, etc.)
 */
export const BRAND_COLORS = {
  // Primary - Lumi Glow
  primary: "#6C63FF",
  primaryHsl: "244 97% 69%",
  
  // Secondary - Lumi Sky  
  secondary: "#A39BFF",
  secondaryHsl: "246 100% 81%",
  
  // Primary Dark (for contrast)
  primaryDark: "#4B44CC",
  primaryDarkHsl: "244 55% 54%",
  
  // Background - Lumi Cream
  background: "#FDFCF9",
  backgroundHsl: "45 33% 98%",
  
  // Text colors
  foreground: "#1C1C1E",
  foregroundHsl: "240 6% 12%",
  
  textSecondary: "#575757",
  textSecondaryHsl: "0 0% 34%",
  
  // Semantic colors
  success: "#5FD38A",
  successHsl: "146 58% 60%",
  
  warning: "#F6D860",
  warningHsl: "47 90% 67%",
  
  error: "#FF6A6A",
  errorHsl: "0 100% 71%",
} as const;

/**
 * LUMI Design Tokens
 */
export const DESIGN_TOKENS = {
  // Border radius
  radiusSm: "0.5rem",   // 8px
  radiusMd: "0.75rem",  // 12px
  radiusLg: "1rem",     // 16px
  radiusXl: "1.25rem",  // 20px
  radius2xl: "1.5rem",  // 24px
  
  // Shadows
  shadowSm: "0 1px 3px 0 rgb(108 99 255 / 0.04)",
  shadowMd: "0 4px 12px -2px rgb(108 99 255 / 0.08)",
  shadowLg: "0 10px 30px -4px rgb(108 99 255 / 0.12)",
  shadowXl: "0 20px 50px -8px rgb(108 99 255 / 0.16)",
  
  // Transitions
  transitionBase: "all 0.2s ease",
  transitionSmooth: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
} as const;

/**
 * PWA Configuration
 */
export const PWA_CONFIG = {
  name: APP_NAME,
  shortName: APP_NAME,
  description: APP_TAGLINE,
  themeColor: BRAND_COLORS.primary,
  backgroundColor: BRAND_COLORS.background,
} as const;
