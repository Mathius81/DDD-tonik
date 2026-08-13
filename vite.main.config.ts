import { defineConfig } from 'vite';

// https://vitejs.dev/config
export default defineConfig({
  build: {
    rollupOptions: {
      external: ['node:sqlite'],
      output: {
        // Ambele entry-uri sunt index.ts; forțăm nume distincte în .vite/build.
        entryFileNames: 'main.js',
      },
    },
  },
});
