# Nominata — repositório de código

CRM de indicação (referral) para funil outbound. Modela a indicação como relação real entre
duas pessoas, formando um grafo navegável, e devolve toda manhã a lista de quem falar hoje
com a mensagem de WhatsApp pronta.

Multi-tenant por design desde a primeira migration (`conta_id` + RLS). **v1 é só para um
usuário**: zero UI de signup, convite ou cobrança.

## Fronteira de repositório

**Este repositório é o código. O plano NÃO está aqui.**

| Aqui (`D:\claude\nominata\`) | Lá (`D:\claude\ratos-os-framework\projetos\crm-personalizado\`) |
|---|---|
| Migrations, funções, frontend, testes, CI | Plano, decisões de produto, contexto vivo, backlog |
| Segredos em GitHub Secrets | Notas de ICP que alimentam o schema |

* A fonte de verdade do **produto** é `plano-nominata.md`, no dossiê. Para lê-lo na mesma
  sessão, usar `/add-dir D:\claude\ratos-os-framework`.
* **Nunca** `git add` de arquivo de `clientes/` ou de qualquer dado real de prospect.
* Dump de banco (`*.sql`, `*.dump`) **jamais** entra em git.
* Nenhum arquivo de configuração local com credencial entra em git.

## Canonicidade

**As regras de execução abaixo são canônicas neste arquivo.** O cartão equivalente no
`AGENTS.md` do dossiê é ponteiro para cá — duas cópias vivas das mesmas regras em dois
repositórios desatualizam. Mudança de regra se faz aqui.

---

# Cartão de regras de execução

Não são prosa — são condições de aceite.

## Loop obrigatório, toda tarefa

0. **LER CONTRATO** — a tarefa declara: entrada válida, entrada inválida, regra de
   autorização, evento gravado, critério de aceite e comando de verificação.
   **Sem isso o agente PARA e pergunta.**
1. **RED** — escrever o teste que falha ANTES da implementação, incluindo obrigatoriamente o
   caso negativo cross-tenant. Rodar e colar a saída de falha.
   **Se passou de primeira, o teste está errado: reescrever.**
2. **GREEN** — implementar o mínimo. Rodar só o teste alvo.
3. **VERIFY** — `npm run verify`.
4. **PROVE** — se tocou policy de RLS: `npm run verify:rls-mutacao`.
5. **EVIDÊNCIA** — saída gravada em `.evidencia/` com o nome da tarefa (ex.:
   `f0-registrar-ping.txt`); últimas ~40 linhas no corpo do commit.
6. **PRONTO** — só agora marcar `[x]`, citando o arquivo de evidência.

**Critério de saída, literal:** `EXIT_CODE=0` e a saída colada. Diferente de 0 significa NÃO
PRONTO, sem exceção e sem interpretação.

**Perna sem conteúdo** (correção 2026-08-14, descoberta na F0.4): se uma perna do `verify`
ainda não pode ter teste — ex.: `unit` antes do primeiro arquivo, `e2e` antes de existir
app — ela só passa se a ausência estiver **DECLARADA na evidência**, com a tarefa que a
preenche. Nenhuma perna pode falhar; perna que tem conteúdo tem que rodá-lo.

## Regra anti-teatro

Uma operação só está pronta quando existe um teste que **falha se a filtragem por tenant for
removida**. O agente demonstra isso na entrega: comenta a linha do filtro, roda, mostra o
teste vermelho, restaura.

## Regra anti-enfraquecimento de teste

Depois que um teste ficou vermelho no passo RED, o **arquivo de teste está CONGELADO**. Se a
implementação não passa, o defeito é da implementação. Alterar um teste só é permitido quando
o **contrato** mudou — e nesse caso o commit começa com `MUDANCA-DE-CONTRATO:` explicando qual
regra de negócio mudou, e requer aprovação humana. **Nunca é permitido enfraquecer asserção,
pular teste ou reduzir escopo para obter verde.**

## Protocolo de autocorreção — 3 tentativas, parada explícita

1. Corrigir pela mensagem de erro. Se falhar, **reverter antes da próxima** (nunca empilhar
   tentativas).
2. **Sem hipótese escrita, não há tentativa 2**: hipótese da causa → observação que confirma
   ou refuta → só depois a correção.
3. Isolar num caso mínimo reproduzível.

**Depois da 3: PARAR.** Reverter tudo, marcar BLOQUEADA em `tarefas.md` e reportar comando,
saída (30 linhas), hipóteses testadas, o que foi descartado e a decisão necessária. O
relatório precisa caber em 5 minutos de leitura de quem não é engenheiro.

Nunca alterar teste durante autocorreção. Nunca usar `sleep`/`waitForTimeout` para
"estabilizar" e2e. Teste que só passa na retentativa entra em quarentena com issue, não é
ignorado. Bloqueou duas vezes = tarefa grande demais, quebrar antes de tentar de novo.

## Banco de dados

* **Toda escrita é uma função em `api.<nome>`.** Se você está prestes a escrever um handler
  TypeScript que faz INSERT/UPDATE, pare — está errado.
* **Nenhuma view sem `security_invoker = true`.**
* **Toda função `security definer` leva `set search_path = ''`** e qualifica todo objeto.
* **`conta_id` nunca vem do cliente** e nenhuma operação o aceita como parâmetro.
* **Nunca usar `user_metadata` em decisão de autorização** — o próprio usuário edita esse campo.
* **`timestamptz` em toda coluna de tempo**; `now()` sempre calculado no banco.
* **MCP do Supabase é para LER** (`list_tables`, `get_advisors`, `query_logs`). Escrita de
  schema é sempre arquivo em `supabase/migrations/` + `db reset` local.
  **Nunca `apply_migration`/`execute_sql` no projeto remoto durante desenvolvimento.**
* **Nunca alterar schema pelo Dashboard.** Nunca rodar `supabase db reset --linked`.
* **Teste de RLS sem o bloco de guardas é inválido** (papel corrente sem `BYPASSRLS`, sessão
  como `authenticated`, claims presentes). Sem elas o teste roda como `postgres`, todas as
  asserções passam, e nenhuma policy foi avaliada.
* Em teste de RLS, leitura negativa é **sempre** `is_empty`/`toEqual([])`, **nunca**
  `throws_ok`.

## Frontend

* Estrutura em inglês, domínio em português, sem tradução: `ContatoCard`, `useMoverEtapa`.
  Nunca `CartaoDeContato`, nunca `ContactCard`.
* Sem acento em identificador. Acento só em string de UI.
* Componente nunca usa token primitivo — só semântico.
* Limite: 200 linhas por componente, 300 por api/hook. **CI falha em 400.**
* Só `features/*/api/` importa o cliente Supabase (imposto por lint).
* **RLS é a fronteira, o frontend não é.** Esconder botão nunca substitui policy.

## Anti-slop visual

Zero gradiente. **Zero emoji em UI de produto.** Sombra com blur ≤24px e opacidade ≤0.15.
Raio ≤12px em card, input e modal. Zero glassmorphism exceto overlay de modal.
**Cor cromática = significado** — se mais de ~10% dos pixels da tela têm croma, está errado.
Máximo 2 badges por card. Zero ilustração de banco de imagem. Copy específica e sóbria, nunca
"Ops! Algo deu errado". Animação: só opacidade + 4px, 120-180ms, ease-out — zero bounce, zero
spring, zero skeleton com brilho varrendo. All-caps só até 12px.

## Estados obrigatórios

Toda tela tem três estados distintos, com componente próprio, **nunca confundidos**: VAZIO
(nunca houve dado), FILTRADO SEM RESULTADO, ERRO. Os três entram nas capturas anexadas ao PR.

Inatividade sem nenhum evento é **"nunca movimentado"**, jamais `0 dias`. Qualificação não
preenchida é **"—"**, jamais o nível mais baixo.

## Nunca

* Score numérico combinando dimensões de qualificação. Em lugar nenhum, por nenhum motivo.
* Push direto em `main` — inclusive sendo o dono.
* Secret key em qualquer arquivo do repositório ou no bundle.
* Dado real de prospect em seed, fixture ou teste.

---

## Tom nos relatórios

Sóbrio, direto, sem enfeite. Quem lê o relatório de bloqueio é operador de negócio, não
engenheiro: diga o que aconteceu, o que significa para o projeto, e qual decisão é necessária.
