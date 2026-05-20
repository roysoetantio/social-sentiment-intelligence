/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,jsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#2940BE',
          light: '#3d55d4',
          dark: '#1a2a8a',
          darker: '#0d1a6e',
        },
        sky: '#1490EA',
        purple: '#732BCC',
        teal: '#19C9A5',
        orange: '#E97132',
        darktext: '#313231',
      },
      fontFamily: {
        sans: ['DM Sans', 'sans-serif'],
        display: ['Playfair Display', 'serif'],
      },
    },
  },
  plugins: [],
}
