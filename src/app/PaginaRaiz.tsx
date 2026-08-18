import { useSessao } from '@/features/auth/api/useSessao';
import TelaLogin from '@/features/auth/components/TelaLogin';
import TelaPrincipal from '@/features/ping/components/TelaPrincipal';

export default function PaginaRaiz() {
  const sessao = useSessao();

  if (sessao === 'carregando') {
    return null;
  }

  if (sessao) {
    return <TelaPrincipal />;
  }

  return <TelaLogin />;
}
