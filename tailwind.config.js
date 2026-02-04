/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        ocean: {
          light: '#006994',
          DEFAULT: '#004d70',
          dark: '#00334e',
        },
      },
    },
  },
  plugins: [],
}
