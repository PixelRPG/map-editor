import { defineConfig } from 'vite'

export default defineConfig({
  css: {
    transformer: 'lightningcss',
  },
  build: {
    assetsDir: '.',
    outDir: 'dist',
    target: 'firefox91',
    minify: false,
    rollupOptions: {
      input: 'src/main.ts',
      output: {
        entryFileNames: 'main.js',
      },
      external: [new RegExp('^gi://*', 'i'), 'system'],
    },
    esbuild: {
      external: ['jsdom', 'react'],
    },
    cssMinify: 'lightningcss',
  },
})
