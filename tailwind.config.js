/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./packages/renderer/src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: {
          primary: '#0a0a0a',
          secondary: '#141414',
          tertiary: '#1e1e1e',
        },
        text: {
          primary: '#e5e5e5',
          secondary: '#a3a3a3',
        },
        border: '#2a2a2a',
        accent: '#3b82f6',
      },
    },
  },
  plugins: [],
}
