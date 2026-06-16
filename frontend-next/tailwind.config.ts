import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
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
          muted: "hsl(var(--primary-muted))",
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
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar))",
          border: "hsl(var(--sidebar-border))",
          foreground: "hsl(var(--sidebar-foreground))",
          muted: "hsl(var(--sidebar-muted))",
          active: "hsl(var(--sidebar-active))",
        },
        elevated: "hsl(var(--elevated))",
        success: "hsl(var(--success))",
        warning: "hsl(var(--warning))",
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        xl: "calc(var(--radius) + 4px)",
        "2xl": "calc(var(--radius) + 8px)",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "DM Sans", "system-ui", "-apple-system", "sans-serif"],
        mono: ["var(--font-mono)", "JetBrains Mono", "ui-monospace", "Menlo", "monospace"],
        display: ["var(--font-display)", "Playfair Display", "Georgia", "serif"],
      },
      boxShadow: {
        "elevation-sm": "var(--shadow-sm)",
        "elevation-md": "var(--shadow-md)",
        "elevation-lg": "var(--shadow-lg)",
        "glow": "var(--shadow-glow)",
        "glow-sm": "var(--shadow-glow-sm)",
      },
      fontSize: {
        "2xs": ["0.625rem", { lineHeight: "0.875rem" }],
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        shimmer: {
          "0%":   { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition:  "200% 0" },
        },
        "fade-in": {
          from: { opacity: "0" },
          to:   { opacity: "1" },
        },
        "fade-up": {
          from: { opacity: "0", transform: "translateY(10px)" },
          to:   { opacity: "1", transform: "translateY(0)" },
        },
        "fade-in-scale": {
          from: { opacity: "0", transform: "scale(0.97)" },
          to:   { opacity: "1", transform: "scale(1)" },
        },
        "slide-in-right": {
          from: { opacity: "0", transform: "translateX(12px)" },
          to:   { opacity: "1", transform: "translateX(0)" },
        },
        "pulse-status": {
          "0%, 100%": { opacity: "1" },
          "50%":      { opacity: "0.6" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%":      { transform: "translateY(-10px)" },
        },
        marquee: {
          "0%":   { transform: "translateX(0)" },
          "100%": { transform: "translateX(-50%)" },
        },
        "step-check": {
          from: { transform: "scale(0.5)", opacity: "0" },
          to:   { transform: "scale(1)",   opacity: "1" },
        },
        "loader-pulse": {
          "0%, 100%": { opacity: "0.4", transform: "scale(0.97)" },
          "50%":      { opacity: "1",   transform: "scale(1)" },
        },
        "particle-float": {
          "0%":   { transform: "translateY(0) translateX(0)",      opacity: "0.5" },
          "40%":  {                                                  opacity: "0.7" },
          "100%": { transform: "translateY(-120px) translateX(8px)", opacity: "0"  },
        },
        "blob-drift": {
          "0%, 100%": { transform: "translate(0px, 0px) scale(1)" },
          "25%":      { transform: "translate(28px, -22px) scale(1.04)" },
          "50%":      { transform: "translate(-12px, 26px) scale(0.97)" },
          "75%":      { transform: "translate(-26px, -8px) scale(1.02)" },
        },
        "flow-dot-v": {
          "0%":  { top: "-10%", opacity: "0" },
          "8%":  {              opacity: "1" },
          "88%": {              opacity: "1" },
          "100%": { top: "110%", opacity: "0" },
        },
      },
      animation: {
        "accordion-down":  "accordion-down 0.2s ease-out",
        "accordion-up":    "accordion-up 0.2s ease-out",
        shimmer:           "shimmer 1.5s infinite linear",
        "fade-in":         "fade-in 0.2s ease-out",
        "fade-up":         "fade-up 0.25s ease-out",
        "fade-in-scale":   "fade-in-scale 0.2s ease-out",
        "slide-in-right":  "slide-in-right 0.2s ease-out",
        "pulse-status":    "pulse-status 2.5s ease-in-out infinite",
        float:             "float 5s ease-in-out infinite",
        marquee:           "marquee 28s linear infinite",
        "step-check":      "step-check 0.3s cubic-bezier(0.34,1.56,0.64,1) forwards",
        "loader-pulse":     "loader-pulse 2s ease-in-out infinite",
        "particle-float":   "particle-float 11s linear infinite",
        "blob-drift":       "blob-drift 18s ease-in-out infinite",
        "flow-dot-v":       "flow-dot-v 1.4s linear infinite",
      },
    },
  },
  plugins: [],
};

export default config;
