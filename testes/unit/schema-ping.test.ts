import { describe, expect, it } from 'vitest';

import { textoPingSchema } from '@/features/ping/schemas/ping';

describe('textoPingSchema', () => {
  it('aceita texto não vazio', () => {
    expect(textoPingSchema.safeParse('ping do dia').success).toBe(true);
  });

  it('rejeita texto vazio', () => {
    expect(textoPingSchema.safeParse('').success).toBe(false);
  });

  it('rejeita só espaços (trim antes do min)', () => {
    expect(textoPingSchema.safeParse('   ').success).toBe(false);
  });
});
