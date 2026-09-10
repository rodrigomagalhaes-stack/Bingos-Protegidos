import { rest } from './_supabase.js'
import { abrirSessao, conferirSenha, exigirSegredo, fecharSessao } from './_sessao.js'
import { falhaInesperada } from './_erros.js'

// Entrar e sair.
//
//   POST    entra com e-mail e senha
//   DELETE  sai
//
// "E-mail ou senha incorretos" é uma mensagem só para os dois casos: dizer
// "este e-mail não tem conta" ensinaria a quem está testando senhas quais
// e-mails valem o esforço.
//
// A TRAVA DE TENTATIVAS mora no banco (`protegidos_reservar_tentativa`), e não
// na memória: função serverless esquece tudo entre uma chamada e outra. Ela
// protege a conta, não o endereço de quem tenta — trocar de IP não destrava.

const ERRADO = 'E-mail ou senha incorretos.'

export default async function handler(req, res) {
  try {
    if (req.method === 'POST') return await entrar(req, res)

    if (req.method === 'DELETE') {
      fecharSessao(req, res)
      return res.status(200).json({ ok: true })
    }

    res.setHeader('Allow', 'POST, DELETE')
    return res.status(405).json({ erro: 'Método não permitido.' })
  } catch (e) {
    return falhaInesperada(res, e, 'sessao', 'Não consegui entrar agora. Tente de novo.')
  }
}

async function entrar(req, res) {
  exigirSegredo()

  const email = String(req.body?.email ?? '').trim().toLowerCase()
  const senha = String(req.body?.senha ?? '')
  if (!email || !senha) return res.status(400).json({ erro: 'Preencha o e-mail e a senha.' })

  const [conta] = await rest(
    `protegidos_contas?email_chave=eq.${encodeURIComponent(email)}&select=id,nome,email,senha_hash`,
  )
  if (!conta) return res.status(401).json({ erro: ERRADO })

  // A tentativa é contada ANTES de a senha ser conferida. Na ordem inversa, mil
  // pedidos em paralelo leriam todos "nenhuma tentativa ainda" e mil senhas
  // seriam testadas antes de a primeira falha ser gravada.
  const travadaAte = await rest('rpc/protegidos_reservar_tentativa', {
    method: 'POST',
    body: { conta: conta.id },
  })
  if (travadaAte) return res.status(429).json({ erro: mensagemDeTrava(travadaAte) })

  if (!(await conferirSenha(senha, conta.senha_hash))) {
    return res.status(401).json({ erro: ERRADO })
  }

  await rest(`protegidos_contas?id=eq.${encodeURIComponent(conta.id)}`, {
    method: 'PATCH',
    body: { tentativas: 0 },
  })

  abrirSessao(req, res, conta.id)
  return res.status(200).json({ nome: conta.nome, email: conta.email })
}

function mensagemDeTrava(ate) {
  const minutos = Math.max(1, Math.ceil((new Date(ate).getTime() - Date.now()) / 60000))
  return `Muitas tentativas com a senha errada. Tente de novo em ${minutos} minuto${minutos > 1 ? 's' : ''}.`
}
