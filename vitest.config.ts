import { fileURLToPath, URL } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          environment: 'node',
          include: ['testes/unit/**/*.test.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'contrato',
          environment: 'node',
          include: ['testes/contrato/**/*.test.ts'],
          testTimeout: 30_000,
        },
      },
      {
        extends: true,
        test: {
          name: 'componente',
          environment: 'jsdom',
          include: ['testes/componente/**/*.test.tsx'],
          setupFiles: ['testes/componente/setup.ts'],
        },
      },
    ],
  },
});
