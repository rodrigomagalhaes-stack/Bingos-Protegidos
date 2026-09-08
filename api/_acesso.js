import { timingSafeEqual } from 'node:crypto'

// O portão do formulário.
//
// Este endereço é público — quem descobrir a URL abre a página. Sem um código,
// qualquer visitante cadastra bilhete, e cadastrar bilhete aqui é criar uma
// obrigação de pagamento lá dentro. O código é um segredo só da equipe, e não
// pretende ser mais do que isso: não identifica quem cadastrou, só impede que
// um estranho escreva na fila.
//
// Quem precisa saber QUEM cadastrou usa o BI, onde há login de verdade.

const SENHA = process.env.CADASTRO_SENHA ?? ''

export const temSenhaConfigurada = Boolean(SENHA)

/**
 * Comparação em tempo constante.
 *
 * Comparar com `===` vaza o tamanho do prefixo certo pelo tempo de resposta.
 * É um ataque improvável contra um código de equipe, mas a função existe pronta
 * no Node e o custo de usá-la é uma linha.
 */
export function senhaConfere(recebida) {
  if (!SENHA) return false
  const a = Buffer.from(String(recebida ?? ''))
  const b = Buffer.from(SENHA)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

/** Devolve `true` se a requisição pode seguir; senão já responde e devolve `false`. */
export function liberado(req, res) {
  if (!temSenhaConfigurada) {
    res.status(500).json({ erro: 'O formulário está sem CADASTRO_SENHA configurada.' })
    return false
  }

  const codigo = req.headers['x-codigo'] ?? req.body?.codigo
  if (!senhaConfere(codigo)) {
    res.status(401).json({ erro: 'Código de acesso incorreto.' })
    return false
  }

  return true
}
