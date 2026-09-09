# Bingos Protegidos — cadastro

O formulário que alimenta a aba **Bingos Protegidos** do BI Sportsbook. Vive
neste repositório e sobe como um projeto Vercel próprio, com URL própria: quem
cadastra não precisa (e não deve precisar) de login no BI.

```
index.html          o formulário inteiro: uma página, sem build
api/registrar.js    grava o bilhete
api/_supabase.js    a chave de serviço
servidor.js         só para desenvolvimento (npm run dev)
```

O banco é o **mesmo do BI**. O schema mora lá, em `supabase/protegidos.sql`, e
precisa ter sido aplicado antes de este formulário servir para alguma coisa.

## Os campos

Nome do tipster, stake, link do bilhete e as datas dos confrontos — mais quem
está cadastrando e uma observação, os dois opcionais.

O nome do tipster é **texto livre**. Quem preenche precisa escrever sempre do
mesmo jeito: o BI agrupa os bilhetes por esse nome, e uma grafia diferente vira
outro tipster nos totais. O que dá para automatizar contra isso já está feito —
espaço sobrando é removido no servidor, e a coluna `tipster_chave` do banco
junta maiúsculas e minúsculas. Acento continua separando ("joao" ≠ "joão").

## Por que ele não fala com o Supabase pelo navegador

A chave publicável do Supabase vai compilada em qualquer JavaScript que a use:
quem abre a página consegue lê-la. No BI isso é resolvido pelo RLS — a chave
sozinha não enxerga nada, e quem assina cada requisição é a pessoa logada.

Aqui não há pessoa logada. Então a escrita passa por uma função serverless que
usa a **secret key**, que fica só nas variáveis deste projeto e nunca chega ao
navegador. A alternativa seria uma política de `insert` para `anon`, bem mais
curta de montar — e que deixaria qualquer um com a chave pública injetando
bilhete direto na fila de pagamento.

## O endereço é aberto

Não há código de acesso: quem tiver o link cadastra. Como cadastrar aqui cria
obrigação de pagamento no BI, o que sobra de proteção é:

- **link duplicado** — índice único sobre o link normalizado, no banco.
  Cadastrar o mesmo bilhete duas vezes é reembolsar duas vezes, e o erro `23505`
  do Postgres vira a mensagem "este bilhete já foi cadastrado".
- **a conferência humana** — nada é pago sem alguém abrir o cartão no BI, ver o
  bilhete no site e subir a base.

Se um dia isso não bastar, o caminho que não mexe no formulário é a
**Deployment Protection** da Vercel, que põe uma senha na frente do projeto
inteiro.

## O que valida o quê

O formulário valida para a pessoa não errar. `api/registrar.js` valida **de
novo**, e é essa que conta: nada impede alguém de chamar o endereço direto.

## Variáveis de ambiente

Na Vercel, **só neste projeto** (ver `.env.example`):

| variável | o que é |
|---|---|
| `SUPABASE_URL` | a mesma URL do projeto Supabase do BI |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API Keys → secret key (`sb_secret_…`). **Nunca** no BI. |

## Rodar aqui

```bash
cp .env.example .env    # preencha as duas variáveis
npm run dev             # http://localhost:5174
```

`servidor.js` é um arremedo do runtime da Vercel — mesmo contrato de req/res,
para a função rodar na sua máquina exatamente como roda no deploy. É o mesmo
papel que `vite-plugin-api-dev.js` faz no BI. Ele não vai para produção: lá o
`index.html` é servido como estático e cada arquivo de `api/` vira uma função.

## Publicar

1. Vercel → **Add New Project** → este repositório.
2. Framework Preset: **Other**. Sem build command, sem output directory.
3. As duas variáveis acima.
4. Deploy, e aponte o domínio que a equipe vai usar.
