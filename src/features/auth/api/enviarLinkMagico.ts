import { supabase } from '@/shared/lib/supabase';

export async function enviarLinkMagico(
  email: string,
  emailRedirectTo: string,
): Promise<void> {
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo },
  });
  if (error) {
    throw error;
  }
}
