import { supabase } from '@/shared/lib/supabase';

export interface Ping {
  id: string;
  texto: string;
  criado_em: string;
}

export async function listarPings(): Promise<Ping[]> {
  const { data, error } = await supabase
    .from('v_ping')
    .select('id, texto, criado_em')
    .order('criado_em', { ascending: false });

  if (error) throw error;

  // A view não propaga NOT NULL ao tipo do PostgREST, mas app.ping tem as três
  // colunas NOT NULL — o mapa converte sem mentir para o tipo do domínio.
  return (data ?? []).map((linha) => ({
    id: linha.id ?? '',
    texto: linha.texto ?? '',
    criado_em: linha.criado_em ?? '',
  }));
}
