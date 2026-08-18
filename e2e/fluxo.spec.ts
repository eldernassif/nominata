// e2e do fecho da F0.8 (plano §F0.8.5): o app de pé no preview do Cloudflare
// (wrangler pages dev) fazendo o fluxo real do usuário, de ponta a ponta com o
// stack local — magic link via Mailpit (decisão do Elder), registrar_ping e
// listagem. Três asserções fortes além do fluxo: zero erro de console, zero
// resposta >=400 (cada uma cairia se a stack estivesse mal ligada), e o rewrite
// do SPA servindo rota interna sem 404. O usuário é provisionado pelo
// global-setup (e2e/global-setup.ts), reusando o padrão pg do contrato.
import { expect, test } from '@playwright/test';

const EMAIL_E2E = 'e2e@nominata.dev';
const MAILPIT_API = 'http://127.0.0.1:54324/api/v1';
const LINHA_VERIFY = /auth\/v1\/verify/;

interface MensagemMailpit {
  ID: string;
  To: Array<{ Address: string }>;
}

async function buscarEmail(emails: Array<{ Address: string }> | undefined): Promise<boolean> {
  return (emails ?? []).some((dest) => dest.Address === EMAIL_E2E);
}

async function extrairLinkDoEmail(id: string): Promise<string | null> {
  const resposta = await fetch(`${MAILPIT_API}/message/${id}`);
  const corpo = (await resposta.json()) as { Text?: string; HTML?: string };
  const alvo = [corpo.HTML, corpo.Text].filter((x): x is string => typeof x === 'string');
  for (const texto of alvo) {
    const href = texto.match(/href="([^"]*auth\/v1\/verify[^"]*)"/)?.[1];
    if (href) return href.replaceAll('&amp;', '&');
    const direto = texto.match(/https?:\/\/127\.0\.0\.1:54321\/auth\/v1\/verify[^"'\s<>]+/);
    if (direto) return direto[0];
  }
  return null;
}

// polling: o email do magic link leva um instante para cair no Mailpit. O link
// de verificação aponta para o GoTrue local (54321) que redireciona para o app.
async function aguardarLinkMagico(segundos = 20): Promise<string> {
  const fim = Date.now() + segundos * 1000;
  while (Date.now() < fim) {
    const lista = await fetch(`${MAILPIT_API}/messages?limit=20`);
    const dados = (await lista.json()) as { messages: MensagemMailpit[] };
    const mensagem = dados.messages.find((m) => buscarEmail(m.To));
    if (mensagem) {
      const link = await extrairLinkDoEmail(mensagem.ID);
      if (link) return link;
    }
    await new Promise((resolver) => setTimeout(resolver, 500));
  }
  throw new Error(`link magico nao encontrado no Mailpit para ${EMAIL_E2E}`);
}

// zero erro de console e zero resposta >=400 são o coração do e2e: a stack
// inteira (auth, RLS, CSP, rede) só passa se não chorar nada pelo caminho.
test('fluxo completo: magic link → registrar ping → listar, sem erro de console e sem resposta >=400', async ({
  page,
}) => {
  const errosConsole: string[] = [];
  const respostasRuins: string[] = [];
  page.on('console', (mensagem) => {
    if (mensagem.type() === 'error') errosConsole.push(mensagem.text());
  });
  page.on('pageerror', (erro) => errosConsole.push(`pageerror: ${erro.message}`));
  page.on('response', (resposta) => {
    if (resposta.status() >= 400) respostasRuins.push(`${resposta.status()} ${resposta.url()}`);
  });

  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'Entrar no Nominata' }),
  ).toBeVisible();
  await page.getByLabel('E-mail').fill(EMAIL_E2E);
  await page.getByRole('button', { name: 'Enviar link de acesso' }).click();
  await expect(page.getByRole('status')).toContainText('Enviamos um link');

  const link = await aguardarLinkMagico();
  expect(link).toContain('redirect_to');

  await page.goto(link);
  await expect(page.getByRole('heading', { name: 'Ping' })).toBeVisible();

  // anti-FOUC: o script externo (tema-inicial.js) carimbou data-theme no <html>
  await expect
    .poll(() => page.evaluate(() => document.documentElement.dataset.theme))
    .not.toBeUndefined();

  // estado VAZIO (nunca houve dado)
  await expect(page.getByText('Nenhum ping registrado ainda.')).toBeVisible();

  await page.getByLabel('O que está acontecendo?').fill('ping do e2e');
  await page.getByRole('button', { name: 'Registrar ping' }).click();
  await expect(page.getByText('ping do e2e')).toBeVisible();

  // as duas asserções que amarram a stack inteira
  expect(errosConsole).toEqual([]);
  expect(respostasRuins).toEqual([]);
});

test('resposta raiz traz CSP e HSTS (deploy config)', async ({ request }) => {
  const resposta = await request.get('/');
  expect(resposta.status()).toBe(200);
  const csp = resposta.headers()['content-security-policy'];
  expect(csp).toContain('connect-src');
  // connect-src fala com o Supabase local (troca o host na F0.10)
  expect(csp).toContain('http://127.0.0.1:54321');
  expect(resposta.headers()['strict-transport-security']).toBeTruthy();
});

test('rota interna fora de / devolve 200 (rewrite do SPA)', async ({ request }) => {
  const resposta = await request.get('/caminho-interno');
  expect(resposta.status()).toBe(200);
  expect(resposta.headers()['content-type']).toContain('text/html');
});
