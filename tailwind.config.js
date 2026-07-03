/** @type {import('tailwindcss').Config} */
import defaultTheme from 'tailwindcss/defaultTheme'
import tailwindcssAnimate from 'tailwindcss-animate'

export default {
  content: [
    "./index.html",
    "./src/**/*.{js,jsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Canvas
        canvas: '#ffffff',
        'canvas-soft': '#fafafa',
        // Surfaces
        'surface-card': '#ffffff',
        'surface-strong': '#f0f0f3',
        'surface-dark': '#171717',
        'surface-dark-elevated': '#1a1a1a',
        // Text
        ink: '#171717',
        body: '#60646c',
        muted: 'rgb(120, 120, 129)',
        'muted-soft': '#cccccc',
        // Borders
        hairline: '#E6E6E8',
        'hairline-strong': '#E6E6E8',
        // Primary — DEFAULT now maps to the brand (shadcn `--primary`); `active` kept for existing usages
        primary: {
          DEFAULT: 'hsl(var(--primary) / <alpha-value>)',
          foreground: 'hsl(var(--primary-foreground) / <alpha-value>)',
          active: '#1a1a1a',
        },
        // On-dark
        'on-dark': '#ffffff',
        'on-dark-soft': '#b0b4ba',
        // Semantic
        'text-link': '#0d74ce',
        'sky-light': '#cfe7ff',
        'sky-mid': '#a8c8e8',
        // Status
        success: '#16a34a',
        error: '#eb8e90',
        warning: '#ab6400',
        // Sentiment / Brand (kept for chart colors)
        teal: '#19C9A5',
        orange: '#E97132',
        sky: '#1490EA',
        purple: '#732BCC',
        darktext: '#171717',
        // shadcn/ui semantic tokens (driven by CSS vars in index.css)
        background: 'hsl(var(--background) / <alpha-value>)',
        foreground: 'hsl(var(--foreground) / <alpha-value>)',
        card: {
          DEFAULT: 'hsl(var(--card) / <alpha-value>)',
          foreground: 'hsl(var(--card-foreground) / <alpha-value>)',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover) / <alpha-value>)',
          foreground: 'hsl(var(--popover-foreground) / <alpha-value>)',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary) / <alpha-value>)',
          foreground: 'hsl(var(--secondary-foreground) / <alpha-value>)',
        },
        'muted-foreground': 'hsl(var(--muted-foreground) / <alpha-value>)',
        accent: {
          DEFAULT: 'hsl(var(--accent) / <alpha-value>)',
          foreground: 'hsl(var(--accent-foreground) / <alpha-value>)',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive) / <alpha-value>)',
          foreground: 'hsl(var(--destructive-foreground) / <alpha-value>)',
        },
        border: 'hsl(var(--border) / <alpha-value>)',
        input: 'hsl(var(--input) / <alpha-value>)',
        ring: 'hsl(var(--ring) / <alpha-value>)',
      },
      fontFamily: {
        sans: ['Inter', ...defaultTheme.fontFamily.sans],
        mono: ['JetBrains Mono', ...defaultTheme.fontFamily.mono],
      },
      borderRadius: {
        xs: '4px',
        sm: '6px',
        md: '8px',
        lg: '12px',
        xl: '16px',
        xxl: '24px',
      },
      boxShadow: {
        card: '0 4px 12px rgba(0,0,0,0.04)',
      },
      keyframes: {
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'modal-in': {
          '0%': { opacity: '0', transform: 'scale(0.96) translateY(-8px)' },
          '100%': { opacity: '1', transform: 'scale(1) translateY(0)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.15s ease-out',
        'modal-in': 'modal-in 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
      },
    },
  },
  plugins: [tailwindcssAnimate],
}
