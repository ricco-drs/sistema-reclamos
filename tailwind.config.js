export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        dark: {
          bg: '#0F172A', // Slate 900
          panel: '#1E293B', // Slate 800
          border: '#334155', // Slate 700
          text: '#F8FAFC', // Slate 50
          muted: '#94A3B8', // Slate 400
        },
        primary: {
          400: '#38BDF8',
          500: '#0EA5E9',
          600: '#0284C7',
        }
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
