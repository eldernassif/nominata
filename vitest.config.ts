import { defineConfig } from 'vitest/config';

export default defineConfig({
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
    ],
  },
});
