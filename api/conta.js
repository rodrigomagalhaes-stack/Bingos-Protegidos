import { rest } from './_supabase.js'
import { abrirSessao, contaLogada, exigirSegredo, gerarHash } from './_sessao.js'
import { falhaInesperada } from './_erros.js'

// A conta do tipster.
//
//   GET   quem está logado — é a primeira pergunta que a página faz
//   POST  cria a conta e já entra
//
// O cadastro é livre, sem aprovação de conta. A trava de quem recebe reembolso
// fica na análise de cada bilhete, no BI.

const LIMITE_NOME = 120
const SENHA_MINIMA = 8
const SENHA_MAXIMA = 200

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      res.setHeader('Cache-Control', 'no-store')
      const conta = await contaLogada(req)
      if (!conta) return res.status(401).json({ erro: 'Entre com a sua conta.' })
      return res.status(200).json({ nome: conta.nome, email: conta.email })
    }

    if (req.method === 'POST') return await criar(req, res)

    res.setHeader('Allow', 'GET, POST')
    return res.status(405).json({ erro: 'Método não permitido.' })
  } catch (e) {
    return falhaInesperada(res, e, 'conta', 'Não consegui acessar a conta. Tente de novo.')
  }
}

async function criar(req, res) {
  // Antes de gravar: sem o segredo a conta seria criada e a sessão não abriria,
  // e a nova tentativa já esbarraria em "este e-mail já tem conta".
  exigirSegredo()

  // Espaço sobrando some aqui: este nome vira `tipster_nome` em cada bilhete, e
  // o BI agrupa por ele.
  const nome = String(req.body?.nome ?? '').trim().replace(/\s+/g, ' ')
  const email = String(req.body?.email ?? '').trim()
  const senha = String(req.body?.senha ?? '')

  const erro = validar({ nome, email, senha })
  if (erro) return res.status(400).json({ erro })

  try {
    const [conta] = await rest('protegidos_contas?select=id,nome,email', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: { nome, email, senha_hash: await gerarHash(senha) },
    })

    abrirSessao(req, res, conta.id)
    return res.status(201).json({ nome: conta.nome, email: conta.email })
  } catch (e) {
    // Dois índices únicos, duas mensagens. O nome repetido precisa dizer que é
    // o NOME, senão a pessoa troca o e-mail e tenta de novo sem entender.
    if (e.detalhe?.code === '23505') {
      if (String(e.detalhe.message ?? '').includes('protegidos_contas_nome_uk')) {
        return res.status(409).json({
          erro: 'Já existe uma conta com este nome de tipster. Se ela é sua, use "Entrar".',
        })
      }
      return res.status(409).json({ erro: 'Este e-mail já tem conta. Use "Entrar".' })
    }
    throw e
  }
}

function validar({ nome, email, senha }) {
  if (!nome) return 'Escreva o seu nome de tipster.'
  if (nome.length > LIMITE_NOME) return 'O nome está longo demais.'
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return 'Este e-mail não parece completo.'
  }
  if (senha.length < SENHA_MINIMA) return `A senha precisa ter pelo menos ${SENHA_MINIMA} caracteres.`
  if (senha.length > SENHA_MAXIMA) return 'A senha está longa demais.'
  return null
}
