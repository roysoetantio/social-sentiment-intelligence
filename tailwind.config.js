/** @type {import('tailwindcss').Config} */
import defaultTheme from 'tailwindcss/defaultTheme'

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
        // Primary
        primary: {
          DEFAULT: '#000000',
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
  plugins: [],
}
