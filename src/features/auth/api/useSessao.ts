import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';

import { supabase } from '@/shared/lib/supabase';

export type EstadoSessao = Session | null | 'carregando';

export function useSessao(): EstadoSessao {
  const [sessao, setSessao] = useState<EstadoSessao>('carregando');

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      setSessao(data.session);
    });

    const { data: inscricao } = supabase.auth.onAuthStateChange(
      (_evento, novaSessao) => {
        setSessao(novaSessao);
      },
    );

    return () => inscricao.subscription.unsubscribe();
  }, []);

  return sessao;
}
