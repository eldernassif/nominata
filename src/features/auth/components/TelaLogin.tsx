import { useState } from 'react';
import type { FormEvent } from 'react';

import AlternadorTema from '@/features/tema/components/AlternadorTema';

import { entrarComGoogle } from '../api/entrarComGoogle';
import { enviarLinkMagico } from '../api/enviarLinkMagico';
import { copy } from '../copy';
import { emailSchema } from '../schemas/email';

export default function TelaLogin() {
  const [email, setEmail] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);

  async function handleSubmit(evento: FormEvent) {
    evento.preventDefault();
    setErro(null);

    const resultado = emailSchema.safeParse(email);
    if (!resultado.success) {
      setErro(copy.erroEmailInvalido);
      return;
    }

    setEnviando(true);
    try {
      await enviarLinkMagico(resultado.data, window.location.origin);
      setEnviado(true);
    } catch {
      setErro(copy.erroGenerico);
    } finally {
      setEnviando(false);
    }
  }

  async function handleGoogle() {
    setErro(null);
    try {
      await entrarComGoogle();
    } catch {
      setErro(copy.erroGenerico);
    }
  }

  if (enviado) {
    return <p role="status">{copy.enviado}</p>;
  }

  return (
    <main>
      <header>
        <AlternadorTema />
      </header>
      <h1>{copy.titulo}</h1>
      <p>{copy.subtitulo}</p>

      <form
        onSubmit={(evento) => {
          void handleSubmit(evento);
        }}
        noValidate
      >
        <label htmlFor="email">{copy.rotuloEmail}</label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={copy.placeholderEmail}
        />
        <button type="submit" disabled={enviando}>
          {enviando ? copy.enviando : copy.botaoEntrar}
        </button>
      </form>

      <button
        type="button"
        onClick={() => {
          void handleGoogle();
        }}
      >
        {copy.botaoGoogle}
      </button>

      {erro && <p role="alert">{erro}</p>}
    </main>
  );
}
