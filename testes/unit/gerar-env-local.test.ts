// F0.9 item (3) — .env.local precisa de um gerador portável (Node/TS), não só
// scripts/bootstrap.ps1 (PowerShell, não roda no runner do CI). O achado que
// motiva a extração: bootstrap.ps1 grava o formato BRUTO de
// `supabase status -o env` (API_URL="...", ANON_KEY="...") mas
// src/shared/lib/supabase.ts lê `import.meta.env.VITE_SUPABASE_URL` e
// `VITE_SUPABASE_ANON_KEY` — o .env.local real desta máquina tinha esse
// mapeamento feito à mão, fora de qualquer script.
import { describe, expect, test } from 'vitest';
import { gerarEnvLocal } from '../../scripts/gerar-env-local';

describe('F0.9 item (3): gerarEnvLocal mapeia a saída de "supabase status -o env" para as chaves VITE_*', () => {
  const ENV_COMPLETO = [
    'ANON_KEY="chave-anon-jwt"',
    'API_URL="http://127.0.0.1:54321"',
    'DB_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres"',
  ].join('\n');

  test('base completa: gera VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY a partir de API_URL/ANON_KEY', () => {
    expect(gerarEnvLocal(ENV_COMPLETO)).toBe(
      'VITE_SUPABASE_URL=http://127.0.0.1:54321\nVITE_SUPABASE_ANON_KEY=chave-anon-jwt\n',
    );
  });

  test('falta API_URL: lança com o nome da chave ausente, nunca gera arquivo parcial', () => {
    const semApiUrl = 'ANON_KEY="chave-anon-jwt"';
    expect(() => gerarEnvLocal(semApiUrl)).toThrow(/API_URL/);
  });

  test('falta ANON_KEY: lança com o nome da chave ausente', () => {
    const semAnonKey = 'API_URL="http://127.0.0.1:54321"';
    expect(() => gerarEnvLocal(semAnonKey)).toThrow(/ANON_KEY/);
  });

  test('base vazia: lança citando as duas chaves', () => {
    expect(() => gerarEnvLocal('')).toThrow(/API_URL.*ANON_KEY|ANON_KEY.*API_URL/);
  });
});
