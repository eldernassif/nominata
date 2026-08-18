import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import TelaLogin from '@/features/auth/components/TelaLogin';
import { enviarLinkMagico } from '@/features/auth/api/enviarLinkMagico';
import { entrarComGoogle } from '@/features/auth/api/entrarComGoogle';

vi.mock('@/features/auth/api/enviarLinkMagico');
vi.mock('@/features/auth/api/entrarComGoogle');

const enviarLinkMagicoMock = vi.mocked(enviarLinkMagico);
const entrarComGoogleMock = vi.mocked(entrarComGoogle);

describe('TelaLogin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    enviarLinkMagicoMock.mockResolvedValue(undefined);
  });

  it('renderiza o campo de e-mail e o botão Google', () => {
    render(<TelaLogin />);

    expect(screen.getByLabelText(/e-mail/i)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /continuar com google/i }),
    ).toBeInTheDocument();
  });

  it('envia o link mágico ao submeter um e-mail válido', async () => {
    const user = userEvent.setup();
    render(<TelaLogin />);

    await user.type(screen.getByLabelText(/e-mail/i), 'ana@empresa.com');
    await user.click(screen.getByRole('button', { name: /enviar link/i }));

    expect(enviarLinkMagicoMock).toHaveBeenCalledWith(
      'ana@empresa.com',
      expect.any(String),
    );
  });

  it('não chama a API com e-mail vazio', async () => {
    const user = userEvent.setup();
    render(<TelaLogin />);

    await user.click(screen.getByRole('button', { name: /enviar link/i }));

    expect(enviarLinkMagicoMock).not.toHaveBeenCalled();
  });

  it('mostra a confirmação após o envio', async () => {
    const user = userEvent.setup();
    render(<TelaLogin />);

    await user.type(screen.getByLabelText(/e-mail/i), 'ana@empresa.com');
    await user.click(screen.getByRole('button', { name: /enviar link/i }));

    expect(await screen.findByText(/enviamos um link/i)).toBeInTheDocument();
  });

  it('chama o OAuth do Google ao clicar no botão Google', async () => {
    const user = userEvent.setup();
    render(<TelaLogin />);

    await user.click(screen.getByRole('button', { name: /continuar com google/i }));

    expect(entrarComGoogleMock).toHaveBeenCalledTimes(1);
  });
});
