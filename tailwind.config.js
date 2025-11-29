/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{vue,js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        farm: {
          50: '#fdfbf7',
          100: '#f7f4e9',
          200: '#ede5cb',
          300: '#e0d0a4',
          400: '#d1b678',
          500: '#c59e55',
          600: '#b88545',
          700: '#99683a',
          800: '#7f5535',
          900: '#67462e',
          950: '#372417',
        },
        nature: {
          50: '#f2fcf5',
          100: '#e1f8e8',
          200: '#c3eed4',
          300: '#94deb6',
          400: '#5cc592',
          500: '#36a778',
          600: '#268660',
          700: '#216b4f',
          800: '#1e5541',
          900: '#194637',
          950: '#0d2820',
        }
      }
    },
  },
  plugins: [],
}
