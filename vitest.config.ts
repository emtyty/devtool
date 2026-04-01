import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';
import type { Plugin } from 'vite';

/** Handles Vite-specific `?url` and `.wasm` asset imports in the test environment */
const wasmUrlPlugin: Plugin = {
  name: 'wasm-url-mock',
  resolveId(id) {
    if (id.includes('.wasm')) return '\0virtual:wasm-url';
  },
  load(id) {
    if (id === '\0virtual:wasm-url') return 'export default "/mock.wasm"';
  },
};

export default defineConfig({
  plugins: [react(), wasmUrlPlugin],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    // Exclude E2E specs — those run exclusively under Playwright
    exclude: ['**/node_modules/**', 'tests/e2e/**'],
    coverage: {
      provider: 'v8',
      include: ['utils/**', 'lib/**', 'components/**'],
      exclude: ['node_modules', 'tests/**'],
      reporter: ['text', 'html'],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
});
