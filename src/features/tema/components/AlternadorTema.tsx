import { useTema } from '../api/useTema';
import type { TemaPreferido } from '../api/useTema';
import { copy } from '../copy';

const rotulos: Record<TemaPreferido, string> = {
  claro: copy.temaClaro,
  escuro: copy.temaEscuro,
  sistema: copy.temaSistema,
};

export default function AlternadorTema() {
  const { preferido, ciclar } = useTema();

  return (
    <button
      type="button"
      onClick={ciclar}
      className="border border-borda bg-superficie px-3 py-1 text-sm text-texto-suave"
    >
      {copy.botaoTema}: {rotulos[preferido]}
    </button>
  );
}
