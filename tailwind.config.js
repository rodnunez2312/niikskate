/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './components/**/*.{js,vue,ts}',
    './layouts/**/*.vue',
    './pages/**/*.vue',
    './composables/**/*.{js,ts}',
    './plugins/**/*.{js,ts}',
    './app.vue',
  ],
  theme: {
    extend: {
      colors: {
        // NiikSkate Stained Glass Theme
        gold: {
          50: '#fefce8',
          100: '#fef9c3',
          200: '#fef08a',
          300: '#fde047',
          400: '#D4A04A',
          500: '#B8860B',
          600: '#A16207',
          700: '#854d0e',
          800: '#713f12',
          900: '#422006',
        },
        flame: {
          400: '#f87171',
          500: '#ef4444',
          600: '#C62828',
          700: '#b91c1c',
        },
        glass: {
          blue: '#1E88E5',
          green: '#43A047',
          purple: '#7B1FA2',
          orange: '#F57C00',
          red: '#C62828',
        },
        primary: {
          50: '#fefce8',
          100: '#fef9c3',
          200: '#fef08a',
          300: '#fde047',
          400: '#D4A04A',
          500: '#B8860B',
          600: '#A16207',
          700: '#854d0e',
          800: '#713f12',
          900: '#422006',
          950: '#2a1a06',
        },
        secondary: {
          50: '#f0fdf4',
          100: '#dcfce7',
          200: '#bbf7d0',
          300: '#86efac',
          400: '#4ade80',
          500: '#43A047',
          600: '#16a34a',
          700: '#15803d',
          800: '#166534',
          900: '#14532d',
          950: '#052e16',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
      spacing: {
        'safe-top': 'env(safe-area-inset-top)',
        'safe-bottom': 'env(safe-area-inset-bottom)',
        'safe-left': 'env(safe-area-inset-left)',
        'safe-right': 'env(safe-area-inset-right)',
      },
      minHeight: {
        'screen-safe': 'calc(100vh - env(safe-area-inset-top) - env(safe-area-inset-bottom))',
      },
      backgroundImage: {
        'glass-gradient': 'linear-gradient(135deg, #1E88E5 0%, #7B1FA2 25%, #C62828 50%, #F57C00 75%, #43A047 100%)',
        'gold-gradient': 'linear-gradient(135deg, #D4A04A 0%, #B8860B 100%)',
      },
    },
  },
  plugins: [],
}
