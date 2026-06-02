/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
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
      },
    },
  },
  plugins: [],
};
