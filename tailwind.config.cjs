/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './index.html',
    './App.tsx',
    './index.tsx',
    './components/**/*.{ts,tsx}',
    './hooks/**/*.{ts,tsx}',
    './services/**/*.{ts,tsx}',
    './src/**/*.{js,ts,jsx,tsx}'
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
        serif: ['Playfair Display', 'serif']
      },
      colors: {
        vivi: {
          purple: '#a855f7',
          blue: '#3b82f6'
        }
      },
      animation: {
        glow: 'glow 2s ease-in-out infinite alternate',
        'gradient-xy': 'gradient-xy 6s ease infinite',
        'pulse-slow': 'pulse-slow 4s cubic-bezier(0.4, 0, 0.6, 1) infinite'
      },
      keyframes: {
        glow: {
          '0%': { textShadow: '0 0 10px rgba(168, 85, 247, 0.5)' },
          '100%': { textShadow: '0 0 20px rgba(59, 130, 246, 0.8), 0 0 10px rgba(168, 85, 247, 0.5)' }
        },
        'gradient-xy': {
          '0%, 100%': {
            backgroundSize: '400% 400%',
            backgroundPosition: 'left center'
          },
          '50%': {
            backgroundSize: '200% 200%',
            backgroundPosition: 'right center'
          }
        },
        'pulse-slow': {
          '0%, 100%': { opacity: 1 },
          '50%': { opacity: 0.4 }
        }
      }
    }
  },
  plugins: []
};
