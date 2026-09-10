import { rest } from './_supabase.js'
import { contaLogada } from './_sessao.js'
import { falhaInesperada } from './_erros.js'

// Uma solicitação de bilhete protegido.
//
// TUDO É CONFERIDO AQUI, DE NOVO. O formulário já valida o que dá para validar
// na tela, mas nada impede alguém de chamar este endereço direto — e o que
// entra aqui pode virar obrigação de pagamento do outro lado. A validação do
// navegador serve para a pessoa não errar; esta serve para o sistema não ser
// enganado.
//
// Só entra com conta logada, e o nome do tipster vem da CONTA, nunca do corpo
// da requisição: aceitar um nome enviado deixaria qualquer conta pedir em nome
// de outro tipster. O bilhete nasce `pendente` e só chega à fila de pagamento
// depois que alguém da equipe aprova no BI.
//
// A trava contra o mesmo bilhete duas vezes continua sendo o índice único do
// link, no banco — cadastrar duas vezes é reembolsar duas vezes.

const LIMITE_DATAS = 20
const LIMITE_OBSERVACAO = 500

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ erro: 'Método não permitido.' })
  }

  const { stake, link_bilhete, datas_confrontos, observacao } = req.body ?? {}

  const erro = validar({ stake, link_bilhete, datas_confrontos })
  if (erro) return res.status(400).json({ erro })

  try {
    const conta = await contaLogada(req)
    if (!conta) return res.status(401).json({ erro: 'Sua sessão terminou. Entre de novo para enviar.' })

    const [bilhete] = await rest('protegidos_bilhetes?select=id', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: {
        conta_id: conta.id,
        tipster_nome: conta.nome,
        enviado_por: conta.email,
        // Escrito, e não deixado ao padrão da coluna: é a regra que manda o
        // bilhete para a análise, e ela não pode depender de o banco estar na
        // versão certa.
        status: 'pendente',
        stake: Number(stake),
        link_bilhete: String(link_bilhete).trim(),
        datas_confrontos,
        observacao:
          typeof observacao === 'string' && observacao.trim()
            ? observacao.trim().slice(0, LIMITE_OBSERVACAO)
            : null,
      },
    })

    return res.status(201).json({ ok: true, id: bilhete.id })
  } catch (e) {
    // 23505 é violação de índice único, e aqui só existe um: o do link. O
    // duplicado é o erro mais provável deste formulário (o mesmo bilhete
    // chegando por dois caminhos), e é o que não pode passar.
    if (e.detalhe?.code === '23505') {
      return res.status(409).json({
        erro: 'Este bilhete já foi enviado. Se foi por você, ele está em Minhas solicitações.',
      })
    }

    if (e.detalhe?.code === '23514') {
      return res.status(400).json({ erro: 'Algum campo veio fora do formato esperado.' })
    }

    return falhaInesperada(res, e, 'registrar', 'Não consegui enviar a solicitação. Tente de novo.')
  }
}

function validar({ stake, link_bilhete, datas_confrontos }) {
  const valor = Number(stake)
  if (!Number.isFinite(valor) || valor <= 0) return 'A stake precisa ser um número maior que zero.'

  const link = String(link_bilhete ?? '').trim()
  if (!link) return 'Cole o link do bilhete.'
  if (!/^https?:\/\/.+\..+/i.test(link)) return 'O link do bilhete precisa ser um endereço completo.'

  if (!Array.isArray(datas_confrontos) || datas_confrontos.length === 0) {
    return 'Informe ao menos uma data de confronto.'
  }
  if (datas_confrontos.length > LIMITE_DATAS) {
    return `Um bilhete não deveria ter mais de ${LIMITE_DATAS} confrontos.`
  }
  if (!datas_confrontos.every((d) => /^\d{4}-\d{2}-\d{2}$/.test(String(d)))) {
    return 'As datas dos confrontos vieram num formato que eu não entendo.'
  }

  return null
}
