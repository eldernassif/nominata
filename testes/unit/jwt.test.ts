// Unit F0.4 — o helper de JWT é o que faz a suíte de contrato significar
// alguma coisa: se ele omitir app_metadata.conta_id ou assinar com outro
// segredo, a suíte inteira deixa de provar o que diz provar. Por isso as
// asserções aqui não são "a função devolve o que a função devolveu":
// o payload é decodificado e inspecionado campo a campo, e a assinatura é
// recomputada aqui com o segredo derivado do config.toml real do repositório.
import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import {
  assinarJwt,
  jwtAnon,
  jwtAutenticado,
  jwtSecretDoToml,
} from '../contrato/support';

interface PayloadJwt {
  iss?: string;
  role?: string;
  sub?: string;
  iat?: number;
  exp?: number;
  app_metadata?: { conta_id?: string };
}

function decodificarPayload(jwt: string): PayloadJwt {
  const payload = jwt.split('.')[1];
  if (payload === undefined) throw new Error('jwt sem payload');
  return JSON.parse(
    Buffer.from(payload, 'base64url').toString('utf8'),
  ) as PayloadJwt;
}

const TOML_REAL = readFileSync(
  new URL('../../supabase/config.toml', import.meta.url),
  'utf8',
);

describe('helper de JWT do contrato', () => {
  test('prefere o jwt_secret do config.toml ao fallback', () => {
    expect(jwtSecretDoToml('jwt_secret = "secret-do-toml-de-teste"')).toBe(
      'secret-do-toml-de-teste',
    );
  });

  test('usa o fallback local quando o toml nao define jwt_secret', () => {
    expect(jwtSecretDoToml('sem a chave aqui')).toBe(
      'super-secret-jwt-token-with-at-least-32-characters-long',
    );
  });

  test('assinatura valida com o segredo derivado do config.toml real', () => {
    const jwt = assinarJwt({ role: 'anon' });
    const [header, payload, assinatura] = jwt.split('.');
    if (header === undefined || payload === undefined || assinatura === undefined) {
      throw new Error('jwt malformado');
    }

    // recomputada aqui, não pelo helper: se o helper assinasse com outro
    // segredo (ex.: fallback direto ignorando o toml), esta comparação falha
    const esperada = createHmac('sha256', jwtSecretDoToml(TOML_REAL))
      .update(`${header}.${payload}`)
      .digest('base64url');
    expect(assinatura).toBe(esperada);
  });

  test('o config.toml real define jwt_secret distinto do fallback', () => {
    // Pré-condição anti-verde-por-acidente (achado da revisão da F0.4):
    // se o arquivo não definir a chave, o valor lido e o fallback embutido
    // são o MESMO, e o teste de assinatura acima não prova a origem do
    // segredo — a suíte continuaria verde com o helper ignorando o toml.
    expect(jwtSecretDoToml(TOML_REAL)).not.toBe(
      'super-secret-jwt-token-with-at-least-32-characters-long',
    );
  });

  test('jwtAutenticado com conta carrega app_metadata.conta_id no claim', () => {
    const payload = decodificarPayload(
      jwtAutenticado(
        '00000000-0000-0000-0000-0000000000aa',
        '00000000-0000-0000-0000-0000000000bb',
      ),
    );
    expect(payload.role).toBe('authenticated');
    expect(payload.sub).toBe('00000000-0000-0000-0000-0000000000aa');
    expect(payload.iss).toBe('supabase');
    expect(typeof payload.iat).toBe('number');
    expect(typeof payload.exp).toBe('number');
    // barra do contrato: sem este claim a autorização por tenant não existe
    // — se o helper omitir app_metadata, este teste fica vermelho
    expect(payload.app_metadata?.conta_id).toBe(
      '00000000-0000-0000-0000-0000000000bb',
    );
  });

  test('jwtAutenticado sem conta nao carrega app_metadata', () => {
    const payload = decodificarPayload(
      jwtAutenticado('00000000-0000-0000-0000-0000000000aa'),
    );
    expect(payload.app_metadata).toBeUndefined();
  });

  test('jwtAnon carrega role anon', () => {
    expect(decodificarPayload(jwtAnon).role).toBe('anon');
  });
});
