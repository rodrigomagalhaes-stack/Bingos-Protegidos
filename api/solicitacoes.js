import { rest } from './_supabase.js'
import { contaLogada } from './_sessao.js'
import { falhaInesperada } from './_erros.js'

// As solicitações da conta logada.
//
// Os campos vão escolhidos um a um, e não `select=*`: o bilhete guarda coisas
// da operação, não do tipster — quem aprovou e quem pagou (e-mails da equipe) e
// as bases com os jogadores reembolsados. O tipster vê em que pé está o pedido,
// o motivo se foi recusado e se já foi pago. Valor de reembolso, não.

const CAMPOS = [
  'id',
  'tipster_nome',
  'stake',
  'link_bilhete',
  'datas_confrontos',
  'confronto_fim',
  'status',
  'motivo_recusa',
  'enviado_em',
  'aprovado_em',
  'recusado_em',
  'pago_em',
].join(',')

const LIMITE = 500

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ erro: 'Método não permitido.' })
  }

  res.setHeader('Cache-Control', 'no-store')

  try {
    const conta = await contaLogada(req, 'id')
    if (!conta) return res.status(401).json({ erro: 'Entre com a sua conta.' })

    const lista = await rest(
      `protegidos_bilhetes?conta_id=eq.${encodeURIComponent(conta.id)}` +
        `&select=${CAMPOS}&order=enviado_em.desc&limit=${LIMITE}`,
    )
    return res.status(200).json({ solicitacoes: lista ?? [] })
  } catch (e) {
    return falhaInesperada(res, e, 'solicitacoes', 'Não consegui carregar as suas solicitações.')
  }
}
