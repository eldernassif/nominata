import type { Ping } from '../api/listarPings';
import { copy } from '../copy';

interface Props {
  pings: Ping[];
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
}

export default function ListaPings({
  pings,
  isLoading,
  isError,
  onRetry,
}: Props) {
  if (isError) {
    return (
      <section>
        <p role="alert">{copy.listaErro}</p>
        <button type="button" onClick={onRetry}>
          {copy.tentarNovamente}
        </button>
      </section>
    );
  }

  if (isLoading) {
    return null;
  }

  if (pings.length === 0) {
    return <p>{copy.listaVazia}</p>;
  }

  return (
    <ul>
      {pings.map((ping) => (
        <li key={ping.id}>{ping.texto}</li>
      ))}
    </ul>
  );
}
