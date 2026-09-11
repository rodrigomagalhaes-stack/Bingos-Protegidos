import { rest } from './_supabase.js'
import { contaLogada } from './_sessao.js'
import { codigoDoLink, datasDoBilhete, lerBilhete } from './_bilhete.js'
import { falhaInesperada } from './_erros.js'

// Uma solicitação de bilhete protegido.
//
// TUDO É CONFERIDO AQUI, DE NOVO. O formulário já valida o que dá para validar
// na tela, mas nada impede alguém de chamar este endereço direto — e o que
// entra aqui pode virar obrigação de pagamento do outro lado. A validação do
// navegador serve para a pessoa não errar; esta serve para o sistema não ser
// enganado.
//
// Só entra com conta logada. O nome do tipster vem do formulário, e não da
// conta: quem entra pode mandar bilhetes de mais de um tipster. De qual conta
// veio fica gravado à parte (`conta_id`, `enviado_por`, `afiliado_id`), então a
// equipe sempre sabe quem enviou, seja qual for o nome digitado. O bilhete
// nasce `pendente` e só chega à fila de pagamento depois que alguém da equipe
// aprova no BI.
//
// AS DATAS SAEM DO BILHETE. O formulário não pergunta mais quando são os jogos:
// o link de compartilhar traz o código do bilhete, o Altenar devolve as
// seleções com o horário de cada jogo, e as datas vêm dali. É a data que decide
// quando o bilhete pode ser pago, e ela deixou de depender de alguém digitar
// certo. O preço é depender do Altenar no envio: link sem código, ou código que
// ele não encontra, é recusado com a explicação. As linhas lidas ficam
// guardadas no bilhete, e o BI não precisa lê-las de novo.
//
// A trava contra o mesmo bilhete duas vezes continua no banco: o índice do link
// e o do código de compartilhamento. Cadastrar duas vezes é reembolsar duas.

const LIMITE_TEXTO = 120
const LIMITE_OBSERVACAO = 500

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ erro: 'Método não permitido.' })
  }

  const { tipster_nome, stake, link_bilhete, observacao } = req.body ?? {}

  const erro = validar({ tipster_nome, stake, link_bilhete })
  if (erro) return res.status(400).json({ erro })

  const codigo = codigoDoLink(link_bilhete)
  if (!codigo) {
    return res.status(400).json({
      erro: 'Use o link de compartilhar o bilhete da Esportiva — é ele que traz o código (shareCode) de onde saem os jogos e as datas.',
    })
  }

  try {
    const conta = await contaLogada(req, 'id,nome,email,afiliado_id')
    if (!conta) return res.status(401).json({ erro: 'Sua sessão terminou. Entre de novo para enviar.' })

    let bilhete
    try {
      bilhete = await lerBilhete(codigo)
    } catch (e) {
      console.error('registrar: leitura do bilhete', codigo, e.message)
      return res.status(502).json({
        erro: 'Não consegui ler o bilhete na Esportiva agora. Tente de novo em alguns instantes.',
      })
    }
    if (!bilhete) {
      return res.status(400).json({ erro: 'A Esportiva não encontrou este bilhete. Confira se o link está completo.' })
    }

    const datas = datasDoBilhete(bilhete)
    if (!datas.length) {
      return res.status(400).json({ erro: 'O bilhete veio sem a data dos jogos. Confira o link.' })
    }

    const [registro] = await rest('protegidos_bilhetes?select=id', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: {
        conta_id: conta.id,
        // Espaço sobrando some aqui: o BI agrupa por este nome, e "João " e
        // "João" seriam dois tipsters em toda soma. O resto da normalização
        // (caixa, acento) é a coluna gerada `tipster_chave`, no banco.
        tipster_nome: String(tipster_nome).trim().replace(/\s+/g, ' '),
        enviado_por: conta.email,
        // Copiado da conta, como o e-mail: o BI não lê `protegidos_contas`.
        // Nulo nas contas criadas antes de o campo existir.
        afiliado_id: conta.afiliado_id ?? null,
        // Escrito, e não deixado ao padrão da coluna: é a regra que manda o
        // bilhete para a análise, e ela não pode depender de o banco estar na
        // versão certa.
        status: 'pendente',
        stake: Number(stake),
        link_bilhete: String(link_bilhete).trim(),
        datas_confrontos: datas,
        bilhete,
        observacao:
          typeof observacao === 'string' && observacao.trim()
            ? observacao.trim().slice(0, LIMITE_OBSERVACAO)
            : null,
      },
    })

    return res.status(201).json({ ok: true, id: registro.id, datas })
  } catch (e) {
    // 23505 é violação de índice único: o do link ou o do código do bilhete.
    // O duplicado é o erro mais provável deste formulário (o mesmo bilhete
    // chegando por dois grupos), e é o que não pode passar.
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

function validar({ tipster_nome, stake, link_bilhete }) {
  const nome = String(tipster_nome ?? '').trim()
  if (!nome) return 'Escreva o nome do tipster.'
  if (nome.length > LIMITE_TEXTO) return 'O nome do tipster está longo demais.'

  const valor = Number(stake)
  if (!Number.isFinite(valor) || valor <= 0) return 'A stake precisa ser um número maior que zero.'

  const link = String(link_bilhete ?? '').trim()
  if (!link) return 'Cole o link do bilhete.'
  if (!/^https?:\/\/.+\..+/i.test(link)) return 'O link do bilhete precisa ser um endereço completo.'

  return null
}
