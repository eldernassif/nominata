import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import FormularioPing from '@/features/ping/components/FormularioPing';

describe('FormularioPing', () => {
  it('chama onEnviar com o texto ao submeter', async () => {
    const onEnviar = vi.fn();
    const user = userEvent.setup();

    render(<FormularioPing onEnviar={onEnviar} enviando={false} erro={null} />);

    await user.type(screen.getByLabelText(/acontecendo/i), 'ping do dia');
    await user.click(screen.getByRole('button', { name: /registrar ping/i }));

    expect(onEnviar).toHaveBeenCalledWith('ping do dia');
  });

  it('não chama onEnviar com texto vazio', async () => {
    const onEnviar = vi.fn();
    const user = userEvent.setup();

    render(<FormularioPing onEnviar={onEnviar} enviando={false} erro={null} />);

    await user.click(screen.getByRole('button', { name: /registrar ping/i }));

    expect(onEnviar).not.toHaveBeenCalled();
  });

  it('desabilita o botão enquanto envia', () => {
    render(<FormularioPing onEnviar={vi.fn()} enviando={true} erro={null} />);

    expect(
      screen.getByRole('button', { name: /registrar ping/i }),
    ).toBeDisabled();
  });

  it('mostra o erro de escrita passado por prop', () => {
    render(
      <FormularioPing
        onEnviar={vi.fn()}
        enviando={false}
        erro="Não foi possível registrar o ping."
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Não foi possível registrar o ping.',
    );
  });
});
