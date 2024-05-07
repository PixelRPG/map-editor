import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    outDir: 'dist',
    lib: {
      entry: 'index.html',
      formats: ['esm'],
      name: 'client',
    },
    target: 'esnext',
  },
})
