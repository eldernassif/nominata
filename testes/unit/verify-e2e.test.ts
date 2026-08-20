// Unit F0.8.6 — lógica de decisão pura do scripts/verify-e2e.ts, extraída no
// mesmo padrão do checar-drift.ts (pure functions testadas aqui, I/O testado
// pela execução real do script). Cobre os itens (2) e (4) da correção:
// (2) o gate do rewrite de SPA vira comportamental — falha se existir
//     404.html no build, não por conteúdo de texto no _redirects;
// (4) o preview do e2e precisa ser determinístico: uma marca por execução
//     confirma que a resposta vem do processo recém-subido, e o encerramento
//     robusto depende de identificar corretamente os PIDs presos na porta.
import { describe, expect, test } from 'vitest';
import { linhaDeMarca, marcaBate, pidsNaPorta, pidsNaPortaPosix, semArquivo404 } from '../../scripts/verify-e2e';

describe('item (2): gate comportamental do rewrite de SPA', () => {
  test('build sem 404.html está correto — Cloudflare Pages cai no fallback automático', () => {
    expect(semArquivo404(['index.html', '_headers', '_redirects', 'assets'])).toBe(true);
  });

  test('404.html no build desliga o fallback automático — falha', () => {
    expect(semArquivo404(['index.html', '404.html', '_headers'])).toBe(false);
  });
});

describe('item (4): marca de build por execução do preview', () => {
  test('linhaDeMarca produz um header indentado sob o bloco /* do _headers', () => {
    expect(linhaDeMarca('abc123')).toBe('  X-Preview-Marca: abc123');
  });

  test('marcaBate confere a marca recebida contra a gerada nesta execução', () => {
    expect(marcaBate('abc123', 'abc123')).toBe(true);
  });

  test('marca ausente ou de execução anterior não bate — preview velho não valida build novo', () => {
    expect(marcaBate(null, 'abc123')).toBe(false);
    expect(marcaBate('marca-velha', 'abc123')).toBe(false);
  });
});

describe('item (4): identificação de PIDs presos na porta do preview', () => {
  const SAIDA_NETSTAT = [
    '  Proto  Local Address          Foreign Address        State           PID',
    '  TCP    0.0.0.0:4173           0.0.0.0:0              LISTENING       21344',
    '  TCP    127.0.0.1:4173         127.0.0.1:52344        TIME_WAIT       0',
    '  TCP    [::]:4173              [::]:0                 LISTENING       21344',
    '  TCP    0.0.0.0:41730          0.0.0.0:0              LISTENING       99999',
    '  TCP    0.0.0.0:5432           0.0.0.0:0              LISTENING       555',
  ].join('\r\n');

  test('extrai o PID da porta exata, sem casar prefixo (4173 vs 41730)', () => {
    expect(pidsNaPorta(SAIDA_NETSTAT, 4173)).toEqual(['21344']);
  });

  test('ignora PID 0 (TIME_WAIT sem processo dono) e portas diferentes', () => {
    expect(pidsNaPorta(SAIDA_NETSTAT, 5432)).toEqual(['555']);
  });

  test('porta livre não devolve PID nenhum', () => {
    expect(pidsNaPorta(SAIDA_NETSTAT, 9999)).toEqual([]);
  });
});

describe('F0.9: identificação de PIDs presos na porta do preview em Linux/macOS (lsof -ti)', () => {
  test('extrai um PID por linha da saída do lsof', () => {
    expect(pidsNaPortaPosix('21344\n')).toEqual(['21344']);
  });

  test('extrai múltiplos PIDs, uma linha cada', () => {
    expect(pidsNaPortaPosix('21344\n21399\n')).toEqual(['21344', '21399']);
  });

  test('saída vazia (porta livre) não devolve PID nenhum', () => {
    expect(pidsNaPortaPosix('')).toEqual([]);
  });

  test('ignora linha em branco residual sem virar PID inválido', () => {
    expect(pidsNaPortaPosix('21344\n\n')).toEqual(['21344']);
  });
});
