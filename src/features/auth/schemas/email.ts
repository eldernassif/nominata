import { z } from 'zod';

// O mesmo schema valida o formulário e tipa o payload (plano §3). Texto de
// erro de UI fica em copy.ts, não aqui.
export const emailSchema = z.string().trim().min(1).email();

export type Email = z.infer<typeof emailSchema>;
