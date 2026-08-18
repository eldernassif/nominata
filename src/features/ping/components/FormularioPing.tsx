import { useState } from 'react';
import type { FormEvent } from 'react';

import { copy } from '../copy';
import { textoPingSchema } from '../schemas/ping';

interface Props {
  onEnviar: (texto: string) => void;
  enviando: boolean;
  erro: string | null;
}

export default function FormularioPing({ onEnviar, enviando, erro }: Props) {
  const [texto, setTexto] = useState('');
  const [erroLocal, setErroLocal] = useState<string | null>(null);

  function handleSubmit(evento: FormEvent) {
    evento.preventDefault();
    setErroLocal(null);

    const resultado = textoPingSchema.safeParse(texto);
    if (!resultado.success) {
      setErroLocal(copy.erroTextoVazio);
      return;
    }

    onEnviar(resultado.data);
    setTexto('');
  }

  return (
    <form onSubmit={handleSubmit}>
      <label htmlFor="novo-ping">{copy.rotuloNovoPing}</label>
      <input
        id="novo-ping"
        type="text"
        value={texto}
        onChange={(evento) => setTexto(evento.target.value)}
        placeholder={copy.placeholderNovoPing}
      />
      <button type="submit" disabled={enviando}>
        {copy.botaoRegistrar}
      </button>
      {(erroLocal ?? erro) && <p role="alert">{erroLocal ?? erro}</p>}
    </form>
  );
}
