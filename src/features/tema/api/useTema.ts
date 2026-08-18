import { useEffect, useState } from 'react';

export type TemaPreferido = 'claro' | 'escuro' | 'sistema';
export type TemaEfetivo = 'claro' | 'escuro';

const CHAVE_TEMA = 'nominata:tema';

function temaDoSistema(): TemaEfetivo {
  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'escuro'
    : 'claro';
}

function preferidoInicial(): TemaPreferido {
  const gravado = window.localStorage.getItem(CHAVE_TEMA);
  return gravado === 'claro' || gravado === 'escuro' || gravado === 'sistema'
    ? gravado
    : 'sistema';
}

function aplicar(preferido: TemaPreferido): TemaEfetivo {
  const efetivo = preferido === 'sistema' ? temaDoSistema() : preferido;
  document.documentElement.dataset.theme = efetivo;
  return efetivo;
}

export function useTema() {
  const [preferido, setPreferido] = useState<TemaPreferido>(preferidoInicial);

  useEffect(() => {
    aplicar(preferido);
    window.localStorage.setItem(CHAVE_TEMA, preferido);

    if (preferido !== 'sistema') return;

    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const aoMudarSistema = (evento: MediaQueryListEvent) => {
      aplicar(evento.matches ? 'escuro' : 'claro');
    };
    mql.addEventListener('change', aoMudarSistema);
    return () => mql.removeEventListener('change', aoMudarSistema);
  }, [preferido]);

  function ciclar() {
    setPreferido((atual) =>
      atual === 'sistema' ? 'claro' : atual === 'claro' ? 'escuro' : 'sistema',
    );
  }

  return { preferido, ciclar };
}
