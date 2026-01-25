import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        success: {
          DEFAULT: "hsl(var(--success))",
          foreground: "hsl(var(--success-foreground))",
        },
        warning: {
          DEFAULT: "hsl(var(--warning))",
          foreground: "hsl(var(--warning-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
        // AYVO specific colors
        ayvo: {
          slate: "#1F242C",
          graphite: "#2A303A",
          "tint-gray": "#3A414D",
          neon: "#5B8CFF",
          "electric-blue": "#76A4FF",
          "ice-blue": "#CFE1FF",
          mint: "#4BE3C6",
          amber: "#FFB457",
          coral: "#FF6B6B",
          "text-primary": "#F4F7FA",
          "text-secondary": "#AEB4C2",
          "text-muted": "#6D7480",
          glow: "rgba(91, 140, 255, 0.15)",
        },
        // Legacy LUMI colors (for backward compatibility)
        lumi: {
          purple: "#5B8CFF",
          "purple-hover": "#76A4FF",
          deep: "#4A7AE8",
          surface: "#1F242C",
          panel: "#2A303A",
          line: "#3A414D",
          ink: "#F4F7FA",
          grey: "#AEB4C2",
          glow: "rgba(91, 140, 255, 0.15)",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        xl: "1rem",
        "2xl": "1.125rem",
        "3xl": "1.25rem",
      },
      boxShadow: {
        ayvo: "0 2px 8px rgba(91, 140, 255, 0.25)",
        "ayvo-card": "0 4px 16px rgba(0, 0, 0, 0.08)",
        "ayvo-nav": "0 1px 3px rgba(0, 0, 0, 0.05)",
        "ayvo-glow": "0 0 12px rgba(91, 140, 255, 0.15)",
        // Legacy
        lumi: "0 2px 8px rgba(91, 140, 255, 0.25)",
        "lumi-card": "0 4px 16px rgba(0, 0, 0, 0.08)",
        "lumi-nav": "0 1px 3px rgba(0, 0, 0, 0.05)",
        "lumi-glow": "0 0 12px rgba(91, 140, 255, 0.15)",
      },
      keyframes: {
        "accordion-down": {
          from: {
            height: "0",
          },
          to: {
            height: "var(--radix-accordion-content-height)",
          },
        },
        "accordion-up": {
          from: {
            height: "var(--radix-accordion-content-height)",
          },
          to: {
            height: "0",
          },
        },
        "fade-in": {
          from: { opacity: "0", transform: "translateY(6px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "scale-in": {
          from: { opacity: "0", transform: "scale(0.96)" },
          to: { opacity: "1", transform: "scale(1)" },
        },
        "pulse-glow": {
          "0%, 100%": { opacity: "0.4" },
          "50%": { opacity: "0.8" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "fade-in": "fade-in 0.25s ease-out forwards",
        "scale-in": "scale-in 0.2s ease-out forwards",
        "pulse-glow": "pulse-glow 2s ease-in-out infinite",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;
