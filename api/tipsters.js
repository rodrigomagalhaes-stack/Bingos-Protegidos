import { liberado } from './_acesso.js'
import { rest } from './_supabase.js'

// A lista suspensa do formulário. Só os ativos: tipster desativado no BI some
// daqui sem que ninguém precise mexer nesta página.
//
// Pede o código como qualquer outra chamada — a lista de quem trabalha com a
// casa não é informação para deixar aberta a quem só descobriu a URL.

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ erro: 'Método não permitido.' })
  }

  if (!liberado(req, res)) return

  try {
    const tipsters = await rest('protegidos_tipsters?select=id,nome&ativo=eq.true&order=nome.asc')
    res.setHeader('Cache-Control', 'no-store')
    return res.status(200).json({ tipsters })
  } catch (e) {
    console.error('tipsters:', e.message)
    return res.status(500).json({ erro: 'Não consegui carregar a lista de tipsters.' })
  }
}
