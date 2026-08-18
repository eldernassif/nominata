import AlternadorTema from '@/features/tema/components/AlternadorTema';

import { useListarPings } from '../api/useListarPings';
import { useRegistrarPing } from '../api/useRegistrarPing';
import { copy } from '../copy';
import FormularioPing from './FormularioPing';
import ListaPings from './ListaPings';

export default function TelaPrincipal() {
  const { data, isLoading, isError, refetch } = useListarPings();
  const { mutate, isPending, isError: escritaFalhou } = useRegistrarPing();

  return (
    <main>
      <header>
        <AlternadorTema />
      </header>
      <h1>{copy.titulo}</h1>

      <FormularioPing
        onEnviar={(texto) => mutate(texto)}
        enviando={isPending}
        erro={escritaFalhou ? copy.erroRegistrar : null}
      />

      <ListaPings
        pings={data ?? []}
        isLoading={isLoading}
        isError={isError}
        onRetry={() => {
          void refetch();
        }}
      />
    </main>
  );
}
