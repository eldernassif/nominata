import { supabase } from '@/shared/lib/supabase';

export async function entrarComGoogle(): Promise<void> {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin },
  });
  if (error) {
    throw error;
  }
}
