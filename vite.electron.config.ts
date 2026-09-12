import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import electron from 'vite-plugin-electron/simple'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
const __dirname = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  root: 'electron/renderer',
  plugins: [
    vue(),
    electron({
      main: {
        entry: resolve(__dirname, 'electron/main/index.ts'),
        vite: {
          build: {
            outDir: resolve(__dirname, 'build/app/dist-electron'),
            // main 与 preload 共用目录；开发期重建 main 时不能删除 preload.mjs。
            emptyOutDir: false,
            minify: false,
            rolldownOptions: {
              external: ['better-sqlite3', 'sharp'],
              output: { entryFileNames: 'main.js' }
            }
          }
        },
        onstart(args) {
          args.startup(['.', '--no-sandbox', '--enable-logging'], { cwd: __dirname })
        }
      },
      preload: {
        input: { preload: resolve(__dirname, 'electron/preload/index.ts') },
        vite: {
          build: {
            outDir: resolve(__dirname, 'build/app/dist-electron'),
            emptyOutDir: false,
            minify: false,
            rolldownOptions: {
              external: ['electron'],
              output: {
                format: 'es',
                entryFileNames: '[name].mjs',
                chunkFileNames: '[name].mjs'
              }
            }
          }
        }
      }
    })
  ],
  build: {
    outDir: resolve(__dirname, 'build/app/dist'),
    emptyOutDir: true,
    rolldownOptions: {
      input: resolve(__dirname, 'electron/renderer/index.html')
    }
  }
})
