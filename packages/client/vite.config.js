import { defineConfig } from 'vite'
import { createFilter } from '@rollup/pluginutils';
import glsl from 'vite-plugin-glsl';

function cssAsRaw() {
  const filter = createFilter('**/*.css');

  return {
    name: 'css-as-raw',
    transform(code, id) {
      if (filter(id)) {
        return {
          code: `export default ${JSON.stringify(code)};`,
          map: { mappings: '' }
        };
      }
    }
  };
}

export default defineConfig({
  plugins: [glsl()],
  define: {
    'process.env.__EX_VERSION': JSON.stringify('0.0.1-custom'),
    'process.env.NODE_ENV': JSON.stringify('development')
  },
  // logLevel: 'info',
  build: {
    outDir: 'dist',
    cssCodeSplit: true,
    publicDir: 'dist',
    minify: false,
    // lib: {
    //   entry: 'index.html',
    //   formats: ['esm'],
    //   name: 'client',
    // },
    resolve: {
      mainFields: ['module', 'main'],
    },
    sourcemap: true,
    emptyOutDir: false,
    target: 'esnext',
    assetsInclude: ['**/*.tmx'],
    rollupOptions: {
      plugins: [cssAsRaw()],
    },
  },
})
