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
          // F0.9: src/shared/lib/supabase.ts lança no import se
          // VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY faltarem — e a suíte de
          // componente é UI pura (enviarLinkMagico sempre mockado, zero
          // chamada de rede real), então nunca deveria depender do .env.local
          // da máquina. Achado em CI real (job estatico, sem supabase start):
          // passava aqui só porque esta máquina sempre tem .env.local no
          // disco. Valor fixo e falso deixa local e CI idênticos.
          env: {
            VITE_SUPABASE_URL: 'http://127.0.0.1:54321',
            VITE_SUPABASE_ANON_KEY: 'chave-fake-para-teste-de-componente-sem-rede',
          },
        },
      },
    ],
  },
});
