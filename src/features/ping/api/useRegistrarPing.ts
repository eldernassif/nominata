import { useMutation, useQueryClient } from '@tanstack/react-query';

import type { Ping } from './listarPings';
import { registrarPing } from './registrarPing';

export function useRegistrarPing() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: registrarPing,
    onMutate: async (texto) => {
      await queryClient.cancelQueries({ queryKey: ['pings'] });

      const anterior = queryClient.getQueryData<Ping[]>(['pings']);
      queryClient.setQueryData<Ping[]>(['pings'], (atual) => [
        {
          id: `otimista-${crypto.randomUUID()}`,
          texto,
          criado_em: new Date().toISOString(),
        },
        ...(atual ?? []),
      ]);

      return { anterior };
    },
    onError: (_erro, _texto, contexto) => {
      if (contexto?.anterior !== undefined) {
        queryClient.setQueryData<Ping[]>(['pings'], contexto.anterior);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['pings'] });
    },
  });
}
