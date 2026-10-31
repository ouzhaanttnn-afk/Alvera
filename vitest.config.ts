import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    setupFiles: ['./tests/setup.ts'],
    testTimeout: 30000,
    fileParallelism: false,
  },
  resolve: {
    alias: { 'server-only': new URL('./tests/masak-raporu/server-only.ts', import.meta.url).pathname, '@': new URL('./src', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1') },
  },
});
