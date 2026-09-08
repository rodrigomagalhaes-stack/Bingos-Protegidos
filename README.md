# Bingos Protegidos — cadastro

O formulário que alimenta a aba **Bingos Protegidos** do BI Sportsbook. Vive
neste repositório e sobe como um projeto Vercel próprio, com URL própria: quem
cadastra não precisa (e não deve precisar) de login no BI.

```
index.html          o formulário inteiro: uma página, sem build
api/registrar.js    grava o bilhete
api/tipsters.js     a lista suspensa
api/_acesso.js      o código de acesso
api/_supabase.js    a chave de serviço
```

O banco é o **mesmo do BI**. O schema mora lá, em `supabase/protegidos.sql`, e
precisa ter sido aplicado antes de este formulário servir para alguma coisa.

## Por que ele não fala com o Supabase pelo navegador

A chave `anon` do Supabase vai compilada em qualquer JavaScript que a use: quem
abre a página consegue lê-la. No BI isso é resolvido pelo RLS — a chave sozinha
não enxerga nada, e quem assina cada requisição é a pessoa logada.

Aqui não há pessoa logada. Então a escrita passa por uma função serverless que
usa a **service role key**, que fica só nas variáveis deste projeto e nunca
chega ao navegador. A alternativa seria uma política de `insert` para `anon`,
bem mais curta de montar — e que deixaria qualquer um com a chave injetando
bilhete falso direto na fila de pagamento. Com dinheiro do outro lado, não vale
a economia.

## O que valida o quê

O formulário valida para a pessoa não errar. `api/registrar.js` valida **de
novo**, e é essa que conta: nada impede alguém de chamar o endereço direto, e o
que entra ali vira obrigação de pagamento no BI.

Duas travas moram no banco, e não no código de nenhuma das pontas, porque são as
que não podem falhar:

- **link duplicado** — índice único sobre o link normalizado. Cadastrar o mesmo
  bilhete duas vezes é reembolsar duas vezes. O erro `23505` do Postgres vira a
  mensagem "este bilhete já foi cadastrado".
- **nome do tipster** — vem da tabela, pelo `id` escolhido, e nunca do que o
  navegador mandou. Sem isso, um campo escondido trocado gravaria o bilhete de
  um tipster no nome de outro.

## Variáveis de ambiente

Na Vercel, **só neste projeto** (ver `.env.example`):

| variável | o que é |
|---|---|
| `SUPABASE_URL` | a mesma URL do projeto Supabase do BI |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API → `service_role`. **Nunca** no BI. |
| `CADASTRO_SENHA` | o código que a equipe digita para abrir o formulário |

Sem `CADASTRO_SENHA` o formulário responde 500 de propósito: é uma URL pública,
e sem portão qualquer visitante cadastraria bilhete.

O código fica em `sessionStorage`, não em `localStorage`: some quando a aba
fecha. Numa máquina compartilhada da operação, um segredo de equipe que
sobrevive ao fim do expediente é um segredo a mais espalhado por aí.

## Publicar

1. Vercel → **Add New Project** → este repositório.
2. Framework Preset: **Other**. Sem build command, sem output directory.
3. As três variáveis acima.
4. Deploy, e aponte o domínio que a equipe vai usar.

## Antes do primeiro cadastro

1. `supabase/protegidos.sql` aplicado no SQL Editor do Supabase (o arquivo está
   no repositório do BI).
2. Tipsters cadastrados na aba **Bingos Protegidos → Tipsters** do BI. A lista
   suspensa daqui só mostra os que estiverem lá e ativos.

O campo de texto livre para o nome do tipster foi descartado de propósito:
"João Aposta", "joao aposta" e "Joao" virariam três tipsters para todo filtro e
toda soma, sem conserto depois que os bilhetes já estão gravados.
