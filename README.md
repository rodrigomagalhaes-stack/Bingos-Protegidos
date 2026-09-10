# Bingos Protegidos — solicitações

Onde o tipster pede o reembolso de um bilhete protegido e acompanha a resposta.
Alimenta a aba **Bingos Protegidos** do BI Sportsbook. Vive neste repositório e
sobe como um projeto Vercel próprio, com URL própria: o tipster não tem (e não
deve ter) acesso ao BI.

```
index.html            a página inteira, sem build: entrar, nova solicitação, minhas solicitações
api/conta.js          cria a conta (POST) e diz quem está logado (GET)
api/sessao.js         entra (POST) e sai (DELETE)
api/registrar.js      grava uma solicitação
api/solicitacoes.js   as solicitações da conta logada
api/_sessao.js        senha e cookie de sessão
api/_supabase.js      a chave de serviço
api/_erros.js         a resposta para o erro que não é culpa de quem está na tela
servidor.js           só para desenvolvimento (npm run dev)
```

O banco é o **mesmo do BI**. O schema mora lá, em `supabase/protegidos.sql`, e
precisa ter sido aplicado antes de este formulário servir para alguma coisa.

## O caminho de uma solicitação

1. O tipster cria a conta (nome de tipster, e-mail e senha) ou entra.
2. Envia o bilhete: stake, link e as datas dos confrontos. Ele nasce
   **Em análise** (`pendente` no banco).
3. No BI, a equipe aprova ou recusa na caixa **Solicitações**. Recusar exige
   motivo.
4. Em **Minhas solicitações** o tipster vê Em análise, Aprovado, Recusado (com o
   motivo) ou Pago. O valor reembolsado e os jogadores pagos não aparecem: a
   função devolve os campos escolhidos um a um, nunca `select=*`.

Um bilhete recusado pode ser enviado de novo — a trava de link duplicado ignora
os recusados.

## O login não é o do Supabase

O BI usa o Supabase Auth, e as políticas das tabelas liberam tudo para qualquer
usuário logado (`authenticated`). Um tipster com conta no Auth leria o BI
inteiro. Por isso a conta do tipster é uma linha de `protegidos_contas`, que só
as funções daqui leem, com a secret key. A tabela liga o RLS sem política
nenhuma: nem o BI logado lê o hash das senhas.

- **Senha** guardada como hash `scrypt`, que vem no Node — sem dependência.
- **Sessão** num cookie `HttpOnly` e `SameSite=Lax`, assinado com HMAC por
  `SESSAO_SEGREDO`. Não há tabela de sessões: a assinatura é a prova. Trocar o
  segredo desloga todo mundo.
- **Trava de tentativas** no banco (`protegidos_reservar_tentativa`): cinco
  tentativas passam, a sexta sem acerto trava a conta por quinze minutos. A
  tentativa é contada **antes** de a senha ser conferida, numa instrução só —
  senão pedidos em paralelo leriam todos "nenhuma tentativa ainda" e passariam
  por cima da trava.

O cadastro de conta é livre, sem aprovação. O que protege o caixa é a análise de
cada bilhete no BI, o índice único do link e duas travas na conta:

- **o nome de tipster é único** — sem caixa, acento nem espaço sobrando, a mesma
  fórmula de `tipster_chave`. É por ele que o BI agrupa: ninguém cria a conta
  "Rodrigo" e soma bilhetes aos do Rodrigo de verdade.
- **o nome vem da conta**, nunca do corpo da requisição: uma conta não pede em
  nome de outro tipster.

**Esqueci a senha** ainda não existe — este projeto não envia e-mail.

## Por que ele não fala com o Supabase pelo navegador

A chave publicável do Supabase vai compilada em qualquer JavaScript que a use:
quem abre a página consegue lê-la. No BI isso é resolvido pelo RLS — a chave
sozinha não enxerga nada, e quem assina cada requisição é a pessoa logada.

Aqui a pessoa logada não é do Supabase. Então tudo passa por funções serverless
que usam a **secret key**, que fica só nas variáveis deste projeto e nunca chega
ao navegador. A alternativa seria uma política de `insert` para `anon`, bem mais
curta de montar — e que deixaria qualquer um com a chave pública injetando
bilhete direto na fila.

## O que valida o quê

O formulário valida para a pessoa não errar. As funções de `api/` validam **de
novo**, e são essas que contam: nada impede alguém de chamar o endereço direto.

## Variáveis de ambiente

Na Vercel, **só neste projeto** (ver `.env.example`):

| variável | o que é |
|---|---|
| `SUPABASE_URL` | a mesma URL do projeto Supabase do BI |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API Keys → secret key (`sb_secret_…`). **Nunca** no BI. |
| `SESSAO_SEGREDO` | texto aleatório de 32+ caracteres que assina o cookie de login |

## Rodar aqui

```bash
cp .env.example .env    # preencha as três variáveis
npm run dev             # http://localhost:5174
```

`servidor.js` é um arremedo do runtime da Vercel — mesmo contrato de req/res,
para as funções rodarem na sua máquina exatamente como rodam no deploy. É o
mesmo papel que `vite-plugin-api-dev.js` faz no BI. Ele não vai para produção:
lá o `index.html` é servido como estático e cada arquivo de `api/` vira uma
função (os que começam com `_` não viram).

## Publicar

A ordem importa:

1. **Banco** — `supabase/protegidos.sql` do BI no SQL Editor. Cria as contas, o
   status `pendente` e as colunas da análise.
2. **BI** — a versão com a caixa Solicitações. Sem ela, nada aprova o que chega.
3. **Este projeto** — com `SESSAO_SEGREDO` configurada.

Na primeira vez: Vercel → **Add New Project** → este repositório, Framework
Preset **Other**, sem build command nem output directory, as três variáveis
acima.
