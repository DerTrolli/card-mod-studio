import { defineConfig } from 'vite';
import { readFileSync } from 'fs';

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8')) as { version: string };

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  build: {
    lib: {
      entry: 'src/card-mod-studio.ts',
      formats: ['es'],
      fileName: () => 'card-mod-studio.js',
    },
    rollupOptions: {
      // Bundle everything — HA does not expose Lit or other libs as shared modules
      external: [],
      output: {
        // Single flat bundle, no chunks
        inlineDynamicImports: true,
      },
    },
    // Keep readable output during development phase
    minify: false,
    sourcemap: true,
    target: 'es2022',
  },
});
