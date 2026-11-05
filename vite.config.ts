import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  base: '/',
  resolve: {
    alias: {
      '@core': resolve(__dirname, 'src/core'),
      '@db': resolve(__dirname, 'src/db'),
      '@canvas': resolve(__dirname, 'src/canvas'),
      '@ui': resolve(__dirname, 'src/ui'),
      '@state': resolve(__dirname, 'src/state'),
      '@history': resolve(__dirname, 'src/history'),
      '@io': resolve(__dirname, 'src/io'),
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    minify: 'esbuild',
    target: 'es2020',
  },
  server: {
    port: 5173,
    open: true,
  },
});
