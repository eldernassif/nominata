import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import AlternadorTema from '@/features/tema/components/AlternadorTema';

const CHAVE_TEMA = 'nominata:tema';

describe('AlternadorTema', () => {
  beforeEach(() => {
    localStorage.clear();
    delete document.documentElement.dataset.theme;
  });

  it('carimba data-theme no <html> ao montar', () => {
    render(<AlternadorTema />);

    expect(document.documentElement).toHaveAttribute('data-theme', 'claro');
  });

  it('alterna o atributo data-theme ao clicar', async () => {
    localStorage.setItem(CHAVE_TEMA, 'claro');
    const user = userEvent.setup();

    render(<AlternadorTema />);
    expect(document.documentElement).toHaveAttribute('data-theme', 'claro');

    await user.click(screen.getByRole('button', { name: /tema/i }));

    expect(document.documentElement).toHaveAttribute('data-theme', 'escuro');
  });

  it('persiste a preferência no localStorage', async () => {
    const user = userEvent.setup();

    render(<AlternadorTema />);
    await user.click(screen.getByRole('button', { name: /tema/i }));

    expect(localStorage.getItem(CHAVE_TEMA)).toBe('claro');
  });
});
