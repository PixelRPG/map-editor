import * as esbuild from 'esbuild'

await esbuild.build({
    entryPoints: ['src/main.ts'],
    bundle: true,
    outfile: 'dist/main.js',
    format: 'esm',
    platform: 'node',
    target: 'node22',
    banner: {
        js: '#!/usr/bin/env node',
    }
}) 