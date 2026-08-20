// scripts/gerar-env-local.ts — F0.9 item (3): gerador portável (Node/TS) do
// .env.local, usável no CI (ubuntu-latest, sem PowerShell) e localmente.
// scripts/bootstrap.ps1 continua existindo para o fluxo local do Elder, mas
// deixa de ser a única fonte — e escreve o formato BRUTO de
// `supabase status -o env` (API_URL="...", ANON_KEY="..."), que
// src/shared/lib/supabase.ts não lê: o app espera
// import.meta.env.VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. Este script faz
// o mapeamento que faltava.
import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// -------- função pura (unit-tested) --------

function extrairChave(env: string, chave: string): string | undefined {
  return env.match(new RegExp(`^${chave}="([^"]+)"`, 'm'))?.[1];
}

export function gerarEnvLocal(env: string): string {
  const apiUrl = extrairChave(env, 'API_URL');
  const anonKey = extrairChave(env, 'ANON_KEY');
  const faltando: string[] = [];
  if (!apiUrl) faltando.push('API_URL');
  if (!anonKey) faltando.push('ANON_KEY');
  if (faltando.length > 0) {
    throw new Error(
      `gerar-env-local: "supabase status -o env" não trouxe ${faltando.join(', ')} — .env.local não foi escrito`,
    );
  }
  return `VITE_SUPABASE_URL=${apiUrl}\nVITE_SUPABASE_ANON_KEY=${anonKey}\n`;
}

// -------- I/O --------

function rodarPrincipal(): void {
  const env = execSync('npx supabase status -o env', { encoding: 'utf8' });
  const conteudo = gerarEnvLocal(env);
  const caminho = resolve(fileURLToPath(new URL('../', import.meta.url)), '.env.local');
  // writeFileSync com 'utf8' não grava BOM (diferente do Set-Content do PS
  // 5.1) — o CLI do Supabase recusa BOM ao ler arquivo de ambiente (F0.7).
  writeFileSync(caminho, conteudo, 'utf8');
  console.log(`gerado: ${caminho}`);
}

const executandoDireto =
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (executandoDireto) {
  rodarPrincipal();
}
