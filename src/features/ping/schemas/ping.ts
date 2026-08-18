import { z } from 'zod';

export const textoPingSchema = z.string().trim().min(1);

export type TextoPing = z.infer<typeof textoPingSchema>;
