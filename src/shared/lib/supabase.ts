import { createClient } from '@supabase/supabase-js';

import type { Database } from '@/types/database';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error(
    'Faltam VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY — defina-as em .env.local.',
  );
}

// Único cliente Supabase do app. Importado apenas por features/*/api/ (barreira
// de lint do §8.6). O schema padrão é `api` — o `public` não é exposto.
export const supabase = createClient<Database, 'api'>(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
  db: {
    schema: 'api',
  },
});
