import { defineConfig } from 'vite';

export default defineConfig({
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
