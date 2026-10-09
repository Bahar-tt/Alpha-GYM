/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        gold: {
          50: '#fdf8e8',
          100: '#f9edc4',
          200: '#f3d98a',
          300: '#ecc34f',
          400: '#e5ac2a',
          500: '#d4a843',
          600: '#b8862a',
          700: '#936524',
          800: '#7a5224',
          900: '#6a4422',
        },
        brand: {
          50: '#f0f7ff',
          100: '#e0effe',
          200: '#b9dffd',
          300: '#7cc5fb',
          400: '#36a7f6',
          500: '#0c8ce7',
          600: '#006fc5',
          700: '#0158a0',
          800: '#064b84',
          900: '#0b3f6e',
        },
      },
      boxShadow: {
        soft: '0 4px 24px -4px rgba(15, 23, 42, 0.08)',
        card: '0 1px 3px rgba(15,23,42,0.04), 0 8px 24px -8px rgba(15,23,42,0.08)',
        'card-hover': '0 8px 32px -8px rgba(15,23,42,0.14)',
      },
      borderRadius: {
        '2xl': '1rem',
        '3xl': '1.25rem',
      },
    },
  },
  plugins: [],
};
