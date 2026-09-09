// Acesso ao Supabase com a chave de serviço.
//
// Esta chave ignora o RLS por definição: ela é o banco inteiro numa string. Por
// isso ela mora SÓ nas variáveis deste projeto da Vercel, nunca no BI e nunca
// no navegador — tudo que o formulário faz passa por uma função daqui.
//
// O BI é o contrário: lá a escrita é assinada com o token da pessoa logada, e a
// chave anon sozinha não enxerga nada (ver supabase/rls.sql).

const URL = process.env.SUPABASE_URL
const CHAVE = process.env.SUPABASE_SERVICE_ROLE_KEY

export const configurado = Boolean(URL && CHAVE)

export async function rest(caminho, { method = 'GET', body, headers = {} } = {}) {
  if (!configurado) {
    // Marcado para quem chama poder dizer a verdade a quem está na tela:
    // isto não é falha passageira, e tentar de novo nunca vai resolver.
    const erro = new Error('SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY não configuradas.')
    erro.configuracao = true
    throw erro
  }

  const res = await fetch(`${URL}/rest/v1/${caminho}`, {
    method,
    headers: {
      apikey: CHAVE,
      Authorization: `Bearer ${CHAVE}`,
      'Content-Type': 'application/json',
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  })

  const texto = await res.text()
  if (!res.ok) {
    const erro = new Error(texto || `erro ${res.status}`)
    erro.status = res.status
    try {
      erro.detalhe = JSON.parse(texto)
    } catch {
      erro.detalhe = null
    }
    throw erro
  }

  return texto ? JSON.parse(texto) : null
}
