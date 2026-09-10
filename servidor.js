// Servidor local do formulário.
//
// Em produção quem atende `/api/**` é a Vercel. Este arquivo é o arremedo dela
// para desenvolvimento — mesmo contrato de req/res, para a função rodar aqui
// exatamente como roda lá, e um erro aparecer na sua máquina em vez de aparecer
// no deploy. É o mesmo papel que `vite-plugin-api-dev.js` faz no BI.
//
//   npm run dev   →   http://localhost:5174
//
// Não vai para a Vercel: lá o `index.html` é servido como estático e cada
// arquivo de `api/` vira uma função sozinha.

import { createServer } from 'node:http'
import { existsSync, readFileSync } from 'node:fs'
import { extname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const RAIZ = process.cwd()
const PORTA = Number(process.env.PORT || 5174)

// ── .env ─────────────────────────────────────────────────────────────────────

function carregarEnv() {
  const arquivo = resolve(RAIZ, '.env')
  if (!existsSync(arquivo)) {
    console.error('\n  Falta o arquivo .env nesta pasta.')
    console.error('  Copie o .env.example para .env e preencha as três variáveis.\n')
    process.exit(1)
  }
  for (const linha of readFileSync(arquivo, 'utf-8').split('\n')) {
    const m = linha.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/)
    if (!m) continue
    const [, chave, bruto] = m
    if (process.env[chave] !== undefined) continue
    process.env[chave] = bruto.trim().replace(/^["']|["']$/g, '')
  }

  const faltando = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'SESSAO_SEGREDO'].filter(
    (v) => !process.env[v],
  )
  if (faltando.length) {
    console.error(`\n  Faltam variáveis no .env: ${faltando.join(', ')}\n`)
    process.exit(1)
  }
}

// ── o arremedo do runtime da Vercel ─────────────────────────────────────────

function comoResposta(res) {
  res.status = (codigo) => {
    res.statusCode = codigo
    return res
  }
  res.json = (dados) => {
    if (!res.getHeader('Content-Type')) {
      res.setHeader('Content-Type', 'application/json; charset=utf-8')
    }
    res.end(JSON.stringify(dados))
    return res
  }
  res.send = (corpo) => {
    res.end(corpo)
    return res
  }
  return res
}

async function lerCorpo(req) {
  if (req.method === 'GET' || req.method === 'HEAD') return undefined
  const pedacos = []
  for await (const p of req) pedacos.push(p)
  const texto = Buffer.concat(pedacos).toString('utf-8')
  if (!texto) return undefined
  try {
    return JSON.parse(texto)
  } catch {
    return texto
  }
}

// O que este servidor entrega, e nada além disso.
const PUBLICOS = new Map([
  ['/', 'index.html'],
  ['/index.html', 'index.html'],
])

const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
}

// ── o servidor ──────────────────────────────────────────────────────────────

carregarEnv()

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost')

  if (url.pathname.startsWith('/api/')) {
    const arquivo = resolve(RAIZ, url.pathname.replace(/^\//, '') + '.js')

    // Sem esta checagem, "/api/../.env" leria qualquer arquivo do disco.
    if (!arquivo.startsWith(resolve(RAIZ, 'api')) || !existsSync(arquivo)) {
      res.statusCode = 404
      return res.end(JSON.stringify({ erro: 'função não encontrada: ' + url.pathname }))
    }

    try {
      // `?t=` derruba o cache de módulos do Node: dá para editar a função e ver
      // o efeito sem reiniciar o servidor.
      const mod = await import(pathToFileURL(arquivo).href + '?t=' + Date.now())
      req.query = Object.fromEntries(url.searchParams)
      req.body = await lerCorpo(req)
      await mod.default(req, comoResposta(res))
    } catch (err) {
      console.error(`[api] ${url.pathname}:`, err.stack || err.message)
      if (!res.writableEnded) {
        res.statusCode = 500
        res.end(JSON.stringify({ erro: err.message }))
      }
    }
    return
  }

  // Lista fechada, e não "qualquer arquivo dentro da pasta".
  //
  // A versão anterior resolvia o caminho pedido e só conferia se ele caía
  // dentro da raiz do projeto. `/api/../.env` passava: `new URL()` normaliza o
  // `..` ANTES desta função ver o caminho, então ele chegava aqui como `/.env`,
  // escapava do ramo de `/api/` e caía neste — e o `.env`, com a chave de
  // serviço dentro, está dentro da raiz. O servidor entregava a chave a
  // qualquer coisa que alcançasse esta porta.
  //
  // O front inteiro é um arquivo só, então a lista fechada não custa nada e
  // fecha a classe de problema, não só aquele caminho.
  if (!PUBLICOS.has(url.pathname)) {
    res.statusCode = 404
    return res.end('não encontrado')
  }

  const arquivo = resolve(RAIZ, PUBLICOS.get(url.pathname))
  if (!existsSync(arquivo)) {
    res.statusCode = 404
    return res.end('não encontrado')
  }

  res.setHeader('Content-Type', TIPOS[extname(arquivo)] ?? 'application/octet-stream')
  res.end(readFileSync(arquivo))
}).listen(PORTA, () => {
  console.log(`\n  Cadastro de Bingos Protegidos\n  http://localhost:${PORTA}\n`)
})
