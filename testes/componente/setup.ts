import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Sem `globals`, o auto-cleanup do Testing Library não é registrado sozinho.
afterEach(() => {
  cleanup();
});

// jsdom não implementa matchMedia. O hook do tema (F0.8.4) o exige; o shim
// abaixo cobre o mínimo que o AlternadorTema usa (sistema = claro estático).
if (typeof window !== 'undefined' && !window.matchMedia) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string): MediaQueryList => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

// localStorage global do Node 26 é experimental (exige --localstorage-file) e o
// jsdom não o expõe aqui. O tema persiste preferência nele (F0.8.4); o shim em
// memória aponta o mesmo objeto em window e no global — o teste usa o global, o
// hook usa window.localStorage.
class ArmazenamentoEmMemoria implements Storage {
  private mapa = new Map<string, string>();

  get length(): number {
    return this.mapa.size;
  }

  clear(): void {
    this.mapa.clear();
  }

  getItem(chave: string): string | null {
    return this.mapa.get(chave) ?? null;
  }

  key(indice: number): string | null {
    return [...this.mapa.keys()][indice] ?? null;
  }

  removeItem(chave: string): void {
    this.mapa.delete(chave);
  }

  setItem(chave: string, valor: string): void {
    this.mapa.set(chave, valor);
  }
}

const armazenamento = new ArmazenamentoEmMemoria();

if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'localStorage', {
    writable: true,
    value: armazenamento,
  });
  Object.defineProperty(globalThis, 'localStorage', {
    writable: true,
    value: armazenamento,
  });
}
