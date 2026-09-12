import type { Config } from 'tailwindcss'

export default {
  content: [
    './dev/index.html',
    './dev/**/*.{vue,js,ts,jsx,tsx}',
    './electron/renderer/index.html',
    './electron/renderer/**/*.{vue,js,ts,jsx,tsx}',
    './src/**/*.{vue,js,ts,jsx,tsx}'
  ],
  theme: {
    extend: {}
  },
  plugins: []
} satisfies Config
