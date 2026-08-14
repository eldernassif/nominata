// infra de teste de contrato (plano §9.5): conexão direta via pg para a
// fábrica/verificação de dados e JWT assinado para falar com o PostgREST
// local como o app falaria. Nenhum segredo real aqui: o jwt_secret local é o
// default público do stack supabase local quando o config.toml não o define.
import { createHmac, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import * as pg from 'pg';

const RAIZ = new URL('../../', import.meta.url);

export function jwtSecretDoToml(conteudo: string): string {
  const match = /^\s*jwt_secret\s*=\s*"([^"]+)"/m.exec(conteudo);
  // default do stack local do Supabase quando o config.toml não define jwt_secret
  return match?.[1] ?? 'super-secret-jwt-token-with-at-least-32-characters-long';
}

function jwtSecretLocal(): string {
  const toml = readFileSync(new URL('supabase/config.toml', RAIZ), 'utf8');
  return jwtSecretDoToml(toml);
}

const JWT_SECRET = jwtSecretLocal();
const REST_URL =
  process.env.SUPABASE_REST_URL ?? 'http://127.0.0.1:54321/rest/v1';
const DATABASE_URL =
  process.env.DATABASE_URL ??
  'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

function base64url(input: string): string {
  return Buffer.from(input).toString('base64url');
}

export function assinarJwt(claims: Record<string, unknown>): string {
  const agora = Math.floor(Date.now() / 1000);
  const header = { alg: 'HS256', typ: 'JWT' };
  const payload = { iss: 'supabase', iat: agora, exp: agora + 3600, ...claims };
  const corpo = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;
  const assinatura = createHmac('sha256', JWT_SECRET).update(corpo).digest('base64url');
  return `${corpo}.${assinatura}`;
}

export const jwtAnon = assinarJwt({ role: 'anon' });

export function jwtAutenticado(sub: string, contaId?: string): string {
  const claims: Record<string, unknown> = { role: 'authenticated', sub };
  if (contaId !== undefined) {
    // claim de tenant sempre em app_metadata (regra dura do §4.2), nunca
    // user_metadata — é o que o hook de access token grava.
    claims.app_metadata = { conta_id: contaId };
  }
  return assinarJwt(claims);
}

export const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 4 });

// O banco local é compartilhado entre suítes: o harness pgTAP (supabase test
// db) conta as linhas do canário assumindo banco limpo (a guarda da F0.3
// espera count(app.ping) = 2 e falhou com "have: 5" quando esta suíte deixou
// 3 pings residuais). DELETE direto não serve: o RLS é FORCE e nenhuma
// policy permissiva de DELETE existe para o papel postgres — o TRUNCATE é a
// via do dono da tabela (não passa por RLS). O seed é vazio, nada é perdido.
export async function truncarCanario(): Promise<void> {
  await pool.query(
    'truncate table app.usuario, app.ping_evento, app.ping, app.conta',
  );
}

export async function criarConta(nome: string): Promise<{ id: string; nome: string }> {
  const { rows } = await pool.query<{ id: string }>(
    `insert into app.conta (nome) values ($1) returning id`,
    [nome],
  );
  const id = rows[0]?.id;
  if (id === undefined) throw new Error('insert de conta nao retornou id');
  return { id, nome };
}

export async function criarUsuario(
  authUserId: string,
  contaId: string,
): Promise<{ id: string }> {
  const { rows } = await pool.query<{ id: string }>(
    `insert into app.usuario (auth_user_id, conta_id) values ($1, $2) returning id`,
    [authUserId, contaId],
  );
  const id = rows[0]?.id;
  if (id === undefined) throw new Error('insert de usuario nao retornou id');
  return { id };
}

export async function contarPings(contaId: string): Promise<number> {
  const { rows } = await pool.query<{ total: number }>(
    `select count(*)::int as total from app.ping where conta_id = $1`,
    [contaId],
  );
  return rows[0]?.total ?? 0;
}

export async function contarEventos(contaId: string): Promise<number> {
  const { rows } = await pool.query<{ total: number }>(
    `select count(*)::int as total from app.ping_evento where conta_id = $1`,
    [contaId],
  );
  return rows[0]?.total ?? 0;
}

export interface EventoLinha {
  tipo: string;
  operacao: string;
  ator_tipo: string;
  ator_usuario_id: string | null;
  ocorrido_em: Date;
  payload: Record<string, unknown> | null;
}

export async function ultimoEvento(contaId: string): Promise<EventoLinha | undefined> {
  const { rows } = await pool.query<EventoLinha>(
    `select tipo, operacao, ator_tipo, ator_usuario_id, ocorrido_em, payload
       from app.ping_evento where conta_id = $1 order by id desc limit 1`,
    [contaId],
  );
  return rows[0];
}

export function novoSub(): string {
  return randomUUID();
}

export function novoSufixo(): string {
  return Math.random().toString(36).slice(2, 10);
}

export async function rpc(body: unknown, jwt?: string): Promise<Response> {
  const headers: Record<string, string> = {
    apikey: jwtAnon,
    'content-type': 'application/json',
  };
  if (jwt !== undefined) headers.authorization = `Bearer ${jwt}`;
  return fetch(`${REST_URL}/rpc/registrar_ping`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}
