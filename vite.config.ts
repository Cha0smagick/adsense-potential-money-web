import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: { target: 'es2022', outDir: 'dist', assetsDir: 'assets' },
  test: { include: ['test/**/*.test.ts'], environment: 'node' },
});
