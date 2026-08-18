import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { Ping } from '@/features/ping/api/listarPings';
import ListaPings from '@/features/ping/components/ListaPings';

const pingA: Ping = {
  id: '1',
  texto: 'ping da manhã',
  criado_em: '2026-08-17T10:00:00Z',
};
const pingB: Ping = {
  id: '2',
  texto: 'ping da tarde',
  criado_em: '2026-08-17T15:00:00Z',
};

describe('ListaPings', () => {
  it('mostra os pings quando há dados', () => {
    render(
      <ListaPings
        pings={[pingA, pingB]}
        isLoading={false}
        isError={false}
        onRetry={vi.fn()}
      />,
    );

    expect(screen.getByText('ping da manhã')).toBeInTheDocument();
    expect(screen.getByText('ping da tarde')).toBeInTheDocument();
  });

  it('mostra o estado VAZIO quando nunca houve ping', () => {
    render(
      <ListaPings pings={[]} isLoading={false} isError={false} onRetry={vi.fn()} />,
    );

    expect(screen.getByText(/nenhum ping/i)).toBeInTheDocument();
  });

  it('mostra o estado de ERRO com ação de tentar novamente', () => {
    render(
      <ListaPings pings={[]} isLoading={true} isError={true} onRetry={vi.fn()} />,
    );

    expect(
      screen.getByRole('button', { name: /tentar novamente/i }),
    ).toBeInTheDocument();
  });
});
