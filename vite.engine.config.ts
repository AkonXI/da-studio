import { defineConfig } from 'vite'
import { resolve } from 'path'

export default defineConfig({
  build: {
    outDir: resolve(__dirname, 'build/engine'),
    emptyOutDir: true,
    lib: {
      entry: resolve(__dirname, 'src/engine/index.ts'),
      formats: ['es', 'cjs'],
      fileName: (format) => `index.${format === 'es' ? 'mjs' : 'cjs'}`
    },
    rolldownOptions: {
      external: []
    }
  }
})
