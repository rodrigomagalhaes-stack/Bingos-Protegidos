// O bilhete compartilhado da Esportiva, lido no Altenar.
//
// É o mesmo leitor de server/protegidos/bilhete.js, no repositório do BI, e o
// formato do que ele devolve TEM de ser o mesmo dos dois lados: vai para a
// coluna `bilhete`, e o BI desenha o que estiver guardado ali. Mudou lá, muda
// aqui.
//
// De onde vem: ao compartilhar um bilhete, o site da Esportiva grava as
// seleções no serviço social do Altenar e recebe um código, que vai no link
// como `?shareCode=` — inclusive nos links de afiliado. Ler esse código é um
// GET público, sem login, que devolve as seleções já com os nomes e o horário
// de cada jogo. Não é API oficial: pode mudar sem aviso.

const GET_VALUE = 'https://sb2socialmedia-altenar2.biahosted.com/api/Storage/GetValue'
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'
const TEMPO_MAXIMO = 10000

const CODIGO = /^[A-Za-z0-9_-]{1,64}$/

const texto = (s) => String(s ?? '').replace(/\s+/g, ' ').trim()
const odd = (n) => (Number.isFinite(Number(n)) && Number(n) > 0 ? Number(n) : null)

/** O código de compartilhamento do link — do site ou de afiliado (`go.aff…`). */
export function codigoDoLink(link) {
  try {
    const url = new URL(String(link ?? '').trim())
    for (const [chave, valor] of url.searchParams) {
      if (chave.toLowerCase() === 'sharecode' && CODIGO.test(valor)) return valor
    }
  } catch {
    // não é nem URL: não tem código
  }
  return null
}

/** O bilhete no formato que o BI guarda e desenha. */
export function normalizarBilhete(bruto, codigo, agora = new Date()) {
  const selecoes = Array.isArray(bruto?.selections) ? bruto.selections : []
  return {
    codigo,
    lido_em: agora.toISOString(),
    tipo: Number(bruto?.betType ?? 0),
    linhas: selecoes.map((s) => {
      const betBuilder = Boolean(s?.market?.isBB) || Array.isArray(s?.bbSelections)
      return {
        evento: texto(s?.event?.name),
        inicio: s?.event?.startDate || null,
        mercado: betBuilder ? 'Bet Builder' : texto(s?.market?.name),
        selecao: texto(s?.odd?.name),
        odd: odd(s?.odd?.price),
        odd_antes: odd(s?.odd?.preBoostedPrice),
        pernas: (s?.bbSelections ?? []).map((p) => ({
          mercado: texto(p?.market?.name),
          selecao: texto(p?.odd?.name),
        })),
      }
    }),
  }
}

/** Lê um código no Altenar. Nulo quando o código não existe (ou não tem seleção). */
export async function lerBilhete(codigo) {
  const ac = new AbortController()
  const prazo = setTimeout(() => ac.abort(), TEMPO_MAXIMO)
  try {
    // Sem Referer, como no BI: com o domínio da Esportiva nele o Altenar
    // responde 403.
    const res = await fetch(`${GET_VALUE}?key=${encodeURIComponent(codigo)}`, {
      signal: ac.signal,
      headers: { 'User-Agent': UA, Accept: 'application/json' },
    })
    if (!res.ok) throw new Error(`HTTP ${res.status} no Altenar`)

    // Código que não existe volta 200 com `Error` preenchido e `Result` nulo.
    const d = await res.json()
    if (d?.Error || !d?.Result) return null

    const bilhete = normalizarBilhete(JSON.parse(d.Result), codigo)
    return bilhete.linhas.length ? bilhete : null
  } finally {
    clearTimeout(prazo)
  }
}

// O dia de cada jogo no horário de Brasília, que é o que o site mostra e o que
// o BI compara com "hoje". Um jogo às 21h do dia 12 em Brasília já é dia 13 em
// UTC: cortar a data do texto do horário jogaria o bilhete um dia para frente.
const DIA_BRASILIA = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/** Os dias dos jogos do bilhete, sem repetição e em ordem, como 'YYYY-MM-DD'. */
export function datasDoBilhete(bilhete) {
  const dias = new Set()
  for (const linha of bilhete?.linhas ?? []) {
    const inicio = new Date(linha.inicio ?? '')
    if (!Number.isNaN(inicio.getTime())) dias.add(DIA_BRASILIA.format(inicio))
  }
  return [...dias].sort()
}
