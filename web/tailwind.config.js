/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        adel: {
          50: '#eef0ff',
          100: '#dfe3ff',
          200: '#c5caff',
          300: '#a2a5ff',
          400: '#8580ff',
          500: '#6c63ff',
          600: '#5a42f5',
          700: '#4c35d8',
          800: '#3e2eae',
          900: '#362c89',
          950: '#201950',
        },
      },
    },
  },
  plugins: [],
}
