import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      '.wrangler/**',
      'supabase/**',
      'playwright-report/**',
      'test-results/**',
      '.evidencia/**',
      '.claude/**',
      'src/types/database.ts',
    ],
  },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    // Barreira do §8.6, por lint e não por disciplina: o cliente Supabase só é
    // importado em features/*/api/. Os blocos abaixo afrouxam (api) ou reforçam
    // (components) esta regra por padrão de caminho.
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/shared/lib/supabase'],
              message:
                'O cliente Supabase é importado apenas em features/*/api/. ' +
                'Mova a chamada de rede para lá (§8.6).',
            },
          ],
        },
      ],
    },
  },
  {
    // Único lugar onde o cliente Supabase é permitido.
    files: ['src/features/**/api/**'],
    rules: {
      'no-restricted-imports': 'off',
    },
  },
  {
    // Componentes recebem props, não sabem de rede nem de cache: nem Supabase,
    // nem TanStack Query (os hooks vivem em features/*/api/).
    files: ['src/**/components/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/shared/lib/supabase'],
              message:
                'O cliente Supabase é importado apenas em features/*/api/. ' +
                'Componente recebe props (§8.6).',
            },
            {
              group: ['@tanstack/react-query'],
              message:
                'components/ não importa @tanstack/react-query — o hook vive em ' +
                'features/*/api/ (§8.6).',
            },
          ],
        },
      ],
    },
  },
);
