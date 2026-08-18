import { supabase } from '@/shared/lib/supabase';

export async function registrarPing(texto: string): Promise<void> {
  const { error } = await supabase.rpc('registrar_ping', { texto });
  if (error) throw error;
}
