import { useQuery } from '@tanstack/react-query';

import { listarPings } from './listarPings';

const TRINTA_SEGUNDOS = 30_000;

export function useListarPings() {
  return useQuery({
    queryKey: ['pings'],
    queryFn: listarPings,
    staleTime: TRINTA_SEGUNDOS,
    refetchOnWindowFocus: true,
  });
}
