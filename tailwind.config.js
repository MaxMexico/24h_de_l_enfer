/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#0E1116',
        surface: '#161B24',
        raised: '#1D2431',
        line: '#262E3B',
        ink: '#E6EAF0',
        muted: '#78838F',
        dim: '#4A5460',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'monospace'],
        disp: ['Oswald', 'Inter', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
